import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import type {WorkflowDTO} from "../src/domain/workflow";
import type {Assessment} from "../src/domain/matching";
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"matchmaker-stage6-"));
Object.assign(process.env,{DATABASE_URL:"file:"+path.join(directory,"matchmaker.sqlite"),BETTER_AUTH_URL:"http://127.0.0.1:3100",BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),MATCHMAKER_SETUP_TOKEN:randomBytes(32).toString("hex"),CONTACT_ENCRYPTION_KEY:randomBytes(32).toString("base64"),CONTACT_KEY_ID:"stage6-test",MATCHMAKER_TEST_MODE:"1",GEMINI_ENABLED:"false"});
const {db}=await import("../src/server/db");
const {bootstrap}=await import("../src/server/bootstrap");
const {auth}=await import("../src/server/auth");
const p=await import("../src/server/profiles");
const w=await import("../src/server/workflows");
const m=await import("../src/server/matching");
const {GET,POST,PATCH}=await import("../src/app/api/workspace/[...path]/route");
let headers:Headers,actorId:string;
const canary="workflow-private@example.invalid",today=new Date().toISOString().slice(0,10);
const core={displayName:"Synthetic workflow",reportedAge:30,ageConfirmedOn:today,city:"City",region:"Region",country:"Country",education:null,occupation:"Synthetic",interests:["Art"],values:["Kindness"],relationshipGoals:["LONG_TERM"],lifestyle:["NON_SMOKER"],communicationStyle:"Direct",bio:canary};
const pref={minAge:25,maxAge:40,locations:[],sharedValues:[],goals:[],lifestyle:[],dealBreakers:[]};
async function change(current:WorkflowDTO,input:object){return w.mutateWorkflow(headers,current.id,{...input,revision:current.revision});}
async function findCandidate(current:WorkflowDTO,id:string){const page=await w.workflowCandidates(headers,current.id,{}),found=page.results.find(r=>r.candidate.id===id);if(found)return found;throw new Error("Synthetic candidate is outside the top-ten workflow recommendations.");}
async function fixture(){const marker="Pref-"+randomUUID().slice(0,8);let a=await p.createProfile(headers,core);const b=await p.createProfile(headers,{...core,displayName:"Synthetic candidate",values:["Kindness",marker]});await p.savePreference(headers,a.id,{revision:a.revision,preference:{...pref,sharedValues:[marker]}});a=await p.getProfile(headers,a.id);let current=await w.createWorkflow(headers,{sourceId:a.id,sourceRevision:a.revision});const candidate=await findCandidate(current,b.id);current=await change(current,{action:"candidate",candidateId:b.id,assessmentStamp:candidate.assessmentStamp});return {a,b,current};}
async function review(current:WorkflowDTO){return change(current,{action:"review",snapshotId:current.snapshotId,confirmation:"REVIEWED"});}
async function approve(current:WorkflowDTO){return change(current,{action:"approve",snapshotId:current.snapshotId,confirmation:"APPROVE MATCH"});}
function request(route:string,body?:unknown,method="PATCH",h=headers){return new Request("http://127.0.0.1:3100/api/workspace/"+route,{method,headers:{...Object.fromEntries(h),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const context=(route:string)=>({params:Promise.resolve({path:route.split("/")})});
before(async()=>{
  const migrated=spawnSync(process.execPath,["--import","tsx","scripts/database.ts"],{encoding:"utf8",env:process.env});assert.equal(migrated.status,0,migrated.stdout+migrated.stderr);
  await bootstrap({token:process.env.MATCHMAKER_SETUP_TOKEN,name:"Synthetic Stage6 Operator",email:"stage6@example.invalid",password:"Synthetic-stage6-passphrase"});
  const response=await auth().api.signInEmail({body:{email:"stage6@example.invalid",password:"Synthetic-stage6-passphrase",rememberMe:false},headers:new Headers({origin:"http://127.0.0.1:3100"}),asResponse:true});
  headers=new Headers({cookie:response.headers.getSetCookie().map(v=>v.split(";")[0]).join("; "),origin:"http://127.0.0.1:3100"});actorId=(await db().user.findFirstOrThrow()).id;
});
after(async()=>{await db().$disconnect();});
test("every workflow service and HTTP read/mutation independently rejects anonymous access",async()=>{
  const id=randomUUID();
  for(const operation of [()=>w.listWorkflows(new Headers()),()=>w.getWorkflow(new Headers(),id),()=>w.createWorkflow(new Headers(),{}),()=>w.workflowCandidates(new Headers(),id,{}),()=>w.mutateWorkflow(new Headers(),id,{})])await assert.rejects(operation,/sign in/);
  for(const [route,method,handler] of [["workflows","GET",GET],["workflows","POST",POST],["workflows/"+id,"PATCH",PATCH],["workflows/"+id+"/candidates","POST",POST]] as const){const response=await handler(request(route,method==="GET"?undefined:{},method,new Headers({origin:"http://127.0.0.1:3100"})),context(route));assert.equal(response.status,401);}
});
test("only one active source context exists; invalid/archived/stale sources cannot create workflows",async()=>{
  const {a,current}=await fixture();await assert.rejects(w.createWorkflow(headers,{sourceId:a.id,sourceRevision:a.revision}),/active workflow/);
  await change(current,{action:"archive",confirmation:"ARCHIVE WORKFLOW"});assert.ok(await w.createWorkflow(headers,{sourceId:a.id,sourceRevision:a.revision}));
  const unknown=await p.createProfile(headers,{...core,reportedAge:null,ageConfirmedOn:null});await assert.rejects(w.createWorkflow(headers,{sourceId:unknown.id,sourceRevision:unknown.revision}),/confirmed adult/);
  const inactive=await p.createProfile(headers,core);await p.changeStatus(headers,inactive.id,{revision:inactive.revision,status:"ARCHIVED"});await assert.rejects(w.createWorkflow(headers,{sourceId:inactive.id,sourceRevision:inactive.revision}),/active, approved profile/);
});
test("strict schemas reject actor/score/version claims, bad IDs, cross-workflow snapshots and cross-origin bodies",async()=>{
  const {current}=await fixture(),other=await fixture();
  for(const extra of [{actorId:"forged"},{score:100},{eligibility:"ELIGIBLE"},{algorithmVersion:"forged"}])await assert.rejects(change(current,{action:"review",snapshotId:current.snapshotId,confirmation:"REVIEWED",...extra}));
  await assert.rejects(change(current,{action:"review",snapshotId:other.current.snapshotId,confirmation:"REVIEWED"}),/belonging/);
  await assert.rejects(db().workflow.update({where:{id:current.id},data:{snapshotId:other.current.snapshotId}}));
  await assert.rejects(db().matchDecision.create({data:{workflowId:current.id,snapshotId:other.current.snapshotId!,sourceId:current.source.id,candidateId:current.candidate!.id,type:"APPROVED",actorId,sequence:100,reviewedAt:new Date()}}));
  const route="workflows/"+current.id;
  const forged=new Headers(headers);forged.set("origin","https://forged.invalid");assert.equal((await PATCH(request(route,{},"PATCH",forged),context(route))).status,403);
  assert.equal((await GET(request("workflows/invalid",undefined,"GET"),context("workflows/invalid"))).status,400);
  assert.equal((await PATCH(request(route,{action:"review",revision:current.revision,snapshotId:other.current.snapshotId,confirmation:"REVIEWED"}),context(route))).status,409);
});
test("GET, ranking and page-data reads never review or approve; decisions require explicit review",async()=>{
  const {current}=await fixture();const counts=async()=>[await db().matchDecision.count(),await db().auditEvent.count(),await db().assessmentSnapshot.count(),(await db().workflow.findUniqueOrThrow({where:{id:current.id}})).revision];
  const before=await counts();await w.getWorkflow(headers,current.id);await w.listWorkflows(headers);await w.workflowCandidates(headers,current.id,{});
  const route="workflows/"+current.id;assert.equal((await GET(request(route,undefined,"GET"),context(route))).status,200);
  assert.equal((await GET(request(route+"/approve",undefined,"GET"),context(route+"/approve"))).status,404);assert.deepEqual(await counts(),before);
  await assert.rejects(approve(current),/review/);assert.deepEqual(await counts(),before);
});
test("selection recalculates server eligibility and rejects stale stamps, self and mixed demo pairs",async()=>{
  const {a,b,current}=await fixture();const stamp=(await findCandidate(current,b.id)).assessmentStamp;
  await p.updateProfile(headers,b.id,{revision:b.revision,profile:{...core,displayName:"Changed candidate"}});
  await assert.rejects(change(current,{action:"candidate",candidateId:b.id,assessmentStamp:stamp}),/evidence changed/);
  await assert.rejects(change(current,{action:"candidate",candidateId:a.id,assessmentStamp:"0".repeat(64)}),/excluded/);
  await p.seedDemo(headers);const demo=(await p.listProfiles(headers,{kind:"DEMO"})).profiles[0];
  await assert.rejects(change(current,{action:"candidate",candidateId:demo.id,assessmentStamp:"0".repeat(64)}),/excluded/);
  await assert.rejects(db().workflow.update({where:{id:current.id},data:{candidateId:a.id,snapshotId:null}}));
  await assert.rejects(db().workflow.update({where:{id:current.id},data:{candidateId:demo.id,snapshotId:null}}));
});
test("two concurrent approvals produce exactly one decision; repeats and stale tabs safely conflict",async()=>{
  const current=await review((await fixture()).current);
  const results=await Promise.allSettled([approve(current),approve(current)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const saved=await w.getWorkflow(headers,current.id);assert.equal(saved.status,"MATCH_APPROVED");assert.equal(saved.history.length,1);assert.equal(saved.currentStep,4);
  const decision=await db().matchDecision.findFirstOrThrow({where:{workflowId:current.id}});assert.equal(decision.actorId,actorId);assert.equal(decision.snapshotId,current.snapshotId);
  await assert.rejects(approve(current),/another tab/);await assert.rejects(approve(saved),/review/);
  await assert.rejects(change(current,{action:"navigate",step:1}),/another tab/);
});
test("approval/rejection racing cannot establish conflicting current decisions",async()=>{
  const current=await review((await fixture()).current);const results=await Promise.allSettled([approve(current),change(current,{action:"reject",snapshotId:current.snapshotId,confirmation:"REJECT MATCH"})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(await db().matchDecision.count({where:{workflowId:current.id}}),1);
});
test("rejection locks draft; reopen appends history and needs a different snapshot and fresh review",async()=>{
  let current=await review((await fixture()).current);const original=current.snapshotId;
  current=await change(current,{action:"reject",snapshotId:original,confirmation:"REJECT MATCH"});await assert.rejects(change(current,{action:"navigate",step:4}),/approval/);
  await assert.rejects(change(current,{action:"refresh"}),/Reopen/);await assert.rejects(change(current,{action:"source",sourceId:current.source.id,sourceRevision:current.sourceRevision}),/Reopen/);
  current=await change(current,{action:"reopen",confirmation:"REOPEN MATCH"});assert.deepEqual(current.history.map(d=>d.type),["REJECTED","REOPENED"]);assert.equal(current.reviewedAt,null);assert.equal(current.snapshotId,null);
  current=await change(current,{action:"refresh"});assert.notEqual(current.snapshotId,original);await assert.rejects(approve(current),/review/);current=await approve(await review(current));assert.deepEqual(current.history.map(d=>d.type),["REJECTED","REOPENED","APPROVED"]);
});
test("safe back navigation preserves context; changing candidate/source clears review without deleting snapshots",async()=>{
  let current=await review((await fixture()).current);const old=current.snapshotId;current=await change(current,{action:"navigate",step:1});assert.equal(current.snapshotId,old);assert.ok(current.reviewedAt);
  const sourceDetails=await p.getProfile(headers,current.source.id),sharedValue=(sourceDetails.preference?.data as {sharedValues:string[]}|undefined)?.sharedValues[0];assert.ok(sharedValue);const replacement=await p.createProfile(headers,{...core,displayName:"Replacement",values:["Kindness",sharedValue]});const candidate=await findCandidate(current,replacement.id);
  current=await change(current,{action:"candidate",candidateId:replacement.id,assessmentStamp:candidate.assessmentStamp});assert.equal(current.reviewedAt,null);assert.notEqual(current.snapshotId,old);
  const source=await p.createProfile(headers,{...core,displayName:"New source"});current=await change(current,{action:"source",sourceId:source.id,sourceRevision:source.revision});assert.equal(current.candidate,null);assert.equal(current.snapshotId,null);assert.equal(current.currentStep,1);assert.equal(await db().assessmentSnapshot.count({where:{workflowId:current.id}}),2);
});
test("source/candidate and both preference revisions invalidate reviews and commit sanitized stale audits",async()=>{
  for(const kind of ["source","candidate","sourcePreference","candidatePreference"]){const fixtureData=await fixture(),current=await review(fixtureData.current),profile=kind.startsWith("source")?fixtureData.a:fixtureData.b;
    if(kind.endsWith("Preference"))await p.savePreference(headers,profile.id,{revision:profile.revision,preference:pref});else await p.updateProfile(headers,profile.id,{revision:profile.revision,profile:{...core,displayName:"Updated synthetic"}});
    const loaded=await w.getWorkflow(headers,current.id);assert.equal(loaded.stale,true);assert.equal(loaded.reviewedAt,null);assert.equal(loaded.status,"REVIEW_REQUIRED");
    await assert.rejects(approve(current),/Assessment changed/);const stored=await db().workflow.findUniqueOrThrow({where:{id:current.id}});assert.equal(stored.status,"REVIEW_REQUIRED");assert.equal(stored.reviewedAt,null);assert.equal(await db().matchDecision.count({where:{workflowId:current.id}}),0);assert.equal(await db().auditEvent.count({where:{action:"WORKFLOW_STALE",entityId:current.id}}),1);
    await assert.rejects(approve(await w.getWorkflow(headers,current.id)),/Assessment changed/);assert.equal(await db().auditEvent.count({where:{action:"WORKFLOW_STALE",entityId:current.id}}),1);
    const back=await change(await w.getWorkflow(headers,current.id),{action:"navigate",step:1});assert.ok(back.stale);assert.equal(back.currentStep,1);assert.equal(back.reviewedAt,null);
  }
});
test("weight and algorithm changes block review; archived/ineligible and unknown hard evidence block progression",async()=>{
  let current=await review((await fixture()).current);const settings=await m.getScoringSettings(headers);
  await m.saveScoringSettings(headers,{version:settings.version,weights:{...settings.weights,age:settings.weights.age+1},confirmation:"SAVE WEIGHTS"});await assert.rejects(approve(current),/Assessment changed/);
  const f=await fixture();current=f.current;const old=await db().assessmentSnapshot.findUniqueOrThrow({where:{id:current.snapshotId!}}),assessment={...(old.assessment as Assessment),algorithmVersion:"older-algorithm"};
  const snapshot=await db().assessmentSnapshot.create({data:{workflowId:current.id,sourceId:current.source.id,candidateId:current.candidate!.id,stamp:w.assessmentStamp(current.source.id,current.candidate!.id,assessment),assessment}});await db().workflow.update({where:{id:current.id},data:{snapshotId:snapshot.id,revision:{increment:1}}});current=await w.getWorkflow(headers,current.id);assert.ok(current.stale);await assert.rejects(review(current),/Assessment changed/);
  const g=await fixture();current=await review(g.current);await p.savePreference(headers,g.b.id,{revision:g.b.revision,preference:{...pref,locations:[],dealBreakers:["LOCATION"]}});await assert.rejects(approve(current),/Assessment changed/);current=await w.getWorkflow(headers,current.id);await assert.rejects(change(current,{action:"refresh"}),/unresolved eligibility/);
  const h=await fixture();current=await approve(await review(h.current));await p.changeStatus(headers,h.b.id,{revision:h.b.revision,status:"ARCHIVED"});await assert.rejects(change(current,{action:"navigate",step:5}),/Assessment changed/);assert.equal((await w.getWorkflow(headers,current.id)).currentStep,3);
});
test("audit failure rolls back the decision and workflow mutation together",async()=>{
  const current=await review((await fixture()).current);
  await db().$executeRawUnsafe("CREATE TRIGGER stage6_test_audit_failure BEFORE INSERT ON AuditEvent WHEN NEW.action='MATCH_APPROVED' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  try{await assert.rejects(approve(current));assert.equal(await db().matchDecision.count({where:{workflowId:current.id}}),0);assert.equal((await w.getWorkflow(headers,current.id)).revision,current.revision);}
  finally{await db().$executeRawUnsafe("DROP TRIGGER stage6_test_audit_failure");}
});
test("snapshots/decisions are immutable; deliberate profile deletion cascades the journey, preserving sanitized audit",async()=>{
  const f=await fixture(),current=await approve(await review(f.current)),decision=await db().matchDecision.findFirstOrThrow({where:{workflowId:current.id}});
  await assert.rejects(db().assessmentSnapshot.update({where:{id:current.snapshotId!},data:{stamp:"1".repeat(64)}}));await assert.rejects(db().assessmentSnapshot.delete({where:{id:current.snapshotId!}}));await assert.rejects(db().matchDecision.update({where:{id:decision.id},data:{type:"REJECTED"}}));await assert.rejects(db().matchDecision.delete({where:{id:decision.id}}));
  await p.saveContact(headers,f.a.id,{revision:f.a.revision,contact:{email:canary,phone:null}});
  const values=JSON.stringify(await db().assessmentSnapshot.findMany());assert.ok(!values.includes(canary));assert.ok(!values.includes("bio"));assert.ok(!JSON.stringify(await db().auditEvent.findMany()).includes(canary));
  const source=await p.getProfile(headers,f.a.id);await p.deleteProfile(headers,source.id,{revision:source.revision,confirmation:"DELETE "+source.displayName});assert.equal(await db().workflow.count({where:{id:current.id}}),0);assert.equal(await db().matchDecision.count({where:{workflowId:current.id}}),0);assert.equal(await db().assessmentSnapshot.count({where:{workflowId:current.id}}),0);assert.ok(await db().auditEvent.count({where:{entityId:current.id}}));
});
test("demo reset counts/version-binds workflow dependents and preserves every REAL workflow and decision",async()=>{
  const real=await approve(await review((await fixture()).current));await p.seedDemo(headers);const demo=(await p.listProfiles(headers,{kind:"DEMO"})).profiles;
  let current=await w.createWorkflow(headers,{sourceId:demo[0].id,sourceRevision:demo[0].revision});const page=await w.workflowCandidates(headers,current.id,{}),candidate=page.results[0];current=await change(current,{action:"candidate",candidateId:candidate.candidate.id,assessmentStamp:candidate.assessmentStamp});current=await approve(await review(current));
  const stale=await p.previewDemoReset(headers);assert.equal(stale.workflows,1);assert.equal(stale.decisions,1);assert.equal(stale.snapshots,1);current=await change(current,{action:"navigate",step:5});await assert.rejects(p.resetDemo(headers,{confirmation:"RESET DEMO",confirmationToken:stale.confirmationToken}),/Demo data changed/);
  const fresh=await p.previewDemoReset(headers),realCount=await db().workflow.count({where:{source:{kind:"REAL"}}});await p.resetDemo(headers,{confirmation:"RESET DEMO",confirmationToken:fresh.confirmationToken});assert.equal(await db().workflow.count({where:{id:current.id}}),0);assert.equal(await db().workflow.count({where:{source:{kind:"REAL"}}}),realCount);assert.deepEqual((await w.getWorkflow(headers,real.id)).history,real.history);
});
