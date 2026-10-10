import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { profiles as syntheticProfiles } from "@/data/preview";
import { profileSchema, profileReviewStatusSchema, preferenceSchema, contactSchema, consentSchema, idSchema, revisionSchema } from "@/domain/validation";
import type { ConsentScope, ProfileDTO, ProfileDetail } from "@/domain/types";
import type { Prisma, Profile } from "@/generated/prisma/client";
import { db } from "./db";
import { requireMatchmaker } from "./auth";
import { encryptContact, decryptContact } from "./contacts";
import { AppError } from "./errors";
import { inTransaction } from "./transaction";
type Tx = Prisma.TransactionClient;
function dto(profile: Profile): ProfileDTO {
  return { id: profile.id, kind: profile.kind as ProfileDTO["kind"], status: profile.status as ProfileDTO["status"], reviewStatus: profileReviewStatusSchema.parse(profile.reviewStatus), demoKey: profile.demoKey, revision: profile.revision, ...profileSchema.parse(profileCore(profile)), createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString() };
}
function profileCore(profile: Profile) {
  return Object.fromEntries(Object.keys(profileSchema.shape).map(key => [key, profile[key as keyof Profile]]));
}
async function audit(tx: Tx, action: string, actorId: string, entityId: string | null, fields: string[]) {
  await tx.auditEvent.create({ data: { action, actorId, entityId, fields } });
}
async function claim(tx: Tx, ownerId: string, id: string, revision: number, data: Prisma.ProfileUpdateManyMutationInput = {}) {
  idSchema.parse(id); revisionSchema.parse(revision);
  if (!await tx.profile.findFirst({ where: { id, ownerId }, select: { id: true } })) throw new AppError(404, "Profile not found.");
  const changed = await tx.profile.updateMany({ where: { id, ownerId, revision }, data: { ...data, revision: { increment: 1 } } });
  if (changed.count !== 1) throw new AppError(409, "This profile changed or was deleted. Reload it before saving.");
  return tx.profile.findFirstOrThrow({ where: { id, ownerId } });
}
export const listQuerySchema = z.strictObject({ q: z.string().trim().max(100).default(""), city: z.string().trim().max(80).default(""), kind: z.enum(["ALL","REAL","DEMO"]).default("ALL"), status: z.enum(["ACTIVE","ARCHIVED","ALL"]).default("ACTIVE"), page: z.coerce.number().int().min(1).max(10000).default(1) });
export async function listProfiles(headers: Headers, input: unknown) {
  const actor = await requireMatchmaker(headers);
  const query = listQuerySchema.parse(input);
  const where: Prisma.ProfileWhereInput = {
    ownerId: actor.id,
    ...(query.kind !== "ALL" ? { kind: query.kind } : {}),
    ...(query.status !== "ALL" ? { status: query.status } : {}),
    ...(query.city ? { city: { contains: query.city } } : {}),
    ...(query.q ? { OR: ["displayName","city","occupation","education","bio"].map(field => ({ [field]: { contains: query.q } })) } : {}),
  };
  const [rows, total] = await db().$transaction([db().profile.findMany({ where, take: 20, skip: (query.page - 1) * 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }), db().profile.count({ where })]);
  return { profiles: rows.map(dto), total, page: query.page, pageSize: 20 };
}
export async function getProfile(headers: Headers, id: string): Promise<ProfileDetail> {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const profile = await db().profile.findFirst({ where: { id, ownerId: actor.id }, include: { preference: true, consents: true } });
  if (!profile) throw new AppError(404, "Profile not found.");
  return { ...dto(profile), preference: profile.preference ? { data: profile.preference.data, revision: profile.preference.revision } : null, consents: profile.consents.map(c => ({ scope: c.scope as ConsentScope, status: c.status as "GRANTED" | "WITHDRAWN", policyVersion: c.policyVersion, provenance: c.provenance, synthetic: c.synthetic, revision: c.revision, changedAt: c.changedAt.toISOString() })) };
}
export async function createProfile(headers: Headers, input: unknown) {
  const actor = await requireMatchmaker(headers);
  const data = profileSchema.parse(input);
  return db().$transaction(async tx => {
    const profile = await tx.profile.create({ data: { ...data, ownerId: actor.id, kind: "REAL", status: "ACTIVE" } });
    await audit(tx, "PROFILE_CREATED", actor.id, profile.id, Object.keys(data));
    return dto(profile);
  });
}
export async function updateProfile(headers: Headers, id: string, input: unknown, existingTx?: Tx) {
  const actor = await requireMatchmaker(headers);
  const { revision, profile: data } = z.strictObject({ revision: revisionSchema, profile: profileSchema }).parse(input);
  return inTransaction(async tx => {
    idSchema.parse(id);
    const previous = await tx.profile.findFirst({ where: { id, ownerId: actor.id } });
    if (!previous) throw new AppError(404, "Profile not found.");
    const fields = Object.keys(data).filter(key => JSON.stringify(previous[key as keyof Profile]) !== JSON.stringify(data[key as keyof typeof data]));
    const profile = await claim(tx, actor.id, id, revision, data);
    await audit(tx, "PROFILE_EDITED", actor.id, id, fields);
    return dto(profile);
  }, existingTx);
}
export async function changeStatus(headers: Headers, id: string, input: unknown) {
  const actor = await requireMatchmaker(headers);
  const data = z.strictObject({ revision: revisionSchema, status: z.enum(["ACTIVE","ARCHIVED"]) }).parse(input);
  return db().$transaction(async tx => {
    const current = await tx.profile.findFirst({ where: { id, ownerId: actor.id }, select: { reviewStatus: true } });
    if (!current) throw new AppError(404, "Profile not found.");
    if (data.status === "ACTIVE" && current.reviewStatus !== "APPROVED") throw new AppError(409, "A profile must be approved before it can be reactivated.");
    const profile = await claim(tx, actor.id, id, data.revision, { status: data.status });
    await audit(tx, data.status === "ARCHIVED" ? "PROFILE_ARCHIVED" : "PROFILE_REACTIVATED", actor.id, id, ["status"]);
    return dto(profile);
  });
}
export async function deleteProfile(headers: Headers, id: string, input: unknown) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const data = z.strictObject({ revision: revisionSchema, confirmation: z.string().max(100) }).parse(input);
  await db().$transaction(async tx => {
    const profile = await tx.profile.findFirst({ where: { id, ownerId: actor.id } });
    if (!profile) throw new AppError(404, "Profile not found.");
    if (data.confirmation !== "DELETE " + profile.displayName) throw new AppError(400, "Type the exact deletion confirmation.");
    await claim(tx, actor.id, id, data.revision);
    await tx.profile.deleteMany({ where: { id, ownerId: actor.id } });
    await audit(tx, "PROFILE_DELETED", actor.id, id, ["profile","contact","preference","consents","workflows","snapshots","decisions","emailDrafts","chatConversations","retainedEmailLedger"]);
  });
  return { ok: true };
}
export async function getContact(headers: Headers, id: string) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const profile = await db().profile.findFirst({ where: { id, ownerId: actor.id }, include: { contact: true } });
  if (!profile) throw new AppError(404, "Profile not found.");
  const contact = profile.contact ? decryptContact(id, profile.contact) : { email: null, phone: null };
  await audit(db(), "CONTACT_VIEWED", actor.id, id, []);
  return { ...contact, revision: profile.revision };
}
// Only the explicit email context resolves a contact, inside its approval/claim transaction.
export async function resolveEmailRecipient(headers: Headers, tx: Tx, id: string) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const profile = await tx.profile.findFirst({ where: { id, ownerId: actor.id }, include: { contact: true } });
  if (!profile) throw new AppError(404, "Profile not found.");
  if (profile.kind !== "REAL" || profile.status !== "ACTIVE" || !profile.contact) throw new AppError(422, "An active REAL recipient with a saved email address is required.");
  const contact = decryptContact(id, profile.contact);
  if (!contact.email) throw new AppError(422, "Save a recipient email in the private contact editor first.");
  await audit(tx, "EMAIL_CONTACT_RESOLVED", actor.id, id, []);
  return contact.email;
}
export async function saveContact(headers: Headers, id: string, input: unknown) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const data = z.strictObject({ revision: revisionSchema, contact: contactSchema }).parse(input);
  const encrypted = encryptContact(id, data.contact);
  return db().$transaction(async tx => {
    const profile = await claim(tx, actor.id, id, data.revision);
    if (profile.kind === "DEMO" && (data.contact.email || data.contact.phone)) throw new AppError(400, "Demo profiles cannot have deliverable contacts.");
    await tx.profileContact.upsert({ where: { profileId: id }, create: { profileId: id, ...encrypted }, update: { ...encrypted, revision: { increment: 1 } } });
    await audit(tx, "CONTACT_UPDATED", actor.id, id, ["email","phone"]);
    return { ok: true, revision: profile.revision };
  });
}
export async function savePreference(headers: Headers, id: string, input: unknown) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const data = z.strictObject({ revision: revisionSchema, preference: preferenceSchema }).parse(input);
  return db().$transaction(async tx => {
    const profile = await claim(tx, actor.id, id, data.revision);
    await tx.partnerPreference.upsert({ where: { profileId: id }, create: { profileId: id, data: data.preference }, update: { data: data.preference, revision: { increment: 1 } } });
    await audit(tx, "PREFERENCE_UPDATED", actor.id, id, Object.keys(data.preference));
    return { ok: true, revision: profile.revision };
  });
}
export async function saveConsent(headers: Headers, id: string, input: unknown) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const data = z.strictObject({ revision: revisionSchema, consent: consentSchema }).parse(input);
  return db().$transaction(async tx => {
    const profile = await claim(tx, actor.id, id, data.revision);
    const consent = { ...data.consent, synthetic: profile.kind === "DEMO", changedAt: new Date() };
    await tx.profileConsent.upsert({ where: { profileId_scope: { profileId: id, scope: consent.scope } }, create: { profileId: id, ...consent }, update: { ...consent, revision: { increment: 1 } } });
    await audit(tx, consent.status === "GRANTED" ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN", actor.id, id, ["scope","status","policyVersion","provenance"]);
    return { ok: true, revision: profile.revision };
  });
}
export async function requireConsent(headers: Headers, id: string, scope: ConsentScope) {
  const actor = await requireMatchmaker(headers); idSchema.parse(id);
  const consent = await db().profileConsent.findFirst({ where: { profileId: id, scope, profile: { ownerId: actor.id } }, include: { profile: { select: { kind: true, status: true } } } });
  if (!consent || consent.status !== "GRANTED" || consent.profile.status !== "ACTIVE") throw new AppError(403, "Permission is not recorded for this scope.");
  return { scope: consent.scope, policyVersion: consent.policyVersion, synthetic: consent.synthetic };
}
function demoToken(rows: unknown) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
async function demoSummary(tx: Tx, ownerId: string) {
  const rows = await tx.profile.findMany({ where: { ownerId, kind: "DEMO" }, select: { id: true, revision: true }, orderBy: { id: "asc" } });
  const relation = { profile: { ownerId, kind: "DEMO" } };
  const [contacts, preferences, consents] = await Promise.all([tx.profileContact.count({ where: relation }), tx.partnerPreference.count({ where: relation }), tx.profileConsent.count({ where: relation })]);
  const workflowRows=await tx.workflow.findMany({where:{source:{ownerId,kind:"DEMO"}},select:{id:true,revision:true},orderBy:{id:"asc"}});
  const [snapshots,decisions]=await Promise.all([tx.assessmentSnapshot.count({where:{workflow:{source:{ownerId,kind:"DEMO"}}}}),tx.matchDecision.count({where:{workflow:{source:{ownerId,kind:"DEMO"}}}})]);
  const draftRows=await tx.emailDraft.findMany({where:{workflow:{source:{ownerId,kind:"DEMO"}}},select:{id:true,revision:true},orderBy:{id:"asc"}});
  const chatRows=await tx.chatConversation.findMany({where:{ownerId,kind:"DEMO",OR:[{sourceId:{not:null}},{candidateId:{not:null}}]},select:{id:true,revision:true},orderBy:{id:"asc"}});
  const chatIds=chatRows.map(c=>c.id);
  const [chatMessages,chatProposals]=await Promise.all([tx.chatMessage.count({where:{conversationId:{in:chatIds}}}),tx.chatProposal.count({where:{conversationId:{in:chatIds}}})]);
  return { profiles: rows.length, contacts, preferences, consents, workflows:workflowRows.length,snapshots,decisions,emailDrafts:draftRows.length,chatConversations:chatRows.length,chatMessages,chatProposals, confirmationToken: demoToken({rows,workflowRows,draftRows,chatRows,chatMessages,chatProposals}) };
}
export async function previewDemoReset(headers: Headers) {
  const actor = await requireMatchmaker(headers);
  return db().$transaction(tx => demoSummary(tx, actor.id));
}
export async function seedDemo(headers: Headers) {
  const actor = await requireMatchmaker(headers);
  await db().$transaction(async tx => {
    for (const p of syntheticProfiles) {
      const core = profileSchema.parse({ displayName: p.name, reportedAge: p.age, ageConfirmedOn: "2026-10-09", city: p.location, region: null, country: "India", education: p.education, occupation: p.occupation, interests: p.interests, values: p.values, relationshipGoals: ["LONG_TERM"], lifestyle: [], communicationStyle: p.communication, bio: p.bio });
      await tx.profile.upsert({ where: { ownerId_demoKey: { ownerId: actor.id, demoKey: "stage4-" + p.id } }, create: { ...core, ownerId: actor.id, kind: "DEMO", demoKey: "stage4-" + p.id }, update: {} });
    }
    await audit(tx, "DEMO_SEEDED", actor.id, null, ["profiles"]);
  });
  return { ok: true };
}
export async function resetDemo(headers: Headers, input: unknown) {
  const actor = await requireMatchmaker(headers);
  const data = z.strictObject({ confirmation: z.literal("RESET DEMO"), confirmationToken: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input);
  return db().$transaction(async tx => {
    const summary = await demoSummary(tx, actor.id);
    if (data.confirmationToken !== summary.confirmationToken) throw new AppError(409, "Demo data changed. Review the reset counts again.");
    await tx.profile.deleteMany({ where: { ownerId: actor.id, kind: "DEMO" } });
    await audit(tx, "DEMO_RESET", actor.id, null, ["profiles","contacts","preferences","consents","workflows","snapshots","decisions","emailDrafts","chatConversations"]);
    return { ok: true, affected: summary.profiles };
  });
}
