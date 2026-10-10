import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChatConversation, ChatMessage, ChatProposal, Prisma } from "@/generated/prisma/client";
import { contentSchema, createConversationSchema, conversationCommandSchema, messageRequestSchema, operationSchema, proposalCommandSchema, proposalInputSchema, type ChatContent, type ChatDetail, type ChatOperation, type ConversationDTO, type MessageDTO, type ProposalDTO } from "@/domain/chat";
import { idSchema, profileSchema, revisionSchema } from "@/domain/validation";
import { localExplanation } from "@/domain/matching";
import { db } from "./db";
import { requireMatchmaker } from "./auth";
import { decryptPrivate, encryptPrivate } from "./contacts";
import { AppError } from "./errors";
import { getProfile, listProfiles, requireConsent, updateProfile } from "./profiles";
import { assessPair, rankedMatches } from "./matching";
import { getWorkflow, mutateWorkflow, requireApprovedWorkflow } from "./workflows";
import { aiGateway, geminiAvailable } from "./ai-gateway";
import { emailService, localDraftContent } from "./email/service";
import { rateLimit } from "./security";

type Tx = Prisma.TransactionClient;
export const PROPOSAL_TTL_MS = 15 * 60 * 1000, CHAT_LEASE_MS = 30000;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const listSchema = z.strictObject({ page: z.coerce.number().int().min(1).max(10000).default(1), state: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE") });
const historySchema = z.strictObject({ before: z.coerce.number().int().min(1).max(100000).optional(), proposalPage: z.coerce.number().int().min(1).max(10000).default(1) });
const createProposalSchema = z.strictObject({ requestId: idSchema, revision: revisionSchema, proposal: proposalInputSchema });
function fail(message: string, status = 409): never { throw new AppError(status, message, "CHAT_BOUNDARY"); }
async function audit(tx: Tx, actorId: string, action: string, entityId: string, fields: Record<string, string | number | boolean | null> = {}) { await tx.auditEvent.create({ data: { actorId, action, entityId, fields } }); }
async function own(tx: Tx, actorId: string, id: string) { idSchema.parse(id); const row = await tx.chatConversation.findFirst({ where: { id, ownerId: actorId } }); if (!row) fail("Conversation not found.", 404); return row; }
function active(row: ChatConversation) { if (row.state !== "ACTIVE") fail("Reopen this archived conversation before making changes."); }
function title(row: ChatConversation) { return z.string().max(100).parse(decryptPrivate("chat-title:" + row.id, { keyId: row.keyId, ciphertext: row.titleCiphertext })); }
function conversationDTO(row: ChatConversation): ConversationDTO { return { id: row.id, title: title(row), kind: row.kind as ConversationDTO["kind"], state: row.state as ConversationDTO["state"], revision: row.revision, sourceId: row.sourceId, candidateId: row.candidateId, workflowId: row.workflowId, draftId: row.draftId, updatedAt: row.updatedAt.toISOString() }; }
function content(row: ChatMessage) { return contentSchema.parse(decryptPrivate("chat-message:" + row.id, row)); }
function operation(row: ChatProposal) { const value = operationSchema.parse(decryptPrivate("chat-proposal:" + row.id, row)); if (hash(value) !== row.digest || value.kind !== row.kind) fail("Proposal integrity could not be verified.", 503); return value; }
async function assertKey(tx: Tx) {
  const conversation = await tx.chatConversation.findFirst(), contact = await tx.profileContact.findFirst(), draft = await tx.emailDraft.findFirst(), delivery = await tx.emailDelivery.findFirst();
  if (conversation) title(conversation); if (contact) decryptPrivate(contact.profileId, contact); if (draft) decryptPrivate("email-draft:" + draft.id, draft); if (delivery) decryptPrivate("email-delivery:" + delivery.id, { keyId: delivery.keyId, ciphertext: delivery.payloadCiphertext });
  encryptPrivate("chat-key-validation", true);
}
async function bump(tx: Tx, row: ChatConversation, extra: Prisma.ChatConversationUpdateManyMutationInput = {}) {
  const changed = await tx.chatConversation.updateMany({ where: { id: row.id, ownerId: row.ownerId, revision: row.revision }, data: { ...extra, revision: { increment: 1 } } });
  if (changed.count !== 1) fail("Conversation changed in another tab. Reload saved state.");
}
async function proposalRow(tx: Tx, conversationId: string, id: string) { idSchema.parse(id); const row = await tx.chatProposal.findFirst({ where: { id, conversationId } }); if (!row) fail("Proposal not found.", 404); return row; }
async function changeProposal(tx: Tx, row: ChatProposal, extra: Prisma.ChatProposalUpdateManyMutationInput) {
  const result = await tx.chatProposal.updateMany({ where: { id: row.id, revision: row.revision, state: row.state }, data: { ...extra, revision: { increment: 1 } } });
  if (result.count !== 1) fail("Proposal changed in another request. Reload and review it.");
  return tx.chatProposal.findUniqueOrThrow({ where: { id: row.id } });
}
function proposalDTO(row: ChatProposal, now: number): ProposalDTO { return { id: row.id, revision: row.revision, state: row.state === "AWAITING_CONFIRMATION" && row.expiresAt.valueOf() <= now ? "EXPIRED" : row.state as ProposalDTO["state"], digest: row.digest, operation: operation(row), createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null, executedAt: row.executedAt?.toISOString() ?? null, confirmedRevision: row.confirmedRevision, result: row.result ? z.strictObject({ id: idSchema, revision: revisionSchema }).parse(row.result) : null, errorCode: row.errorCode }; }
async function currentDraft(headers: Headers, tx: Tx, row: ChatConversation) {
  let id = row.draftId;
  if (!id) { const previous = await tx.chatProposal.findFirst({ where: { conversationId: row.id, kind: "DRAFT_CREATE", state: "EXECUTED" }, orderBy: [{ executedAt: "desc" }, { id: "asc" }] }); if (previous?.result) id = z.object({ id: idSchema }).parse(previous.result).id; }
  if (!id) return null;
  const saved = await tx.emailDraft.findUnique({ where: { id }, select: { workflowId: true, recipientProfileId: true } });
  if (!saved) return null;
  if (saved.workflowId !== row.workflowId || ![row.sourceId, row.candidateId].includes(saved.recipientProfileId)) fail("Draft does not belong to this conversation context.");
  return emailService.getDraft(headers, id, tx);
}
async function aiPermission(headers: Headers, row: ChatConversation, task: string) {
  if (!row.sourceId) fail("Select a source profile first.");
  await requireConsent(headers, row.sourceId, "CHAT");
  if (task === "EXPLANATION") { if (!row.candidateId) fail("Select a candidate first."); for (const id of [row.sourceId, row.candidateId]) { await requireConsent(headers, id, "CHAT"); await requireConsent(headers, id, "EXPLANATION"); } }
}
async function permissionInTransaction(tx: Tx, row: ChatConversation, task: string) {
  const ids = task === "EXPLANATION" ? [row.sourceId, row.candidateId] : [row.sourceId];
  const scopes = task === "EXPLANATION" ? ["CHAT", "EXPLANATION"] : ["CHAT"];
  for (const id of ids) for (const scope of scopes) { const consent = id ? await tx.profileConsent.findUnique({ where: { profileId_scope: { profileId: id, scope } }, include: { profile: { select: { status: true } } } }) : null; if (!consent || consent.status !== "GRANTED" || consent.profile.status !== "ACTIVE") return false; }
  return true;
}

export function createChatService(options: { gateway?: typeof aiGateway; now?: () => number } = {}) {
  if (Object.keys(options).length && process.env.MATCHMAKER_TEST_MODE !== "1") throw new Error("Chat test dependencies require test mode.");
  const gateway = options.gateway ?? aiGateway, now = options.now ?? Date.now;
  async function transaction<T>(work: (tx: Tx) => Promise<T>) { try { return await db().$transaction(work); } catch (error) { if (error && typeof error === "object" && "code" in error && ["P2002", "P2028", "P2034"].includes(String(error.code))) fail("Chat state changed concurrently. Reload saved state before retrying."); throw error; } }
  async function messageDTO(headers: Headers, row: ChatConversation, message: ChatMessage): Promise<MessageDTO> {
    let value = content(message);
    if (message.origin === "GEMINI") { try { await aiPermission(headers, row, message.task); } catch { value = { text: "Earlier Gemini interpretation is hidden because current permission is missing or withdrawn.", links: [] }; } }
    if (message.role === "TOOL") { for (const link of value.links.filter(l => l.kind === "PROFILE")) { if (!await db().profile.findFirst({ where: { id: link.id, ownerId: row.ownerId, kind: row.kind }, select: { id: true } })) { value = { text: "A profile in this earlier lookup was removed. Run a fresh lookup.", links: [] }; break; } } }
    const interrupted = message.status === "PROCESSING" && !!message.leaseUntil && message.leaseUntil.valueOf() <= now();
    return { id: message.id, sequence: message.sequence, requestId: message.requestId, role: message.role as MessageDTO["role"], origin: message.origin as MessageDTO["origin"], status: interrupted ? "INTERRUPTED" : message.status as MessageDTO["status"], task: message.task as MessageDTO["task"], createdAt: message.createdAt.toISOString(), content: interrupted ? { text: "Response interrupted. Your message is saved; retry explicitly to run the read-only task again.", links: [] } : value, canRetry: row.state === "ACTIVE" && message.role === "ASSISTANT" && (interrupted || message.status === "FAILED") };
  }
  async function tools(headers: Headers, row: ChatConversation, request: z.infer<typeof messageRequestSchema>) {
    const links: ChatContent["links"] = [];
    const linkProfile = (id: string, label: string) => links.push({ kind: "PROFILE", id, label });
    if (request.task === "NOTE") return { facts: "No application lookup or mutation was requested.", text: "Saved as a local note. Choose a supported lookup or create a reviewable change proposal. Conversational wording never approves a match or sends email.", origin: "LOCAL" as const, links };
    if (request.task === "SEARCH") { const found = await listProfiles(headers, { q: request.query, kind: row.kind, status: "ACTIVE" }); found.profiles.slice(0,10).forEach((p, i) => linkProfile(p.id, "Profile " + (i+1) + " · " + p.kind)); return { facts: "Stored lookup: " + found.total + " active " + row.kind + " profiles match the literal search. Showing up to 10 authorized profile links; no AI query or name inference.", text: "Open a profile to review its current facts and preferences. Search is local and does not send your message to Gemini.", origin: "LOCAL" as const, links }; }
    if (!row.sourceId) fail("This tool needs a source profile. Create a conversation with profile context.", 422);
    const profile = await getProfile(headers, row.sourceId); if (profile.kind !== row.kind) fail("Profile classification changed."); linkProfile(profile.id, profile.displayName + " · " + profile.kind);
    if (request.task === "PROFILE") {
      const facts = "Stored profile: " + profile.displayName + " · " + profile.kind + " · revision " + profile.revision + "\nReported age: " + (profile.reportedAge ?? "Unknown") + "\nLocation: " + (profile.city ?? "Unknown") + "\nOccupation: " + (profile.occupation ?? "Unknown") + "\nInterests: " + (profile.interests.join(", ") || "Unknown") + "\nValues: " + (profile.values.join(", ") || "Unknown") + "\nGoals: " + (profile.relationshipGoals.join(", ") || "Unknown") + "\nPreferences: " + (profile.preference ? JSON.stringify(profile.preference.data) : "Not recorded") + "\nBiography (untrusted stored text): " + (profile.bio ?? "Not recorded");
      const result = await gateway.chatProfile(headers, { sourceId: profile.id, useGemini: request.useGemini });
      return { facts, text: result.summary, origin: result.source === "Gemini explanation" ? "GEMINI" as const : "LOCAL" as const, links };
    }
    if (request.task === "MATCHES") { const ranked = await rankedMatches(headers, { sourceId: profile.id }); ranked.results.forEach((r, i) => linkProfile(r.candidate.id, "Candidate " + (i+1) + " · " + row.kind)); return { facts: "Current eligible same-classification matches: " + ranked.total + ".\n" + ranked.results.map((r, i) => "Candidate " + (i+1) + ": heuristic score " + (r.assessment.overallScore ?? "Unknown") + "/100; completeness " + r.assessment.weightedCompleteness + "%").join("\n"), text: "Strict deal-breakers remain authoritative. These local heuristic scores are not probabilities. Review profiles and evidence before any human decision.", origin: "LOCAL" as const, links }; }
    if (!row.candidateId) fail("Comparison and explanation need a candidate in the saved conversation context.", 422);
    const candidate = await getProfile(headers, row.candidateId); if (candidate.kind !== row.kind) fail("Mixed real/demo context is forbidden."); linkProfile(candidate.id, candidate.displayName + " · " + candidate.kind);
    if (row.workflowId) { const workflow = await getWorkflow(headers, row.workflowId); if (workflow.source.id !== row.sourceId || workflow.candidate?.id !== row.candidateId) fail("Workflow context changed. Create a fresh conversation."); if (request.task === "EXPLANATION") { if (!workflow.snapshot) fail("No recorded assessment exists for this workflow.", 422); const local = localExplanation(workflow.snapshot.assessment), facts = "Recorded assessment " + workflow.snapshot.createdAt + ". " + (workflow.stale ? "Historical evidence requires fresh human review. " : "") + local; if (workflow.stale) return { facts, text: "Gemini interpretation is disabled for stale recorded evidence. Refresh and review in Workflow.", origin: "LOCAL" as const, links }; const result = await gateway.explain(headers, { sourceId: row.sourceId, candidateId: row.candidateId, useGemini: request.useGemini }, true); return { facts, text: result.summary, origin: result.source === "Gemini explanation" ? "GEMINI" as const : "LOCAL" as const, links }; } }
    const pair = await assessPair(headers, row.sourceId, row.candidateId), facts = "Fresh local assessment: " + localExplanation(pair.assessment);
    if (request.task === "COMPARE") return { facts, text: "Computed through the existing matching service. No decision, workflow or approval was created.", origin: "LOCAL" as const, links };
    const result = await gateway.explain(headers, { sourceId: row.sourceId, candidateId: row.candidateId, useGemini: request.useGemini }, true); return { facts, text: result.summary, origin: result.source === "Gemini explanation" ? "GEMINI" as const : "LOCAL" as const, links };
  }
  async function buildOperation(headers: Headers, tx: Tx, row: ChatConversation, raw: unknown): Promise<ChatOperation> {
    const input = proposalInputSchema.parse(raw);
    if (input.kind === "PROFILE_EDIT") { const id = input.target === "SOURCE" ? row.sourceId : row.candidateId; if (!id) fail("Choose the target profile in conversation context first.", 422); const current = await getProfile(headers, id); if (current.kind !== row.kind || current.status !== "ACTIVE") fail("An active profile in this classification is required."); const profile = profileSchema.parse({ ...Object.fromEntries(Object.keys(profileSchema.shape).map(k => [k, current[k as keyof typeof current]])), [input.field]: input.value }); return operationSchema.parse({ kind: input.kind, targetId: id, targetName: current.displayName, revision: current.revision, field: input.field, before: current[input.field], after: profile[input.field], profile }); }
    if (!row.workflowId) fail("This proposal needs a saved workflow in conversation context.", 422);
    const workflow = await getWorkflow(headers, row.workflowId, tx); if (workflow.source.id !== row.sourceId || (workflow.candidate?.id ?? null) !== row.candidateId) fail("Workflow pair changed. Create a fresh conversation.");
    if (input.kind === "WORKFLOW_NAVIGATE") return operationSchema.parse({ kind: input.kind, targetId: workflow.id, revision: workflow.revision, before: workflow.currentStep, step: input.step });
    const approved = await requireApprovedWorkflow(headers, tx, workflow.id);
    if (input.kind === "DRAFT_CREATE") return operationSchema.parse({ kind: input.kind, targetId: workflow.id, revision: workflow.revision, decisionId: approved.decisionId, snapshotId: approved.snapshotId, recipient: input.recipient, recipientName: input.recipient === "SOURCE" ? approved.sourceName : approved.candidateName, ...localDraftContent(approved.sourceName, approved.candidateName, input.recipient) });
    const draft = await currentDraft(headers, tx, row); if (!draft) fail("Create a draft through a confirmed proposal, or select a saved draft when creating the conversation.", 422);
    return operationSchema.parse({ kind: input.kind, targetId: draft.id, workflowId: workflow.id, revision: draft.revision, before: { subject: draft.subject, body: draft.body }, subject: input.subject, body: input.body });
  }
  const service = {
    async list(headers: Headers, input: unknown = {}) { const actor = await requireMatchmaker(headers), query = listSchema.parse(input); const rows = await db().chatConversation.findMany({ where: { ownerId: actor.id, ...(query.state !== "ALL" ? { state: query.state } : {}) }, take: 21, skip: (query.page-1)*20, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }); return { conversations: rows.slice(0,20).map(conversationDTO), nextPage: rows.length > 20 ? query.page+1 : null, geminiAvailable: geminiAvailable() }; },
    async create(headers: Headers, raw: unknown) {
      const actor = await requireMatchmaker(headers), input = createConversationSchema.parse(raw); await rateLimit("chat",60);
      if (input.workflowId) { const workflow = await getWorkflow(headers, input.workflowId); if (input.sourceId && input.sourceId !== workflow.source.id || input.candidateId && input.candidateId !== workflow.candidate?.id) fail("Workflow and selected profiles do not match.", 422); input.sourceId = workflow.source.id; input.candidateId = workflow.candidate?.id ?? null; }
      if (input.candidateId && (!input.sourceId || input.sourceId === input.candidateId)) fail("Choose a distinct source and candidate.", 422);
      for (const id of [input.sourceId,input.candidateId]) if (id) { const profile = await getProfile(headers,id); if (profile.kind !== input.kind || profile.status !== "ACTIVE") fail("Conversation context must use active profiles in one classification.",422); }
      return transaction(async tx => { await assertKey(tx); if (await tx.chatConversation.count({ where: { ownerId:actor.id } }) >= 200) fail("Delete old conversations before creating more; limit 200.",422); if (input.draftId) { const draft = await emailService.getDraft(headers,input.draftId,tx); if (!input.workflowId || draft.workflowId !== input.workflowId || ![input.sourceId,input.candidateId].includes(draft.recipientProfileId)) fail("Draft does not belong to the chosen workflow.",422); } const id=randomUUID(), encrypted=encryptPrivate("chat-title:"+id,input.title); const row=await tx.chatConversation.create({ data: { id,ownerId:actor.id,sourceId:input.sourceId,candidateId:input.candidateId,workflowId:input.workflowId,draftId:input.draftId,kind:input.kind,titleCiphertext:encrypted.ciphertext,keyId:encrypted.keyId } }); await audit(tx,actor.id,"CHAT_CONVERSATION_CREATED",id,{kind:input.kind}); return conversationDTO(row); });
    },
    async get(headers: Headers, id: string, raw: unknown = {}): Promise<ChatDetail> {
      const actor=await requireMatchmaker(headers),query=historySchema.parse(raw),row=await own(db(),actor.id,id);
      const messages=await db().chatMessage.findMany({where:{conversationId:id,...(query.before?{sequence:{lt:query.before}}:{})},orderBy:{sequence:"desc"},take:31});
      const proposals=await db().chatProposal.findMany({where:{conversationId:id},orderBy:[{createdAt:"desc"},{id:"asc"}],take:21,skip:(query.proposalPage-1)*20});
      return {conversation:conversationDTO(row),messages:await Promise.all(messages.slice(0,30).reverse().map(m=>messageDTO(headers,row,m))),before:messages.length>30?messages[29].sequence:null,proposals:proposals.slice(0,20).map(p=>proposalDTO(p,now())),proposalPage:query.proposalPage,hasMoreProposals:proposals.length>20,geminiAvailable:geminiAvailable(),draft:await currentDraft(headers,db(),row)};
    },
    async change(headers: Headers,id:string,raw:unknown) {
      const actor=await requireMatchmaker(headers),command=conversationCommandSchema.parse(raw);
      return transaction(async tx=>{const row=await own(tx,actor.id,id);if(row.revision!==command.revision)fail("Conversation changed. Reload before saving.");if(await tx.chatMessage.count({where:{conversationId:id,role:"ASSISTANT",status:"PROCESSING",leaseUntil:{gt:new Date(now())}}}))fail("Wait for the active response before archiving or deleting this conversation.");
        if(command.action==="delete"){await tx.chatConversation.delete({where:{id}});await audit(tx,actor.id,"CHAT_CONVERSATION_DELETED",id);return {deleted:true};}
        if(command.action==="rename"){await assertKey(tx);const encrypted=encryptPrivate("chat-title:"+id,command.title);await bump(tx,row,{titleCiphertext:encrypted.ciphertext});}
        else{await bump(tx,row,{state:command.action==="archive"?"ARCHIVED":"ACTIVE"});if(command.action==="archive"){const pending=await tx.chatProposal.findMany({where:{conversationId:id,state:"AWAITING_CONFIRMATION"},take:201});for(const p of pending){await changeProposal(tx,p,{state:"CANCELLED"});await audit(tx,actor.id,"CHAT_PROPOSAL_CANCELLED",p.id,{reason:"CONVERSATION_ARCHIVED"});}}}
        await audit(tx,actor.id,"CHAT_CONVERSATION_"+(command.action==="rename"?"RENAMED":command.action==="archive"?"ARCHIVED":"REOPENED"),id);return {deleted:false};});
    },
    async message(headers: Headers,id:string,raw:unknown):Promise<ChatDetail> {
      const actor=await requireMatchmaker(headers),request=messageRequestSchema.parse(raw),requestDigest=hash({text:request.text,task:request.task,useGemini:request.useGemini,query:request.query});
      const leaseToken=randomUUID();
      const claim=await transaction(async tx=>{const row=await own(tx,actor.id,id);active(row);await assertKey(tx);const old=await tx.chatMessage.findUnique({where:{conversationId_requestId_role:{conversationId:id,requestId:request.requestId,role:"ASSISTANT"}}});if(old){if(old.requestDigest!==requestDigest)fail("This request ID is already bound to different text or tools.");if(old.status!=="PROCESSING")return {row,complete:true};if(old.leaseUntil&&old.leaseUntil.valueOf()>now())fail("This response is still processing. Reload saved state.");await tx.chatMessage.updateMany({where:{conversationId:id,requestId:request.requestId,status:"PROCESSING"},data:{leaseUntil:new Date(now()+CHAT_LEASE_MS),leaseToken}});await bump(tx,row);return {row,complete:false};}
        if(row.revision!==request.revision)fail("Conversation changed in another tab. Reload before sending a new message.");if(row.nextSequence>3000)fail("Start a new conversation; this history reached its bounded message limit.",422);if(await tx.chatMessage.count({where:{conversationId:id,role:"ASSISTANT",status:"PROCESSING",leaseUntil:{gt:new Date(now())}}}))fail("Finish the active response before sending another message.");await bump(tx,row,{nextSequence:{increment:3}});for(const [offset,role] of (["USER","TOOL","ASSISTANT"] as const).entries()){const messageId=randomUUID(),encrypted=encryptPrivate("chat-message:"+messageId,contentSchema.parse(role==="USER"?{text:request.text,request}:{text:"Response is processing. No mutation is authorized."}));await tx.chatMessage.create({data:{id:messageId,conversationId:id,sequence:row.nextSequence+offset,requestId:request.requestId,requestDigest,role,origin:role==="TOOL"?"TOOL":"LOCAL",status:role==="USER"?"COMPLETED":"PROCESSING",task:request.task,...encrypted,leaseUntil:role==="USER"?null:new Date(now()+CHAT_LEASE_MS),leaseToken:role==="USER"?null:leaseToken}});}await audit(tx,actor.id,"CHAT_MESSAGE_SAVED",id,{task:request.task});return {row,complete:false};});
      if(claim.complete)return service.get(headers,id);
      await rateLimit("chat",60);
      let response:Awaited<ReturnType<typeof tools>>,failed=false;
      try{response=await tools(headers,claim.row,request);}catch{failed=true;response={facts:"The requested tool did not complete. No retrieved facts or business changes are claimed.",text:"Check the selected context and current eligibility, then retry the read-only task explicitly or use the normal profile/workflow pages.",origin:"LOCAL",links:[]};}
      await requireMatchmaker(headers);
      await transaction(async tx=>{const row=await own(tx,actor.id,id);active(row);if(response.origin==="GEMINI"&&!await permissionInTransaction(tx,row,request.task)){response={...response,text:"Gemini interpretation was discarded because current permission changed. Stored facts remain separate.",origin:"LOCAL"};}
        const pending=await tx.chatMessage.findMany({where:{conversationId:id,requestId:request.requestId,role:{in:["TOOL","ASSISTANT"]},status:"PROCESSING"}});if(pending.length!==2||pending.some(m=>m.leaseToken!==leaseToken))fail("Response state changed. Reload the saved conversation.");for(const message of pending){const encrypted=encryptPrivate("chat-message:"+message.id,contentSchema.parse({text:message.role==="TOOL"?response.facts:response.text,links:message.role==="TOOL"?response.links:[]}));await tx.chatMessage.update({where:{id:message.id},data:{...encrypted,status:failed?"FAILED":"COMPLETED",origin:message.role==="TOOL"?"TOOL":response.origin,leaseUntil:null,leaseToken:null}});}await bump(tx,row);await audit(tx,actor.id,failed?"CHAT_TOOL_FAILED":"CHAT_TOOL_COMPLETED",id,{task:request.task,source:response.origin});});
      return service.get(headers,id);
    },
    async retry(headers:Headers,id:string,requestId:string,raw:unknown){const actor=await requireMatchmaker(headers);z.strictObject({}).parse(raw);idSchema.parse(requestId);const row=await own(db(),actor.id,id),message=await db().chatMessage.findUnique({where:{conversationId_requestId_role:{conversationId:id,requestId,role:"USER"}}}),response=await db().chatMessage.findUnique({where:{conversationId_requestId_role:{conversationId:id,requestId,role:"ASSISTANT"}}});if(!message||!response)fail("Request not found.",404);const request=content(message).request;if(!request)fail("Stored request is invalid.",503);return service.message(headers,id,{...request,revision:row.revision,requestId:response.status==="FAILED"?randomUUID():requestId});},
    async propose(headers:Headers,id:string,raw:unknown){const actor=await requireMatchmaker(headers),request=createProposalSchema.parse(raw),requestDigest=hash(request.proposal);await rateLimit("chat",60);return transaction(async tx=>{const row=await own(tx,actor.id,id);active(row);const existing=await tx.chatProposal.findUnique({where:{id:request.requestId}});if(existing){if(existing.conversationId!==id)fail("Proposal not found.",404);if(existing.requestDigest!==requestDigest)fail("Proposal request ID is bound to another payload.");return proposalDTO(existing,now());}if(row.revision!==request.revision)fail("Conversation changed. Reload before proposing a change.");if(await tx.chatProposal.count({where:{conversationId:id}})>=200)fail("Start a new conversation; this conversation reached 200 proposals.",422);await assertKey(tx);const op=await buildOperation(headers,tx,row,request.proposal),proposalId=request.requestId,encrypted=encryptPrivate("chat-proposal:"+proposalId,op);let proposal=await tx.chatProposal.create({data:{id:proposalId,conversationId:id,kind:op.kind,digest:hash(op),requestDigest,...encrypted,expiresAt:new Date(now()+PROPOSAL_TTL_MS)}});await audit(tx,actor.id,"CHAT_PROPOSAL_PROPOSED",proposalId,{kind:op.kind,revision:1});proposal=await changeProposal(tx,proposal,{state:"AWAITING_CONFIRMATION"});await bump(tx,row);await audit(tx,actor.id,"CHAT_PROPOSAL_AWAITING_CONFIRMATION",proposalId,{revision:proposal.revision});return proposalDTO(proposal,now());});},
    async proposal(headers:Headers,id:string,proposalId:string,raw:unknown):Promise<ProposalDTO>{
      const actor=await requireMatchmaker(headers),command=proposalCommandSchema.parse(raw);
      try{return await transaction(async tx=>{const row=await own(tx,actor.id,id);const original=await proposalRow(tx,id,proposalId);operation(original);
        if(command.action==="confirm"&&original.state==="EXECUTED"){if(original.confirmedRevision!==command.revision||original.digest!==command.digest)fail("Confirmation does not match the executed proposal.");return proposalDTO(original,now());}
        active(row);if(original.revision!==command.revision)fail("Proposal changed. Review its exact current revision.");if(original.state!=="AWAITING_CONFIRMATION")fail("Only a pending proposal can be changed or confirmed.");if(original.expiresAt.valueOf()<=now()){const expired=await changeProposal(tx,original,{state:"EXPIRED"});await bump(tx,row);await audit(tx,actor.id,"CHAT_PROPOSAL_EXPIRED",proposalId);return proposalDTO(expired,now());}
        if(command.action==="reject"||command.action==="cancel"){const changed=await changeProposal(tx,original,{state:command.action==="reject"?"REJECTED":"CANCELLED"});await bump(tx,row);await audit(tx,actor.id,"CHAT_PROPOSAL_"+changed.state,proposalId);return proposalDTO(changed,now());}
        await assertKey(tx);
        if(command.action==="revise"){const op=await buildOperation(headers,tx,row,command.proposal),encrypted=encryptPrivate("chat-proposal:"+proposalId,op);let revised=await changeProposal(tx,original,{state:"PROPOSED",...encrypted,kind:op.kind,digest:hash(op),expiresAt:new Date(now()+PROPOSAL_TTL_MS)});await audit(tx,actor.id,"CHAT_PROPOSAL_REVISED",proposalId,{revision:revised.revision});revised=await changeProposal(tx,revised,{state:"AWAITING_CONFIRMATION"});await bump(tx,row);return proposalDTO(revised,now());}
        if(command.action!=="confirm")fail("Unsupported proposal action.",400);
        if(original.digest!==command.digest)fail("Confirmation payload changed. Review the exact proposal.");const op=operation(original);let confirmed=await changeProposal(tx,original,{state:"CONFIRMED",confirmedBy:actor.id,confirmedAt:new Date(now()),confirmedRevision:original.revision});await audit(tx,actor.id,"CHAT_PROPOSAL_CONFIRMED",proposalId,{revision:original.revision,kind:op.kind});
        let result:{id:string;revision:number};
        if(op.kind==="PROFILE_EDIT"){if(![row.sourceId,row.candidateId].includes(op.targetId))fail("Profile target is outside conversation context.");const profile=await tx.profile.findFirst({where:{id:op.targetId,ownerId:row.ownerId}});if(!profile||profile.status!=="ACTIVE"||profile.kind!==row.kind)fail("Target profile is not eligible for this edit.");const saved=await updateProfile(headers,op.targetId,{revision:op.revision,profile:op.profile},tx);result={id:saved.id,revision:saved.revision};}
        else if(op.kind==="WORKFLOW_NAVIGATE"){if(op.targetId!==row.workflowId)fail("Workflow target is outside conversation context.");const current=await tx.workflow.findFirst({where:{id:op.targetId,source:{ownerId:row.ownerId}}});if(!current||current.sourceId!==row.sourceId||current.candidateId!==row.candidateId)fail("Workflow context changed.");const saved=await mutateWorkflow(headers,op.targetId,{action:"navigate",revision:op.revision,step:op.step},tx);result={id:saved.id,revision:saved.revision};}
        else if(op.kind==="DRAFT_CREATE"){if(op.targetId!==row.workflowId)fail("Draft workflow is outside context.");const workflow=await tx.workflow.findFirst({where:{id:op.targetId,source:{ownerId:row.ownerId}}});if(!workflow||workflow.revision!==op.revision||workflow.sourceId!==row.sourceId||workflow.candidateId!==row.candidateId)fail("Workflow changed since the draft proposal.");const approved=await requireApprovedWorkflow(headers,tx,op.targetId);if(approved.decisionId!==op.decisionId||approved.snapshotId!==op.snapshotId)fail("Match decision changed.");const saved=await emailService.createDraft(headers,{workflowId:op.targetId,recipient:op.recipient},tx);if(saved.subject!==op.subject||saved.body!==op.body)fail("Local template changed; review a new draft proposal.");result={id:saved.id,revision:saved.revision};}
        else{const draft=await currentDraft(headers,tx,row);if(!draft||draft.id!==op.targetId||draft.workflowId!==op.workflowId)fail("Draft target changed or is outside context.");const saved=await emailService.editDraft(headers,op.targetId,{revision:op.revision,subject:op.subject,body:op.body},tx);result={id:saved.id,revision:saved.revision};}
        confirmed=await changeProposal(tx,confirmed,{state:"EXECUTED",result,executedAt:new Date(now())});await bump(tx,row);await audit(tx,actor.id,"CHAT_PROPOSAL_EXECUTED",proposalId,{kind:op.kind,targetId:result.id,targetRevision:result.revision,proposalRevision:original.revision});return proposalDTO(confirmed,now());
      });}catch(error){
        if(command.action!=="confirm"||error instanceof z.ZodError||error instanceof AppError&&[401,403,404,503].includes(error.status))throw error;
        await requireMatchmaker(headers);
        // Re-read after rollback. Exact-input failures remain pending; stale domain failures
        // are terminal and cannot silently execute under a new resource revision.
        return transaction(async tx=>{const conversation=await own(tx,actor.id,id);const row=await proposalRow(tx,id,proposalId);if(row.state==="EXECUTED"&&row.confirmedRevision===command.revision&&row.digest===command.digest)return proposalDTO(row,now());if(row.state!=="AWAITING_CONFIRMATION"||row.revision!==command.revision||row.digest!==command.digest)throw error;const failed=await changeProposal(tx,row,{state:"FAILED",errorCode:"REVALIDATION_OR_TRANSACTION_FAILED"});await bump(tx,conversation);await audit(tx,actor.id,"CHAT_PROPOSAL_FAILED",proposalId,{kind:row.kind});return proposalDTO(failed,now());});
      }
    },
  };
  return service;
}
export const chatService = createChatService();
