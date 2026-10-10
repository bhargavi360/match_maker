import { z } from "zod";
import { idSchema, revisionSchema } from "./validation";

// Plain text only. Preserve exactly what the operator reviews, including whitespace.
const headerControls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const bodyControls = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
export const emailAddressSchema = z.email().max(254).refine(v => !headerControls.test(v));
export const emailTextSchema = z.strictObject({
  subject: z.string().min(1).max(200).refine(v => v.trim().length > 0 && !headerControls.test(v), "Use a nonempty subject without control characters."),
  body: z.string().min(1).max(10000).refine(v => v.trim().length > 0 && !bodyControls.test(v), "Use plain text without control characters; line feeds and tabs are allowed."),
});
export const createDraftSchema = z.strictObject({ workflowId: idSchema, recipient: z.enum(["SOURCE", "CANDIDATE"]) });
export const editDraftSchema = z.strictObject({ revision: revisionSchema, ...emailTextSchema.shape });
export const previewEmailSchema = z.strictObject({ revision: revisionSchema });
export const approveEmailSchema = z.strictObject({ revision: revisionSchema, previewToken: z.string().min(20).max(1600), confirmation: z.literal("APPROVE EMAIL") });
export const dispatchEmailSchema = z.strictObject({ revision: revisionSchema, confirmation: z.literal("SEND EMAIL") });
export const reconcileEmailSchema = z.strictObject({ revision: revisionSchema, providerMessageId: idSchema.optional(), confirmation: z.literal("RECONCILE EMAIL") });
export const cancelEmailSchema = z.strictObject({ revision: revisionSchema, confirmation: z.literal("CANCEL EMAIL") });
export const frozenEmailSchema = z.strictObject({
  deliveryId: idSchema, draftId: idSchema, draftRevision: revisionSchema,
  workflowId: idSchema, decisionId: idSchema, snapshotId: idSchema,
  sourceId: idSchema, candidateId: idSchema, recipientProfileId: idSchema,
  recipient: emailAddressSchema, from: emailAddressSchema, replyTo: emailAddressSchema.nullable(),
  ...emailTextSchema.shape,
});
export type FrozenEmail = z.infer<typeof frozenEmailSchema>;
export const deliveryStates = ["APPROVED", "DISPATCHING", "UNKNOWN", "ACCEPTED", "DELIVERY_DELAYED", "DELIVERED", "BOUNCED", "SUPPRESSED", "FAILED", "COMPLAINED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
export type DeliveryState = typeof deliveryStates[number];
export const eventTypes = ["email.sent", "email.delivery_delayed", "email.delivered", "email.bounced", "email.suppressed", "email.failed", "email.complained"] as const;
export type EmailEventType = typeof eventTypes[number];
const eventState: Record<EmailEventType, DeliveryState> = { "email.sent": "ACCEPTED", "email.delivery_delayed": "DELIVERY_DELAYED", "email.delivered": "DELIVERED", "email.bounced": "BOUNCED", "email.suppressed": "SUPPRESSED", "email.failed": "FAILED", "email.complained": "COMPLAINED" };
const ranks: Partial<Record<DeliveryState, number>> = { ACCEPTED: 1, DELIVERY_DELAYED: 2, DELIVERED: 3, FAILED: 3, SUPPRESSED: 3, BOUNCED: 3, COMPLAINED: 3 };
const ties: Partial<Record<DeliveryState, number>> = { DELIVERED: 1, FAILED: 2, SUPPRESSED: 3, BOUNCED: 4, COMPLAINED: 5 };
export function isProviderState(state: DeliveryState) { return !!ranks[state]; }
export type EvidenceState = { state: DeliveryState; evidenceAt: string | null; evidenceType: string | null };
// Terminal evidence dominates progress. Terminal contradictions use actual event time;
// an authenticated retrieval has no event timestamp and cannot overwrite a terminal event.
export function reduceEmailEvidence(current: EvidenceState, type: EmailEventType, at: string, source: "WEBHOOK" | "RECONCILIATION" = "WEBHOOK"): EvidenceState {
  const next = eventState[type], oldRank = ranks[current.state] ?? 0, rank = ranks[next]!;
  if (oldRank > rank || source === "RECONCILIATION" && oldRank === 3) return current;
  if (oldRank === rank && current.evidenceAt) {
    if (Date.parse(at) < Date.parse(current.evidenceAt)) return current;
    if (at === current.evidenceAt && (ties[next] ?? 0) <= (ties[current.state] ?? 0)) return current;
  }
  return { state: next, evidenceAt: at, evidenceType: source + ":" + type };
}
export const stateDescriptions: Record<DeliveryState, string> = {
  APPROVED: "Exact message approved; no submission has occurred.", DISPATCHING: "A durable attempt holds a short lease. Outcome is pending.", UNKNOWN: "Submission may have occurred. Provider evidence is required; do not create a replacement send.",
  ACCEPTED: "Resend accepted the request. Delivery is not yet confirmed.", DELIVERY_DELAYED: "Provider evidence reports a temporary delivery delay.", DELIVERED: "Provider evidence says the recipient’s mail server accepted the message. Reading is not confirmed.",
  BOUNCED: "Provider evidence reports permanent rejection by the recipient’s mail server.", SUPPRESSED: "Provider evidence reports suppression.", FAILED: "Provider evidence reports a sending failure.", COMPLAINED: "Provider evidence reports a spam complaint. Do not resend this introduction.",
  REJECTED: "The provider definitively rejected this submission request.", CANCELLED: "Unsent approval invalidated or explicitly cancelled. This never cancels an accepted request.", EXPIRED: "Unsent approval expired. Review and approve a new snapshot.",
};
export type ProviderStatus = { ready: boolean; senderReady: boolean; webhookReady: boolean; testMode: boolean; issues: string[] };
export type DraftDTO = { id: string; workflowId: string; recipientProfileId: string; recipientName: string; revision: number; subject: string; body: string; provenance: string; updatedAt: string };
export type DeliveryDTO = { id: string; draftId: string; draftRevision: number; workflowId: string; revision: number; state: DeliveryState; description: string; approvedAt: string; expiresAt: string; updatedAt: string; providerMessageId: string | null; attemptCount: number; retryUntil: string | null; evidenceAt: string | null; evidenceType: string | null; canDispatch: boolean; canRetry: boolean; canReconcile: boolean; canCancel: boolean; blockReason: string | null; attempts: { number: number; operationId: string; startedAt: string; finishedAt: string | null; outcome: string; errorCode: string | null }[]; events: { id: string; type: string; source: string; occurredAt: string; receivedAt: string }[] };
export type EmailWorkspace = { workflowId: string | null; drafts: DraftDTO[]; deliveries: DeliveryDTO[]; hasMoreDrafts: boolean; hasMoreDeliveries: boolean; provider: ProviderStatus; workflowValid: boolean; workflowReason: string | null; recipients: { role: "SOURCE" | "CANDIDATE"; name: string }[] };
export type ApprovalPreview = { payload: FrozenEmail; digest: string; previewToken: string };
