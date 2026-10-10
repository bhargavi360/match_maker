import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Webhook } from "standardwebhooks";
import type { WorkflowDTO } from "../src/domain/workflow";
import type { FrozenEmail } from "../src/domain/email";
import type { EmailProvider, RetrievedEmail } from "../src/server/email/resend";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matchmaker-stage7-"));
Object.assign(process.env, { DATABASE_URL: "file:" + path.join(directory, "matchmaker.sqlite"), BETTER_AUTH_URL: "http://127.0.0.1:3100", APP_ORIGIN: "http://127.0.0.1:3100", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), MATCHMAKER_SETUP_TOKEN: randomBytes(32).toString("hex"), CONTACT_ENCRYPTION_KEY: randomBytes(32).toString("base64"), CONTACT_KEY_ID: "stage7-test", MATCHMAKER_TEST_MODE: "1", GEMINI_ENABLED: "false", RESEND_API_KEY: "re_synthetic_test_only_key", RESEND_FROM_EMAIL: "sender@example.invalid", RESEND_REPLY_TO: "reply@example.invalid", RESEND_WEBHOOK_SECRET: "whsec_" + randomBytes(32).toString("base64") });
const { db } = await import("../src/server/db"), { bootstrap } = await import("../src/server/bootstrap"), { auth } = await import("../src/server/auth");
const p = await import("../src/server/profiles"), w = await import("../src/server/workflows"), { createEmailService, payloadDigest } = await import("../src/server/email/service"), { resendProvider, providerConfiguration } = await import("../src/server/email/resend");
const { GET, POST, PATCH } = await import("../src/app/api/workspace/[...path]/route"), webhookRoute = await import("../src/app/api/webhooks/resend/route");
let headers: Headers;
const canary = "private-stage7@example.invalid", secretBody = "Synthetic private outgoing body canary", core = { displayName: "Synthetic email profile", reportedAge: 30, ageConfirmedOn: new Date().toISOString().slice(0,10), city: "City", region: null, country: "Country", education: null, occupation: null, interests: ["Art"], values: ["Kindness"], relationshipGoals: ["LONG_TERM"], lifestyle: ["NON_SMOKER"], communicationStyle: "Direct", bio: null };
const calls: { payload: FrozenEmail; key: string }[] = [];
const acceptedProvider: EmailProvider = { async send(payload, key) { calls.push({ payload, key }); return { outcome: "ACCEPTED", providerMessageId: randomUUID() }; }, async get() { return null; } };
const service = createEmailService({ provider: acceptedProvider });
async function command(current: WorkflowDTO, input: object) { return w.mutateWorkflow(headers, current.id, { revision: current.revision, ...input }); }
async function fixture(approved = true, s = service) {
  const marker = "Pref-" + randomUUID().slice(0, 8); let a = await p.createProfile(headers, core); const b = await p.createProfile(headers, { ...core, displayName: "Synthetic email candidate", values: ["Kindness", marker] });
  await p.savePreference(headers, a.id, { revision: a.revision, preference: { minAge: null, maxAge: null, locations: [], sharedValues: [marker], goals: [], lifestyle: [], dealBreakers: [] } });
  a = await p.getProfile(headers, a.id); const contact = await p.saveContact(headers, a.id, { revision: a.revision, contact: { email: canary, phone: null } }); a = await p.getProfile(headers, a.id);
  let current = await w.createWorkflow(headers, { sourceId: a.id, sourceRevision: contact.revision });
  let cursor: string | undefined, selected;
  do { const page = await w.workflowCandidates(headers, current.id, {}); selected = page.results.find(r => r.candidate.id === b.id); cursor = page.nextCursor ?? undefined; } while (!selected && cursor);
  assert.ok(selected);
  current = await command(current, { action: "candidate", candidateId: b.id, assessmentStamp: selected.assessmentStamp });
  if (!approved) return { a, b, workflow: current, draft: null };
  current = await command(current, { action: "review", snapshotId: current.snapshotId, confirmation: "REVIEWED" });
  current = await command(current, { action: "approve", snapshotId: current.snapshotId, confirmation: "APPROVE MATCH" });
  const draft = await s.createDraft(headers, { workflowId: current.id, recipient: "SOURCE" }); return { a, b, workflow: current, draft };
}
async function approved(s = service) { const f = await fixture(true, s); assert.ok(f.draft); const draft = await s.editDraft(headers, f.draft.id, { revision: f.draft.revision, subject: "Synthetic exact subject", body: secretBody }); const preview = await s.previewApproval(headers, draft.id, { revision: draft.revision }); const delivery = await s.approve(headers, draft.id, { revision: draft.revision, previewToken: preview.previewToken, confirmation: "APPROVE EMAIL" }); return { ...f, draft, preview, delivery }; }
const sendInput = (revision: number) => ({ revision, confirmation: "SEND EMAIL" });
function signed(providerMessageId: string, type = "email.delivered", deliveryTag?: string, at = new Date(), id = "msg_" + randomUUID().replaceAll("-", ""), timestamp = new Date()) {
  const raw = JSON.stringify({ type, created_at: at.toISOString(), data: { email_id: providerMessageId, created_at: at.toISOString(), from: "sender@example.invalid", to: [canary], subject: "Synthetic exact subject", ...(deliveryTag ? { tags: { delivery_id: deliveryTag } } : {}) } });
  const signature = new Webhook(process.env.RESEND_WEBHOOK_SECRET!).sign(id, timestamp, raw);
  return new Request("http://127.0.0.1:3100/api/webhooks/resend", { method: "POST", headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(Math.floor(timestamp.valueOf()/1000)), "svix-signature": signature }, body: raw });
}
function retrieved(payload: FrozenEmail, id: string, last_event = "delivered"): RetrievedEmail { return { id, from: payload.from, to: [payload.recipient], subject: payload.subject, text: payload.body, reply_to: payload.replyTo ? [payload.replyTo] : [], tags: [{ name: "delivery_id", value: payload.deliveryId }], last_event }; }
before(async () => {
  const migration = spawnSync(process.execPath, ["--import", "tsx", "scripts/database.ts"], { env: process.env, encoding: "utf8" }); assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  await bootstrap({ token: process.env.MATCHMAKER_SETUP_TOKEN, name: "Synthetic Email Operator", email: "operator@example.invalid", password: "Synthetic-stage7-passphrase" });
  const response = await auth().api.signInEmail({ body: { email: "operator@example.invalid", password: "Synthetic-stage7-passphrase", rememberMe: false }, headers: new Headers({ origin: "http://127.0.0.1:3100" }), asResponse: true });
  headers = new Headers({ cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; "), origin: "http://127.0.0.1:3100" });
});
after(async () => { await db().$disconnect(); });
beforeEach(async () => { await db().rateLimitBucket.deleteMany({ where: { key: "email" } }); });
test("all email services and HTTP boundaries independently reject anonymous access", async () => {
  const h = new Headers(), id = randomUUID();
  for (const op of [() => service.workspace(h), () => service.createDraft(h, {}), () => service.editDraft(h,id,{}), () => service.previewApproval(h,id,{}), () => service.approve(h,id,{}), () => service.getDelivery(h,id), () => service.previewDelivery(h,id), () => service.dispatch(h,id,{}), () => service.reconcile(h,id,{}), () => service.cancel(h,id,{})]) await assert.rejects(op, /sign in/);
  for (const route of ["email", "email/deliveries/" + id]) assert.equal((await GET(new Request("http://127.0.0.1:3100/api/workspace/" + route), { params: Promise.resolve({ path: route.split("/") }) })).status, 401);
});
test("drafts require a current reviewed approved workflow and server-bound recipient/pair", async () => {
  const f = await fixture(false); await assert.rejects(service.createDraft(headers,{workflowId:f.workflow.id,recipient:"SOURCE"}),/human-approved/);
  await assert.rejects(service.createDraft(headers,{workflowId:f.workflow.id,recipient:"SOURCE",recipientProfileId:randomUUID()}));
  const a = await approved(); await assert.rejects(db().emailDraft.update({where:{id:a.draft.id},data:{recipientProfileId:f.b.id}}));
  assert.equal((await p.getProfile(headers,a.a.id)).consents.length,0); // Local/manual drafting never sends free text to Gemini.
});
test("content and exact outgoing snapshot are encrypted, address-bound and absent from ordinary DTOs/audits", async () => {
  const f = await approved(), draft = await db().emailDraft.findUniqueOrThrow({where:{id:f.draft.id}}), delivery = await db().emailDelivery.findUniqueOrThrow({where:{id:f.delivery.id}});
  for (const row of [draft,delivery]) { const serialized=JSON.stringify(row); for(const privateValue of [canary,secretBody,"Synthetic exact subject"])assert.ok(!serialized.includes(privateValue)); }
  assert.equal(delivery.payloadDigest,payloadDigest(f.preview.payload)); assert.equal(delivery.approvedBy,(await db().user.findFirstOrThrow()).id);
  for (const dto of [await p.getProfile(headers,f.a.id),await w.getWorkflow(headers,f.workflow.id),await db().auditEvent.findMany()]) { assert.ok(!JSON.stringify(dto).includes(canary)); assert.ok(!JSON.stringify(dto).includes(secretBody)); }
  assert.ok(await db().auditEvent.count({where:{action:"EMAIL_CONTACT_RESOLVED",entityId:f.a.id}}));
  const before=await db().emailSendAttempt.count();await service.workspace(headers,{workflowId:f.workflow.id});assert.equal(await db().emailSendAttempt.count(),before);
});
test("approval alone never calls transport; forgery and stale previews cannot approve different payloads", async () => {
  const before=calls.length, f=await approved();assert.equal(calls.length,before);assert.equal(f.delivery.state,"APPROVED");assert.equal(f.delivery.attemptCount,0);
  await assert.rejects(service.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:f.preview.previewToken.slice(0,-4)+"bad",confirmation:"APPROVE EMAIL"}),/preview/);
  await assert.rejects(service.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:f.preview.previewToken,confirmation:"APPROVE EMAIL",recipient:canary}));
  const sender=process.env.RESEND_FROM_EMAIL;process.env.RESEND_FROM_EMAIL="changed@example.invalid";try {await assert.rejects(service.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:f.preview.previewToken,confirmation:"APPROVE EMAIL"}),/changed since preview/);await assert.rejects(service.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),/changed/);}finally{process.env.RESEND_FROM_EMAIL=sender;}
});
test("draft editing invalidates only unattempted approval; stale edits and duplicate revisions conflict", async () => {
  const f=await approved();await service.editDraft(headers,f.draft.id,{revision:f.draft.revision,subject:f.draft.subject,body:"A new exact body"});assert.equal((await service.getDelivery(headers,f.delivery.id)).state,"CANCELLED");
  await assert.rejects(service.editDraft(headers,f.draft.id,{revision:f.draft.revision,subject:f.draft.subject,body:"Stale"}),/another tab/);
  const g=await approved();await assert.rejects(service.approve(headers,g.draft.id,{revision:g.draft.revision,previewToken:g.preview.previewToken,confirmation:"APPROVE EMAIL"}),/changed/);
  await assert.rejects(db().emailDelivery.update({where:{id:g.delivery.id},data:{payloadCiphertext:"forged"}}));await assert.rejects(db().emailDelivery.update({where:{id:g.delivery.id},data:{idempotencyKey:"different"}}));
});
test("missing/replaced encryption keys and wrong ciphertext bindings fail closed", async () => {
  const f=await approved(), original=process.env.CONTACT_ENCRYPTION_KEY, originalId=process.env.CONTACT_KEY_ID;
  for(const key of ["",randomBytes(32).toString("base64")]){process.env.CONTACT_ENCRYPTION_KEY=key;await assert.rejects(service.createDraft(headers,{workflowId:f.workflow.id,recipient:"SOURCE"}));await assert.rejects(service.previewDelivery(headers,f.delivery.id));}process.env.CONTACT_ENCRYPTION_KEY=original;
  process.env.CONTACT_KEY_ID="replacement";try{await assert.rejects(service.createDraft(headers,{workflowId:f.workflow.id,recipient:"SOURCE"}),/original encryption key/);}finally{process.env.CONTACT_KEY_ID=originalId;}
});
test("incomplete configuration preserves local drafts; default test transport cannot call Resend", async () => {
  const saved=process.env.RESEND_API_KEY;delete process.env.RESEND_API_KEY;try {const f=await fixture();assert.ok(f.draft);const workspace=await service.workspace(headers,{workflowId:f.workflow.id});assert.equal(workspace.provider.ready,false);assert.ok(!JSON.stringify(workspace.provider).includes(saved!));}finally{process.env.RESEND_API_KEY=saved;}
  assert.equal(providerConfiguration().status.ready,false);await assert.rejects(resendProvider.send((await approved()).preview.payload,"key"),/disabled in tests/);
});
test("expiry blocks dispatch, records expiry and requires a freshly reviewed snapshot", async () => {
  let time=Date.now();const s=createEmailService({provider:acceptedProvider,now:()=>time}), f=await approved(s),before=calls.length;time+=3600001;
  await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),/expired/);assert.equal((await s.getDelivery(headers,f.delivery.id)).state,"EXPIRED");assert.equal(calls.length,before);
  const preview=await s.previewApproval(headers,f.draft.id,{revision:f.draft.revision}), next=await s.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:preview.previewToken,confirmation:"APPROVE EMAIL"});assert.notEqual(next.id,f.delivery.id);assert.equal(next.state,"APPROVED");
});
test("current recipient/contact, profile preferences and match decision invalidate unsent send eligibility", async () => {
  const f=await approved();const current=await p.getProfile(headers,f.a.id);await p.saveContact(headers,f.a.id,{revision:current.revision,contact:{email:"new-recipient@example.invalid",phone:null}});await assert.rejects(service.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),/human-approved/);
  const g=await approved();await command(g.workflow,{action:"reopen",confirmation:"REOPEN MATCH"});await assert.rejects(service.previewApproval(headers,g.draft.id,{revision:g.draft.revision}),/human-approved/);
});
test("concurrent explicit dispatch atomically commits one attempt before transport and rejects repetition", async () => {
  let entered!:()=>void, release!:()=>void;const started=new Promise<void>(r=>entered=r), gate=new Promise<void>(r=>release=r);let count=0;
  const s=createEmailService({provider:{async send(payload,key){count++;assert.equal((await db().emailDelivery.findUniqueOrThrow({where:{id:payload.deliveryId}})).state,"DISPATCHING");assert.equal(await db().emailSendAttempt.count({where:{deliveryId:payload.deliveryId}}),1);assert.equal(key,"matchmaker-email/"+payload.deliveryId);entered();await gate;return{outcome:"ACCEPTED",providerMessageId:randomUUID()};},async get(){return null;}}});
  const f=await approved(s), first=s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));await started;await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),/changed/);release();const result=await first;assert.equal(result.state,"ACCEPTED");assert.equal(count,1);assert.equal(result.attemptCount,1);await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(result.revision)),/duplicate sends/);
});
test("network timeout remains UNKNOWN; only the same frozen payload/key can be explicitly retried", async () => {
  const keys:string[]=[],payloads:FrozenEmail[]=[];let count=0;const s=createEmailService({provider:{async send(payload,key){keys.push(key);payloads.push(payload);if(++count===1)throw new DOMException("Synthetic timeout","TimeoutError");return{outcome:"ACCEPTED",providerMessageId:randomUUID()};},async get(){return null;}}});
  const f=await approved(s), first=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));assert.equal(first.state,"UNKNOWN");assert.ok(first.canRetry);await assert.rejects(s.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:f.preview.previewToken,confirmation:"APPROVE EMAIL"}),/unresolved send/);
  const replacement=await s.createDraft(headers,{workflowId:f.workflow.id,recipient:"SOURCE"}),preview=await s.previewApproval(headers,replacement.id,{revision:replacement.revision});await assert.rejects(s.approve(headers,replacement.id,{revision:replacement.revision,previewToken:preview.previewToken,confirmation:"APPROVE EMAIL"}),/including a new draft/);
  const second=await s.dispatch(headers,f.delivery.id,sendInput(first.revision));assert.equal(second.state,"ACCEPTED");assert.equal(second.attemptCount,2);assert.equal(keys[0],keys[1]);assert.deepEqual(payloads[0],payloads[1]);
});
test("rejection is not delivery; rejection of a retry does not disprove original uncertain acceptance", async () => {
  const s=createEmailService({provider:{async send(){return{outcome:"REJECTED",errorCode:"validation_error"};},async get(){return null;}}}), f=await approved(s), result=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));assert.equal(result.state,"REJECTED");assert.equal(result.canRetry,false);await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(result.revision)),/duplicate sends/);
  let count=0;const retry=createEmailService({provider:{async send(){return ++count===1?{outcome:"UNKNOWN",errorCode:"NETWORK_UNCERTAIN"}:{outcome:"REJECTED",errorCode:"validation_error"};},async get(){return null;}}}), g=await approved(retry), one=await retry.dispatch(headers,g.delivery.id,sendInput(g.delivery.revision)),two=await retry.dispatch(headers,g.delivery.id,sendInput(one.revision));assert.equal(two.state,"UNKNOWN");
});
test("database failure after provider acceptance preserves key/attempt and is reconciled without resending", async () => {
  let payload!:FrozenEmail;const providerId=randomUUID();let count=0;const s=createEmailService({provider:{async send(p){payload=p;count++;return{outcome:"ACCEPTED",providerMessageId:providerId};},async get(id){return retrieved(payload,id);}},beforePersist:async()=>{throw new Error("Synthetic local write failure");}}),f=await approved(s);
  await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),/uncertain/);const unknown=await s.getDelivery(headers,f.delivery.id);assert.equal(unknown.state,"UNKNOWN");assert.equal(unknown.attemptCount,1);assert.equal(unknown.attempts[0].outcome,"UNKNOWN");
  const result=await s.reconcile(headers,f.delivery.id,{revision:unknown.revision,providerMessageId:providerId,confirmation:"RECONCILE EMAIL"});assert.equal(result.state,"DELIVERED");assert.equal(result.providerMessageId,providerId);assert.equal(count,1);
});
test("expired approval and 23-hour retry ceiling never permit another network submission or replacement", async () => {
  let time=Date.now(),count=0;const s=createEmailService({now:()=>time,provider:{async send(){count++;return{outcome:"UNKNOWN",errorCode:"NETWORK_UNCERTAIN"};},async get(){return null;}}}),f=await approved(s),first=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));time+=24*3600000;
  const state=await s.getDelivery(headers,f.delivery.id);assert.equal(state.state,"UNKNOWN");assert.equal(state.canRetry,false);await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(state.revision)),/expired/);assert.equal(count,1);
  const preview=await s.previewApproval(headers,f.draft.id,{revision:f.draft.revision});await assert.rejects(s.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:preview.previewToken,confirmation:"APPROVE EMAIL"}),/unresolved send/);assert.ok(first.retryUntil);
});
test("changing provider credentials after uncertainty blocks a cross-account idempotent retry", async () => {
  const s=createEmailService({provider:{async send(){return{outcome:"UNKNOWN",errorCode:"NETWORK_UNCERTAIN"};},async get(){return null;}}}),f=await approved(s),first=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),key=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY="re_other_synthetic_account";try{await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(first.revision)),/credentials changed/);}finally{process.env.RESEND_API_KEY=key;}
});
test("verified raw-body webhooks reject invalid signatures, altered JSON, timestamp bounds and unsupported schema", async () => {
  const id=randomUUID(),request=signed(id),raw=await request.clone().text();const altered=new Request(request.url,{method:"POST",headers:request.headers,body:raw+" "});assert.equal((await webhookRoute.POST(altered)).status,400);
  const bad=new Request(request.url,{method:"POST",body:raw});assert.equal((await webhookRoute.POST(bad)).status,400);
  for(const offset of [-301000,301000])assert.equal((await webhookRoute.POST(signed(id,"email.delivered",undefined,new Date(),undefined,new Date(Date.now()+offset)))).status,400);
  assert.equal((await webhookRoute.POST(signed(id,"email.opened"))).status,400);
});
test("valid unmatched events are durable before success; repeated IDs deduplicate and old signed replays fail", async () => {
  const request=signed(randomUUID()),clone=request.clone();const first=await service.webhook(request);assert.equal(first.duplicate,false);const second=await service.webhook(clone);assert.equal(second.duplicate,true);const id=clone.headers.get("svix-id")!;assert.equal(await db().emailProviderEvent.count({where:{id}}),1);assert.equal((await db().emailProviderEvent.findUniqueOrThrow({where:{id}})).deliveryId,null);
  assert.ok(!JSON.stringify(await db().emailProviderEvent.findMany()).includes(canary));
});
test("early event before accepted response persists and associates without regressing delivered to accepted", async () => {
  const providerId=randomUUID();const s=createEmailService({provider:{async send(payload){await s.webhook(signed(providerId,"email.delivered",payload.deliveryId));assert.equal((await db().emailProviderEvent.findFirstOrThrow({where:{providerMessageId:providerId}})).deliveryId,null);return{outcome:"ACCEPTED",providerMessageId:providerId};},async get(){return null;}}});
  const f=await approved(s),result=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));assert.equal(result.state,"DELIVERED");assert.equal(result.events.length,1);assert.equal(result.attempts[0].outcome,"ACCEPTED");
});
test("out-of-order verified events preserve status while retaining contradictory terminal evidence", async () => {
  const f=await approved(),result=await service.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),id=result.providerMessageId!,base=new Date(Date.now()-2000);
  await service.webhook(signed(id,"email.delivered",f.delivery.id,base));await service.webhook(signed(id,"email.sent",f.delivery.id,new Date()));assert.equal((await service.getDelivery(headers,f.delivery.id)).state,"DELIVERED");
  await service.webhook(signed(id,"email.bounced",f.delivery.id,new Date(base.valueOf()-1000)));assert.equal((await service.getDelivery(headers,f.delivery.id)).state,"DELIVERED");await service.webhook(signed(id,"email.bounced",f.delivery.id,new Date()));assert.equal((await service.getDelivery(headers,f.delivery.id)).state,"BOUNCED");assert.equal((await service.getDelivery(headers,f.delivery.id)).events.length,4);
});
test("webhook audit failure rolls back event/state and never returns successful acknowledgement", async () => {
  const request=signed(randomUUID()),id=request.headers.get("svix-id")!;await db().$executeRawUnsafe("CREATE TRIGGER fail_email_event BEFORE INSERT ON AuditEvent WHEN NEW.action='EMAIL_WEBHOOK_STORED' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");try{assert.equal((await webhookRoute.POST(request.clone())).status,503);assert.equal(await db().emailProviderEvent.count({where:{id}}),0);}finally{await db().$executeRawUnsafe("DROP TRIGGER fail_email_event");}assert.equal((await webhookRoute.POST(request)).status,200);
});
test("manual reconciliation checks exact frozen message and tag; forged ID/state cannot authorize a send", async () => {
  let payload!:FrozenEmail;const s=createEmailService({provider:{async send(p){payload=p;return{outcome:"UNKNOWN",errorCode:"NETWORK_UNCERTAIN"};},async get(id){return{...retrieved(payload,id),text:"wrong body"};}}}),f=await approved(s),one=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));const result=await s.reconcile(headers,f.delivery.id,{revision:one.revision,providerMessageId:randomUUID(),confirmation:"RECONCILE EMAIL"});assert.equal(result.state,"UNKNOWN");assert.equal(result.providerMessageId,null);
  await assert.rejects(s.reconcile(headers,f.delivery.id,{revision:result.revision,providerMessageId:randomUUID(),confirmation:"RECONCILE EMAIL",state:"DELIVERED"}));
});
test("editing or profile deletion never cancels provider acceptance or erases the durable delivery ledger", async () => {
  const f=await approved(),accepted=await service.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));await service.editDraft(headers,f.draft.id,{revision:f.draft.revision,subject:"New message",body:"New text"});assert.equal((await service.getDelivery(headers,f.delivery.id)).state,"ACCEPTED");await assert.rejects(service.cancel(headers,f.delivery.id,{revision:accepted.revision,confirmation:"CANCEL EMAIL"}),/unsent/);
  const profile=await p.getProfile(headers,f.a.id);await p.deleteProfile(headers,f.a.id,{revision:profile.revision,confirmation:"DELETE "+profile.displayName});assert.equal(await db().emailDraft.count({where:{id:f.draft.id}}),0);const retained=await db().emailDelivery.findUniqueOrThrow({where:{id:f.delivery.id}});assert.equal(retained.draftId,null);assert.equal(retained.state,"ACCEPTED");assert.equal(await db().emailSendAttempt.count({where:{deliveryId:f.delivery.id}}),1);await assert.rejects(db().emailDelivery.delete({where:{id:f.delivery.id}}));
});
test("HTTP mutations enforce origin/strict schemas; GET cannot approve/dispatch and exposes no provider secrets", async () => {
  const f=await approved(),route="email/deliveries/"+f.delivery.id+"/dispatch",ctx={params:Promise.resolve({path:route.split("/")})},forged=new Headers(headers);forged.set("origin","https://forged.invalid");
  assert.equal((await POST(new Request("http://127.0.0.1:3100/api/workspace/"+route,{method:"POST",headers:forged,body:JSON.stringify(sendInput(f.delivery.revision))}),ctx)).status,403);
  assert.equal((await GET(new Request("http://127.0.0.1:3100/api/workspace/"+route,{headers}),ctx)).status,404);
  const h=new Headers(headers);h.set("content-type","application/json");assert.equal((await POST(new Request("http://127.0.0.1:3100/api/workspace/"+route,{method:"POST",headers:h,body:JSON.stringify({...sendInput(f.delivery.revision),state:"DELIVERED"})}),ctx)).status,400);
  assert.equal((await PATCH(new Request("http://127.0.0.1:3100/api/workspace/email/drafts/"+f.draft.id,{method:"PATCH",headers:h,body:JSON.stringify({revision:f.draft.revision,subject:"Header\r\nInjection",body:"Text"})}),{params:Promise.resolve({path:["email","drafts",f.draft.id]})})).status,400);
  const response=await GET(new Request("http://127.0.0.1:3100/api/workspace/email?workflowId="+f.workflow.id,{headers}),{params:Promise.resolve({path:["email"]})});assert.equal(response.status,200);const raw=await response.text();for(const key of [process.env.RESEND_API_KEY!,process.env.RESEND_WEBHOOK_SECRET!,process.env.CONTACT_ENCRYPTION_KEY!])assert.ok(!raw.includes(key));
});
test("approval audit failure rolls back the exact snapshot and cannot call transport",async()=>{
  const f=await fixture();assert.ok(f.draft);const preview=await service.previewApproval(headers,f.draft.id,{revision:f.draft.revision}),before=calls.length;
  await db().$executeRawUnsafe("CREATE TRIGGER fail_email_approval BEFORE INSERT ON AuditEvent WHEN NEW.action='EMAIL_APPROVED' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  try{await assert.rejects(service.approve(headers,f.draft.id,{revision:f.draft.revision,previewToken:preview.previewToken,confirmation:"APPROVE EMAIL"}));assert.equal(await db().emailDelivery.count({where:{originalDraftId:f.draft.id}}),0);assert.equal(calls.length,before);}finally{await db().$executeRawUnsafe("DROP TRIGGER fail_email_approval");}
});
test("changed preferences and archived candidates invalidate exact outgoing approval",async()=>{
  const f=await approved(),profile=await p.getProfile(headers,f.b.id);await p.savePreference(headers,f.b.id,{revision:profile.revision,preference:{minAge:25,maxAge:40,locations:[],sharedValues:[],goals:[],lifestyle:[],dealBreakers:[]}});await assert.rejects(service.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision)),/human-approved/);
  const g=await approved(),candidate=await p.getProfile(headers,g.b.id);await p.changeStatus(headers,g.b.id,{revision:candidate.revision,status:"ARCHIVED"});await assert.rejects(service.dispatch(headers,g.delivery.id,sendInput(g.delivery.revision)),/human-approved/);
});
test("active reconciliation lease excludes another reconciliation and dispatch while webhooks can add evidence",async()=>{
  let enter!:()=>void,release!:()=>void,payload!:FrozenEmail;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),providerId=randomUUID();
  const s=createEmailService({provider:{async send(p){payload=p;return{outcome:"ACCEPTED",providerMessageId:providerId};},async get(id){enter();await gate;return retrieved(payload,id,"sent");}}}),f=await approved(s),accepted=await s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));
  const request=s.reconcile(headers,f.delivery.id,{revision:accepted.revision,confirmation:"RECONCILE EMAIL"});await entered;const leased=await s.getDelivery(headers,f.delivery.id);assert.equal(leased.canReconcile,false);
  await assert.rejects(s.reconcile(headers,f.delivery.id,{revision:leased.revision,confirmation:"RECONCILE EMAIL"}),/active operation lease/);await assert.rejects(s.dispatch(headers,f.delivery.id,sendInput(leased.revision)),/using this delivery/);
  await s.webhook(signed(providerId,"email.delivered",f.delivery.id));release();const result=await request;assert.equal(result.state,"DELIVERED");assert.equal(result.canDispatch,false);
});
test("abandoned dispatch lease recovers honest uncertainty; late evidence cannot erase terminal reconciliation",async()=>{
  let time=Date.now(),enter!:()=>void,release!:()=>void,payload!:FrozenEmail;const entered=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r),providerId=randomUUID();
  const s=createEmailService({now:()=>time,provider:{async send(p){payload=p;enter();await gate;return{outcome:"ACCEPTED",providerMessageId:providerId};},async get(id){return retrieved(payload,id);}}}),f=await approved(s),send=s.dispatch(headers,f.delivery.id,sendInput(f.delivery.revision));await entered;time+=31000;
  const expired=await s.getDelivery(headers,f.delivery.id);assert.equal(expired.state,"UNKNOWN");const reconciled=await s.reconcile(headers,f.delivery.id,{revision:expired.revision,providerMessageId:providerId,confirmation:"RECONCILE EMAIL"});assert.equal(reconciled.state,"DELIVERED");assert.equal(reconciled.attempts[0].outcome,"UNKNOWN");release();assert.equal((await send).state,"DELIVERED");assert.equal((await db().emailDelivery.findUniqueOrThrow({where:{id:f.delivery.id}})).leaseToken,null);
});
test("same signed event ID with altered evidence is rejected; oversize raw requests cannot acknowledge evidence",async()=>{
  const id="msg_"+randomUUID().replaceAll("-", ""),providerId=randomUUID();await service.webhook(signed(providerId,"email.delivered",undefined,new Date(),id));await assert.rejects(service.webhook(signed(providerId,"email.bounced",undefined,new Date(),id)),/Invalid webhook/);
  assert.equal((await webhookRoute.POST(new Request("http://127.0.0.1:3100/api/webhooks/resend",{method:"POST",body:"x".repeat(65537)}))).status,413);
  const stale=signed(providerId,"email.delivered",undefined,new Date(),id,new Date(Date.now()-301000));assert.equal((await webhookRoute.POST(stale)).status,400);
});
test("DEMO drafts are local-only; reset counts/version-binds them while retaining REAL delivery evidence",async()=>{
  await p.seedDemo(headers);const demos=(await p.listProfiles(headers,{kind:"DEMO"})).profiles;let current=await w.createWorkflow(headers,{sourceId:demos[0].id,sourceRevision:demos[0].revision});const candidate=(await w.workflowCandidates(headers,current.id,{})).results[0];assert.ok(candidate);
  current=await command(current,{action:"candidate",candidateId:candidate.candidate.id,assessmentStamp:candidate.assessmentStamp});current=await command(current,{action:"review",snapshotId:current.snapshotId,confirmation:"REVIEWED"});current=await command(current,{action:"approve",snapshotId:current.snapshotId,confirmation:"APPROVE MATCH"});
  const draft=await service.createDraft(headers,{workflowId:current.id,recipient:"SOURCE"});await assert.rejects(service.previewApproval(headers,draft.id,{revision:draft.revision}),/REAL recipient/);
  const preview=await p.previewDemoReset(headers);assert.equal(preview.emailDrafts,1);await service.editDraft(headers,draft.id,{revision:draft.revision,subject:draft.subject,body:"Edited synthetic draft"});await assert.rejects(p.resetDemo(headers,{confirmation:"RESET DEMO",confirmationToken:preview.confirmationToken}),/changed/);
  const before=await db().emailDelivery.findMany(),updated=await p.previewDemoReset(headers);await p.resetDemo(headers,{confirmation:"RESET DEMO",confirmationToken:updated.confirmationToken});assert.equal(await db().emailDraft.count({where:{id:draft.id}}),0);assert.deepEqual(await db().emailDelivery.findMany(),before);
});
