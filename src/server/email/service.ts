import "server-only";
import { inTransaction } from "../transaction";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { EmailDelivery, EmailDraft, Prisma } from "@/generated/prisma/client";
import { approveEmailSchema, cancelEmailSchema, createDraftSchema, dispatchEmailSchema, editDraftSchema, emailTextSchema, frozenEmailSchema, isProviderState, previewEmailSchema, reconcileEmailSchema, reduceEmailEvidence, stateDescriptions, type ApprovalPreview, type DeliveryDTO, type DeliveryState, type DraftDTO, type EmailEventType, type EmailWorkspace, type FrozenEmail } from "@/domain/email";
import { idSchema } from "@/domain/validation";
import { requireMatchmaker } from "../auth";
import { decryptPrivate, encryptPrivate } from "../contacts";
import { db } from "../db";
import { AppError } from "../errors";
import { resolveEmailRecipient } from "../profiles";
import { rateLimit } from "../security";
import { requireApprovedWorkflow } from "../workflows";
import { boundedRawBody, providerConfiguration, resendProvider, verifyProviderWebhook, type EmailProvider, type SendResult } from "./resend";

type Tx = Prisma.TransactionClient;
const APPROVAL_MS = 60 * 60 * 1000, RETRY_MS = 23 * 60 * 60 * 1000, LEASE_MS = 30000;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function payloadDigest(payload: FrozenEmail) { return digest(frozenEmailSchema.parse(payload)); }
export function localDraftContent(sourceName: string, candidateName: string, recipient: "SOURCE" | "CANDIDATE") {
  const name = recipient === "SOURCE" ? sourceName : candidateName, other = recipient === "SOURCE" ? candidateName : sourceName;
  // Names are body data, never headers. This shared preview is the actual local template.
  return emailTextSchema.parse({ subject: "A thoughtful introduction", body: "Hello " + name + ",\n\nI would like to introduce you to " + other + ". If you are comfortable, please reply so we can discuss a suitable introduction.\n\nWarm regards,\nYour matchmaker" });
}
function fail(message: string, status = 409): never { throw new AppError(status, message, "EMAIL_BOUNDARY"); }
async function transaction<T>(work: (tx: Tx) => Promise<T>, existingTx?: Tx) {
  try { return await inTransaction(work, existingTx); }
  catch (error) { if (error && typeof error === "object" && "code" in error && ["P2002", "P2034", "P2028"].includes(String(error.code))) fail("Email state changed in another request. Reload before continuing."); throw error; }
}
async function audit(tx: Tx, action: string, actorId: string | null, entityId: string, fields: Record<string, string | number | boolean | null> = {}) { await tx.auditEvent.create({ data: { action, actorId, entityId, fields } }); }
function text(row: EmailDraft) { return emailTextSchema.parse(decryptPrivate("email-draft:" + row.id, row)); }
function frozen(row: EmailDelivery) {
  const payload = frozenEmailSchema.parse(decryptPrivate("email-delivery:" + row.id, { keyId: row.keyId, ciphertext: row.payloadCiphertext }));
  if (payloadDigest(payload) !== row.payloadDigest || payload.deliveryId !== row.id || payload.draftId !== row.originalDraftId || payload.draftRevision !== row.draftRevision || payload.workflowId !== row.workflowId || payload.recipientProfileId !== row.recipientProfileId || payload.decisionId !== row.decisionId || payload.snapshotId !== row.snapshotId) fail("Approved message integrity could not be verified.", 503);
  return payload;
}
// Validate a canary ciphertext before writing under a configured key. A replacement
// key/ID must fail visibly; it must never silently start a separate unreadable set.
async function assertKey(tx: Tx) {
  const [draft, delivery, contact] = await Promise.all([tx.emailDraft.findFirst({ orderBy: { createdAt: "asc" } }), tx.emailDelivery.findFirst({ orderBy: { createdAt: "asc" } }), tx.profileContact.findFirst()]);
  if (draft) text(draft); if (delivery) frozen(delivery);
  if (contact) decryptPrivate(contact.profileId, contact);
  encryptPrivate("email-key-validation", { valid: true });
}
async function readDraft(tx: Tx, id: string, ownerId?: string) { const row = await tx.emailDraft.findFirst({ where: { id, ...(ownerId ? { workflow: { source: { ownerId } } } : {}) } }); if (!row) fail("Draft not found.", 404); return row; }
async function readDelivery(tx: Tx, id: string, ownerId?: string) { const row = await tx.emailDelivery.findUnique({ where: { id } }); if (!row || ownerId && !await tx.workflow.count({ where: { id: row.workflowId, source: { ownerId } } })) fail("Delivery not found.", 404); return row; }
async function draftDTO(tx: Tx, row: EmailDraft): Promise<DraftDTO> { const recipient = await tx.profile.findUniqueOrThrow({ where: { id: row.recipientProfileId }, select: { displayName: true } }); return { id: row.id, workflowId: row.workflowId, recipientProfileId: row.recipientProfileId, recipientName: recipient.displayName, revision: row.revision, ...text(row), provenance: row.provenance, updatedAt: row.updatedAt.toISOString() }; }
const tokenClaims = z.strictObject({ deliveryId: idSchema, draftId: idSchema, revision: z.number().int().positive(), actorId: z.string().min(1).max(100), digest: z.string().regex(/^[a-f0-9]{64}$/), expires: z.number().int() });
function signingKey() { const key = process.env.BETTER_AUTH_SECRET ?? ""; if (key.length < 32) fail("Approval verification is unavailable.", 503); return key; }
function signToken(value: z.infer<typeof tokenClaims>) { const data = Buffer.from(JSON.stringify(value)).toString("base64url"); return data + "." + createHmac("sha256", signingKey()).update(data).digest("base64url"); }
function verifyToken(token: string, actorId: string, now: number) {
  try { const parts = token.split("."); if (parts.length !== 2) throw new Error(); const expected = createHmac("sha256", signingKey()).update(parts[0]).digest(), actual = Buffer.from(parts[1], "base64url"); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error(); const claims = tokenClaims.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"))); if (claims.actorId !== actorId || claims.expires <= now || claims.expires > now + 120000) throw new Error(); return claims; } catch { fail("Approval preview expired or changed. Review the exact message again."); }
}
export function createEmailService(options: { provider?: EmailProvider; now?: () => number; beforePersist?: () => Promise<void> } = {}) {
  if (Object.keys(options).length && process.env.MATCHMAKER_TEST_MODE !== "1") throw new Error("Email test injection is restricted to test mode.");
  const provider = options.provider ?? resendProvider, now = options.now ?? Date.now, config = () => providerConfiguration(!!options.provider);
  const transportDigest = () => createHmac("sha256", signingKey()).update("resend-transport:" + config().key).digest("hex");
  async function build(headers: Headers, tx: Tx, row: EmailDraft, deliveryId: string): Promise<FrozenEmail> {
    const workflow = await requireApprovedWorkflow(headers, tx, row.workflowId);
    if (workflow.decisionId !== row.decisionId || workflow.snapshotId !== row.snapshotId || ![workflow.sourceId, workflow.candidateId].includes(row.recipientProfileId)) fail("This draft belongs to an earlier pair decision. Create a fresh draft for the current approved match.");
    const sender = config(); if (!sender.status.senderReady || !sender.from) fail("Configure valid sender/reply-to identities and APP_ORIGIN before approving. Local drafts and export remain available.", 503);
    const recipient = await resolveEmailRecipient(headers, tx, row.recipientProfileId);
    return frozenEmailSchema.parse({ deliveryId, draftId: row.id, draftRevision: row.revision, workflowId: row.workflowId, decisionId: row.decisionId, snapshotId: row.snapshotId, sourceId: workflow.sourceId, candidateId: workflow.candidateId, recipientProfileId: row.recipientProfileId, recipient, from: sender.from, replyTo: sender.replyTo, ...text(row) });
  }
  async function currentPayload(headers: Headers, tx: Tx, row: EmailDelivery) {
    if (row.transportKeyDigest && row.transportKeyDigest !== transportDigest()) fail("Provider credentials changed after the first attempt. Restore the original account credentials for retry or reconciliation.");
    if (!row.draftId) fail("The draft or its profiles were deleted. This retained delivery can only be reconciled.");
    const approved = frozen(row), draft = await readDraft(tx, row.draftId), current = await build(headers, tx, draft, row.id);
    if (payloadDigest(current) !== row.payloadDigest) fail("Recipient, sender, draft or match evidence changed. The unsent approval is stale; review a new snapshot.");
    return approved;
  }
  async function update(tx: Tx, row: EmailDelivery, data: Prisma.EmailDeliveryUpdateManyMutationInput) {
    const changed = await tx.emailDelivery.updateMany({ where: { id: row.id, revision: row.revision }, data: { ...data, revision: { increment: 1 } } }); if (changed.count !== 1) fail("Delivery changed. Reload before continuing."); return readDelivery(tx, row.id);
  }
  async function recover(tx: Tx, row: EmailDelivery, actorId: string) {
    if (!row.leaseUntil || row.leaseUntil.valueOf() > now()) return row;
    await tx.emailSendAttempt.updateMany({ where: { deliveryId: row.id, outcome: "PENDING", finishedAt: null }, data: { outcome: "UNKNOWN", errorCode: "LEASE_EXPIRED", finishedAt: new Date(now()) } });
    const saved = await update(tx, row, { leaseToken: null, leaseUntil: null, state: isProviderState(row.state as DeliveryState) ? row.state : "UNKNOWN" });
    await audit(tx, "EMAIL_LEASE_RECOVERED", actorId, row.id, { outcome: saved.state }); return saved;
  }
  async function expire(tx: Tx, draftId: string, actorId: string) {
    const rows = await tx.emailDelivery.findMany({ where: { originalDraftId: draftId, state: "APPROVED", attemptCount: 0, expiresAt: { lte: new Date(now()) } } });
    for (const row of rows) { await update(tx, row, { state: "EXPIRED" }); await audit(tx, "EMAIL_APPROVAL_EXPIRED", actorId, row.id); }
  }
  async function deliveryDTO(headers: Headers, tx: Tx, row: EmailDelivery): Promise<DeliveryDTO> {
    let state = row.state as DeliveryState;
    const activeLease = !!row.leaseUntil && row.leaseUntil.valueOf() > now();
    if (state === "DISPATCHING" && !activeLease) state = "UNKNOWN";
    if (state === "APPROVED" && row.expiresAt.valueOf() <= now()) state = "EXPIRED";
    let blockReason: string | null = null;
    const candidate = state === "APPROVED" || state === "UNKNOWN";
    if (candidate) {
      if (!config().status.ready) blockReason = "Sending is disabled until provider configuration is valid.";
      else if (row.expiresAt.valueOf() <= now()) blockReason = "Original email approval expired. An uncertain send must be reconciled; it cannot be reapproved.";
      else if (state === "UNKNOWN" && row.providerMessageId) blockReason = "A provider identifier is already bound. Reconcile its evidence instead of submitting again.";
      else if (state === "UNKNOWN" && (row.retryBlocked || !row.retryUntil || row.retryUntil.valueOf() <= now())) blockReason = "Safe retry window closed or key conflict detected. Use manual reconciliation.";
      else if (activeLease) blockReason = "Another operation holds the delivery lease.";
      else try { await currentPayload(headers, tx, row); } catch (error) { blockReason = error instanceof AppError ? error.message : "Current approval cannot be verified."; }
    }
    const [attempts, events] = await Promise.all([tx.emailSendAttempt.findMany({ where: { deliveryId: row.id }, take: 20, orderBy: { number: "desc" } }), tx.emailProviderEvent.findMany({ where: { deliveryId: row.id }, take: 30, orderBy: [{ occurredAt: "desc" }, { id: "asc" }] })]);
    return { id: row.id, draftId: row.originalDraftId, draftRevision: row.draftRevision, workflowId: row.workflowId, revision: row.revision, state, description: stateDescriptions[state], approvedAt: row.approvedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), updatedAt: row.updatedAt.toISOString(), providerMessageId: row.providerMessageId, attemptCount: row.attemptCount, retryUntil: row.retryUntil?.toISOString() ?? null, evidenceAt: row.evidenceAt?.toISOString() ?? null, evidenceType: row.evidenceType, canDispatch: state === "APPROVED" && !blockReason, canRetry: state === "UNKNOWN" && !blockReason, canCancel: row.attemptCount === 0 && row.state === "APPROVED" && !activeLease, canReconcile: row.attemptCount > 0 && !activeLease && config().status.ready, blockReason, attempts: attempts.map(a => ({ number: a.number, operationId: a.operationId, startedAt: a.startedAt.toISOString(), finishedAt: a.finishedAt?.toISOString() ?? null, outcome: a.outcome, errorCode: a.errorCode })), events: events.map(e => ({ id: e.id, type: e.type, source: e.source, occurredAt: e.occurredAt.toISOString(), receivedAt: e.receivedAt.toISOString() })) };
  }
  async function applyEvidence(tx: Tx, row: EmailDelivery, type: EmailEventType, occurredAt: Date, source: "WEBHOOK" | "RECONCILIATION", actorId: string | null) {
    const previous = { state: row.state as DeliveryState, evidenceAt: row.evidenceAt?.toISOString() ?? null, evidenceType: row.evidenceType }, next = reduceEmailEvidence(previous, type, occurredAt.toISOString(), source);
    if (JSON.stringify(previous) === JSON.stringify(next)) return row;
    const saved = await update(tx, row, { state: next.state, evidenceAt: new Date(next.evidenceAt!), evidenceType: next.evidenceType });
    await audit(tx, "EMAIL_STATE_CHANGED", actorId, row.id, { previous: row.state, outcome: next.state, evidence: type }); return saved;
  }
  async function associate(tx: Tx, row: EmailDelivery, providerId: string, actorId: string | null) {
    if (row.providerMessageId && row.providerMessageId !== providerId) fail("Provider evidence conflicts with the existing message identifier.");
    if (!row.providerMessageId) row = await update(tx, row, { providerMessageId: providerId });
    const events = await tx.emailProviderEvent.findMany({ where: { providerMessageId: providerId, OR: [{ deliveryId: null }, { deliveryId: row.id }] }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
    for (const event of events) {
      if (event.deliveryTag && event.deliveryTag !== row.id) continue;
      if (!event.deliveryId) await tx.emailProviderEvent.update({ where: { id: event.id }, data: { deliveryId: row.id } });
      row = await applyEvidence(tx, row, event.type as EmailEventType, event.occurredAt, event.source as "WEBHOOK" | "RECONCILIATION", actorId);
    }
    return row;
  }
  const service = {
    async workspace(headers: Headers, input: unknown = {}): Promise<EmailWorkspace> {
      const actor = await requireMatchmaker(headers);
      const { workflowId, draftPage, deliveryPage } = z.strictObject({ workflowId: idSchema.optional(), draftPage: z.coerce.number().int().min(1).max(10000).default(1), deliveryPage: z.coerce.number().int().min(1).max(10000).default(1) }).parse(input);
      return transaction(async tx => {
        let workflowValid = false, workflowReason: string | null = "Choose a saved human-approved workflow to create drafts.", recipients: EmailWorkspace["recipients"] = [];
        if (workflowId) try { const workflow = await requireApprovedWorkflow(headers, tx, workflowId); workflowValid = true; workflowReason = null; recipients = [{ role: "SOURCE", name: workflow.sourceName }, { role: "CANDIDATE", name: workflow.candidateName }]; } catch (error) { if (!(error instanceof AppError)) throw error; workflowReason = error.message; }
        const ownedWorkflows = await tx.workflow.findMany({ where: { source: { ownerId: actor.id } }, select: { id: true } });
        const workflowIds = ownedWorkflows.map(row => row.id);
        const scopedWorkflowIds = workflowId && workflowIds.includes(workflowId) ? [workflowId] : workflowId ? [] : workflowIds;
        const [drafts, deliveries] = await Promise.all([workflowId && scopedWorkflowIds.length ? tx.emailDraft.findMany({ where: { workflowId, workflow: { source: { ownerId: actor.id } } }, take: 21, skip: (draftPage - 1) * 20, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }) : Promise.resolve([]), tx.emailDelivery.findMany({ where: { workflowId: { in: scopedWorkflowIds } }, take: 21, skip: (deliveryPage - 1) * 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }] })]);
        return { workflowId: workflowId ?? null, drafts: await Promise.all(drafts.slice(0,20).map(d => draftDTO(tx, d))), deliveries: await Promise.all(deliveries.slice(0,20).map(d => deliveryDTO(headers, tx, d))), hasMoreDrafts: drafts.length > 20, hasMoreDeliveries: deliveries.length > 20, provider: config().status, workflowValid, workflowReason, recipients };
      });
    },
    async getDraft(headers: Headers, id: string, existingTx?: Tx) {
      const actor = await requireMatchmaker(headers); idSchema.parse(id);
      return transaction(async tx => draftDTO(tx, await readDraft(tx, id, actor.id)), existingTx);
    },
    async createDraft(headers: Headers, input: unknown, existingTx?: Tx) {
      const actor = await requireMatchmaker(headers), request = createDraftSchema.parse(input);
      return transaction(async tx => {
        await assertKey(tx); const workflow = await requireApprovedWorkflow(headers, tx, request.workflowId), id = randomUUID();
        const content = localDraftContent(workflow.sourceName, workflow.candidateName, request.recipient);
        const row = await tx.emailDraft.create({ data: { id, workflowId: workflow.id, recipientProfileId: request.recipient === "SOURCE" ? workflow.sourceId : workflow.candidateId, decisionId: workflow.decisionId, snapshotId: workflow.snapshotId, ...encryptPrivate("email-draft:" + id, content) } });
        await audit(tx, "EMAIL_DRAFT_CREATED", actor.id, id, { workflowId: workflow.id, revision: 1, provenance: "LOCAL_TEMPLATE" }); return draftDTO(tx, row);
      }, existingTx);
    },
    async editDraft(headers: Headers, id: string, input: unknown, existingTx?: Tx) {
      const actor = await requireMatchmaker(headers); idSchema.parse(id); const request = editDraftSchema.parse(input);
      return transaction(async tx => {
        await assertKey(tx); const row = await readDraft(tx, id, actor.id); if (row.revision !== request.revision) fail("Draft changed in another tab. Reload before saving.");
        const workflow = await requireApprovedWorkflow(headers, tx, row.workflowId); if (workflow.decisionId !== row.decisionId) fail("This draft belongs to an earlier decision. Create a new draft after fresh match review.");
        const encrypted = encryptPrivate("email-draft:" + id, { subject: request.subject, body: request.body });
        const changed = await tx.emailDraft.updateMany({ where: { id, revision: request.revision }, data: { ...encrypted, revision: { increment: 1 }, provenance: "MANUAL" } }); if (changed.count !== 1) fail("Draft changed. Reload it.");
        const approvals = await tx.emailDelivery.findMany({ where: { originalDraftId: id, state: "APPROVED", attemptCount: 0 } });
        for (const approval of approvals) { await update(tx, approval, { state: "CANCELLED" }); await audit(tx, "EMAIL_APPROVAL_INVALIDATED", actor.id, approval.id, { reason: "DRAFT_EDITED" }); }
        await audit(tx, "EMAIL_DRAFT_EDITED", actor.id, id, { revision: row.revision + 1 }); return draftDTO(tx, await readDraft(tx, id, actor.id));
      }, existingTx);
    },
    async previewApproval(headers: Headers, id: string, input: unknown): Promise<ApprovalPreview> {
      const actor = await requireMatchmaker(headers); idSchema.parse(id); const request = previewEmailSchema.parse(input);
      return transaction(async tx => { const row = await readDraft(tx, id, actor.id); if (row.revision !== request.revision) fail("Draft changed. Reload it before review."); const payload = await build(headers, tx, row, randomUUID()), hash = payloadDigest(payload); return { payload, digest: hash, previewToken: signToken({ deliveryId: payload.deliveryId, draftId: row.id, revision: row.revision, actorId: actor.id, digest: hash, expires: now() + 120000 }) }; });
    },
    async approve(headers: Headers, id: string, input: unknown) {
      const actor = await requireMatchmaker(headers); idSchema.parse(id); const request = approveEmailSchema.parse(input), claims = verifyToken(request.previewToken, actor.id, now());
      if (claims.draftId !== id || claims.revision !== request.revision) fail("Review the exact draft and revision you are approving.");
      return transaction(async tx => {
        await assertKey(tx); const draft = await readDraft(tx, id, actor.id); if (draft.revision !== request.revision) fail("Draft changed. Review it again.");
        const payload = await build(headers, tx, draft, claims.deliveryId); if (payloadDigest(payload) !== claims.digest) fail("Message, recipient, sender or match decision changed since preview. Review the exact message again.");
        await expire(tx, id, actor.id);
        if (await tx.emailDelivery.count({ where: { recipientProfileId: draft.recipientProfileId, state: { in: ["UNKNOWN", "DISPATCHING"] } } })) fail("An unresolved send to this recipient blocks a replacement approval, including a new draft. Reconcile its provider evidence first.");
        const encrypted = encryptPrivate("email-delivery:" + payload.deliveryId, payload);
        const row = await tx.emailDelivery.create({ data: { id: payload.deliveryId, draftId: id, originalDraftId: id, draftRevision: draft.revision, workflowId: draft.workflowId, recipientProfileId: draft.recipientProfileId, decisionId: draft.decisionId, snapshotId: draft.snapshotId, payloadCiphertext: encrypted.ciphertext, keyId: encrypted.keyId, payloadDigest: claims.digest, approvedBy: actor.id, approvedAt: new Date(now()), expiresAt: new Date(now() + APPROVAL_MS), idempotencyKey: "matchmaker-email/" + payload.deliveryId } });
        await audit(tx, "EMAIL_APPROVED", actor.id, row.id, { draftId: id, draftRevision: draft.revision, workflowId: draft.workflowId }); return deliveryDTO(headers, tx, row);
      });
    },
    async getDelivery(headers: Headers, id: string) { const actor = await requireMatchmaker(headers); idSchema.parse(id); return transaction(async tx => deliveryDTO(headers, tx, await readDelivery(tx, id, actor.id))); },
    async previewDelivery(headers: Headers, id: string) { const actor = await requireMatchmaker(headers); idSchema.parse(id); return transaction(async tx => { const row = await readDelivery(tx, id, actor.id); await audit(tx, "EMAIL_PAYLOAD_VIEWED", actor.id, id); return { payload: frozen(row), delivery: await deliveryDTO(headers, tx, row) }; }); },
    async cancel(headers: Headers, id: string, input: unknown) {
      const actor = await requireMatchmaker(headers); idSchema.parse(id); const request = cancelEmailSchema.parse(input);
      return transaction(async tx => { const row = await readDelivery(tx, id, actor.id); if (row.revision !== request.revision || row.attemptCount !== 0 || row.state !== "APPROVED" || row.leaseToken) fail("Only an unsent approval can be cancelled."); const saved = await update(tx, row, { state: "CANCELLED" }); await audit(tx, "EMAIL_CANCELLED", actor.id, id); return deliveryDTO(headers, tx, saved); });
    },
    async dispatch(headers: Headers, id: string, input: unknown) {
      const actor = await requireMatchmaker(headers); idSchema.parse(id); const request = dispatchEmailSchema.parse(input);
      if (!config().status.ready) fail("Email transport is unconfigured. Draft copy/export remains available.", 503);
      await rateLimit("email", 30);
      const claim = await transaction(async tx => {
        let row = await readDelivery(tx, id, actor.id); if (row.revision !== request.revision) fail("Delivery changed. Reload before sending.");
        row = await recover(tx, row, actor.id);
        if (row.leaseToken) fail("Another operation is using this delivery. Wait for its lease to finish.");
        if (!["APPROVED", "UNKNOWN"].includes(row.state)) fail("This delivery cannot be submitted again. Its durable state prevents duplicate sends.");
        if (row.state === "UNKNOWN" && row.providerMessageId) fail("A provider identifier is already bound. Reconcile provider evidence instead of retrying submission.");
        if (row.expiresAt.valueOf() <= now()) {
          if (row.attemptCount === 0) { await update(tx, row, { state: "EXPIRED" }); await audit(tx, "EMAIL_APPROVAL_EXPIRED", actor.id, id); return { expired: true as const }; }
          fail("Original approval expired. Reconcile the uncertain send; a replacement is blocked.");
        }
        if (row.attemptCount && (row.retryBlocked || !row.retryUntil || row.retryUntil.valueOf() <= now())) fail("Safe retry window closed or key conflict detected. Manual reconciliation is required.");
        const payload = await currentPayload(headers, tx, row), operationId = randomUUID(), date = new Date(now());
        const saved = await update(tx, row, { state: "DISPATCHING", leaseToken: operationId, leaseUntil: new Date(now() + LEASE_MS), attemptCount: { increment: 1 }, ...(!row.firstAttemptAt ? { firstAttemptAt: date, retryUntil: new Date(now() + RETRY_MS), transportKeyDigest: transportDigest() } : {}) });
        await tx.emailSendAttempt.create({ data: { deliveryId: id, number: saved.attemptCount, operationId, startedAt: date } });
        await audit(tx, "EMAIL_DISPATCH_ATTEMPT", actor.id, id, { number: saved.attemptCount, operationId });
        return { payload, operationId, key: saved.idempotencyKey, number: saved.attemptCount };
      });
      if ("expired" in claim) fail("Email approval expired. Review and approve a new snapshot.");
      let result: SendResult;
      try { result = await provider.send(claim.payload, claim.key); } catch { result = { outcome: "UNKNOWN", errorCode: "NETWORK_UNCERTAIN" }; }
      // A later request's rejection never proves that an earlier ambiguous request failed.
      if (result.outcome === "REJECTED" && claim.number > 1) result = { outcome: "UNKNOWN", errorCode: "RETRY_REJECTED_UNRESOLVED" };
      const evidence = result;
      try {
        await options.beforePersist?.();
        return await transaction(async tx => {
          let row = await readDelivery(tx, id, actor.id);
          // Preserve late evidence even if manual lease recovery has happened meanwhile.
          const attempt = await tx.emailSendAttempt.findUniqueOrThrow({ where: { operationId: claim.operationId } });
          if (!attempt.finishedAt) await tx.emailSendAttempt.update({ where: { id: attempt.id }, data: { outcome: evidence.outcome, finishedAt: new Date(now()), ...(evidence.outcome === "ACCEPTED" ? { providerMessageId: evidence.providerMessageId } : { errorCode: evidence.errorCode }) } });
          if (evidence.outcome === "ACCEPTED") {
            row = await associate(tx, row, idSchema.parse(evidence.providerMessageId), actor.id);
            if (!isProviderState(row.state as DeliveryState)) row = await update(tx, row, { state: "ACCEPTED", evidenceAt: new Date(now()), evidenceType: "SUBMISSION_ACCEPTED" });
          } else if (!isProviderState(row.state as DeliveryState)) row = await update(tx, row, { state: evidence.outcome, retryBlocked: evidence.retryBlocked ?? row.retryBlocked });
          if (row.leaseToken === claim.operationId) row = await update(tx, row, { leaseToken: null, leaseUntil: null });
          await audit(tx, "EMAIL_SUBMISSION_EVIDENCE", actor.id, id, { outcome: evidence.outcome, operationId: claim.operationId });
          return deliveryDTO(headers, tx, row);
        });
      } catch {
        // Claim/key/attempt committed before the network. Never report transient acceptance
        // as success without a durable result. Best effort uncertainty; lease expiry recovers it.
        try { await transaction(async tx => { let row = await readDelivery(tx, id, actor.id); if (row.leaseToken !== claim.operationId) return; if (!isProviderState(row.state as DeliveryState)) row = await update(tx, row, { state: "UNKNOWN" }); row = await update(tx, row, { leaseToken: null, leaseUntil: null }); await tx.emailSendAttempt.updateMany({ where: { operationId: claim.operationId, finishedAt: null }, data: { outcome: "UNKNOWN", finishedAt: new Date(now()), errorCode: "LOCAL_PERSISTENCE_UNCERTAIN" } }); await audit(tx, "EMAIL_PERSISTENCE_UNCERTAIN", actor.id, id); }); } catch { /* expired lease and durable attempt remain recovery evidence */ }
        throw new AppError(503, "Outcome is uncertain. Reload the delivery and reconcile provider evidence. Do not create a replacement message.", "EMAIL_UNKNOWN");
      }
    },
    async reconcile(headers: Headers, id: string, input: unknown) {
      const actor = await requireMatchmaker(headers); idSchema.parse(id); const request = reconcileEmailSchema.parse(input);
      if (!config().status.ready) fail("Provider configuration is required for authenticated reconciliation.", 503);
      await rateLimit("email", 30);
      const claim = await transaction(async tx => {
        let row = await readDelivery(tx, id, actor.id); if (row.revision !== request.revision) fail("Delivery changed. Reload before reconciliation."); row = await recover(tx, row, actor.id);
        if (!row.attemptCount || row.leaseToken) fail("Only an attempted delivery without an active operation lease can be reconciled.");
        if (row.providerMessageId && request.providerMessageId && row.providerMessageId !== request.providerMessageId) fail("Use the already-bound provider identifier.");
        const providerId = row.providerMessageId ?? request.providerMessageId; if (!providerId) fail("Find the message identifier in the provider dashboard, then submit it for authenticated exact-message verification.", 422);
        const payload = frozen(row), operationId = randomUUID(); row = await update(tx, row, { leaseToken: operationId, leaseUntil: new Date(now() + LEASE_MS) });
        await audit(tx, "EMAIL_RECONCILIATION_STARTED", actor.id, id, { operationId }); return { operationId, payload, providerId };
      });
      let found: Awaited<ReturnType<EmailProvider["get"]>> = null;
      try { found = await provider.get(claim.providerId); } catch { /* no authoritative evidence */ }
      return transaction(async tx => {
        let row = await readDelivery(tx, id, actor.id); if (row.leaseToken !== claim.operationId) fail("Reconciliation lease changed. Reload the persisted evidence.");
        const payload = claim.payload;
        const matches = found && found.id === claim.providerId && found.from === payload.from && JSON.stringify(found.to) === JSON.stringify([payload.recipient]) && found.subject === payload.subject && found.text === payload.body && JSON.stringify(found.reply_to) === JSON.stringify(payload.replyTo ? [payload.replyTo] : []) && found.tags.some(tag => tag.name === "delivery_id" && tag.value === row.id);
        const types: Record<string, EmailEventType> = { sent: "email.sent", queued: "email.sent", delivered: "email.delivered", delivery_delayed: "email.delivery_delayed", bounced: "email.bounced", suppressed: "email.suppressed", failed: "email.failed", complained: "email.complained" };
        const type = matches && found ? types[found.last_event] : undefined;
        if (matches) {
          row = await associate(tx, row, claim.providerId, actor.id);
          if (type) {
            await tx.emailProviderEvent.create({ data: { id: "reconcile_" + claim.operationId, providerMessageId: claim.providerId, type, source: "RECONCILIATION", occurredAt: new Date(now()), receivedAt: new Date(now()), deliveryId: id, deliveryTag: id, evidenceDigest: digest({ providerId: claim.providerId, type, operationId: claim.operationId }) } });
            row = await applyEvidence(tx, row, type, new Date(now()), "RECONCILIATION", actor.id);
          }
        }
        row = await update(tx, row, { leaseToken: null, leaseUntil: null });
        await audit(tx, "EMAIL_RECONCILIATION_FINISHED", actor.id, id, { operationId: claim.operationId, evidenceMatched: !!matches, recognizedState: !!type, outcome: row.state });
        return deliveryDTO(headers, tx, row);
      });
    },
    async webhook(request: Request) {
      const raw = await boundedRawBody(request), event = verifyProviderWebhook(raw, request.headers), hash = createHash("sha256").update(raw).digest("hex");
      const duplicate = await db().emailProviderEvent.findUnique({ where: { id: event.id } });
      if (duplicate) { if (duplicate.evidenceDigest !== hash) fail("Invalid webhook.", 400); await audit(db(), "EMAIL_WEBHOOK_DEDUPLICATED", null, event.id); return { ok: true, duplicate: true }; }
      // Invalid signatures cannot exhaust the legitimate provider budget. Retries of
      // stored IDs bypass it; fresh verified events get a high, fixed shared bucket.
      await rateLimit("email-webhook", 1000, 60000);
      try {
        return await db().$transaction(async tx => {
          let row = await tx.emailDelivery.findUnique({ where: { providerMessageId: event.providerMessageId } });
          if (row && event.deliveryTag && event.deliveryTag !== row.id) row = null;
          // Tags alone do not bind an unknown provider ID. An authenticated get verifies
          // exact message identity before using an early unmatched event.
          await tx.emailProviderEvent.create({ data: { ...event, source: "WEBHOOK", receivedAt: new Date(now()), deliveryId: row?.id ?? null, evidenceDigest: hash } });
          await audit(tx, "EMAIL_WEBHOOK_STORED", null, event.id, { type: event.type, linked: !!row });
          if (row) await applyEvidence(tx, row, event.type, event.occurredAt, "WEBHOOK", null);
          return { ok: true, duplicate: false };
        });
      } catch (error) {
        const saved = await db().emailProviderEvent.findUnique({ where: { id: event.id } });
        if (saved?.evidenceDigest === hash) { await audit(db(), "EMAIL_WEBHOOK_DEDUPLICATED", null, event.id); return { ok: true, duplicate: true }; }
        throw error;
      }
    },
  };
  return service;
}
export const emailService = createEmailService();
