import { test,before,after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"matchmaker-stage5-"));
Object.assign(process.env,{DATABASE_URL:"file:"+path.join(directory,"matchmaker.sqlite"),BETTER_AUTH_URL:"http://127.0.0.1:3100",BETTER_AUTH_SECRET:randomBytes(32).toString("hex"),MATCHMAKER_SETUP_TOKEN:randomBytes(32).toString("hex"),CONTACT_ENCRYPTION_KEY:randomBytes(32).toString("base64"),CONTACT_KEY_ID:"stage5-test",MATCHMAKER_TEST_MODE:"1",GEMINI_ENABLED:"false"});
const {db}=await import("../src/server/db");
const {bootstrap}=await import("../src/server/bootstrap");
const {auth}=await import("../src/server/auth");
const profiles=await import("../src/server/profiles");
const matching=await import("../src/server/matching");
const {createAiGateway,aiGateway}=await import("../src/server/ai-gateway");
const {POST,PATCH,GET}=await import("../src/app/api/workspace/[...path]/route");
const {defaultWeights}=await import("../src/domain/validation");
const {interpretLocal}=await import("../src/domain/search");
const today=new Date().toISOString().slice(0,10);
let headers:Headers,sourceId:string,candidateId:string;const unreviewedIds:string[]=[];
const canary="pii-canary@example.invalid";
const core={displayName:"Synthetic Stage5",gender:"Woman",reportedAge:30,ageConfirmedOn:today,city:"Test City",region:"Test Region",country:"Test Country",education:"Bachelor",occupation:"Synthetic job",interests:["Reading","Art"],values:["Kindness"],relationshipGoals:["LONG_TERM"],lifestyle:["NON_SMOKER"],communicationStyle:"Direct",bio:"Private bio "+canary};
const preference={minAge:25,maxAge:40,locations:[],sharedValues:[],goals:[],lifestyle:[],dealBreakers:[],communicationStyles:["Direct"],educationLevels:["Bachelor"]};
async function revision(id:string){return (await profiles.getProfile(headers,id)).revision;}
async function consent(id:string,scope:string,status="GRANTED"){return profiles.saveConsent(headers,id,{revision:await revision(id),consent:{scope,status,policyVersion:"test-v1",provenance:"synthetic-evidence"}});}
function route(pathname:string,body:unknown,method="POST"){
  return new Request("http://127.0.0.1:3100/api/workspace/"+pathname,{method,headers:{...Object.fromEntries(headers),"Content-Type":"application/json"},body:JSON.stringify(body)});
}
before(async()=>{
  const migration=spawnSync(process.execPath,["--import","tsx","scripts/database.ts"],{env:process.env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
  await bootstrap({token:process.env.MATCHMAKER_SETUP_TOKEN,name:"Synthetic Stage5 Operator",email:"stage5@example.invalid",password:"Synthetic-stage5-passphrase"});
  const response=await auth().api.signInEmail({body:{email:"stage5@example.invalid",password:"Synthetic-stage5-passphrase",rememberMe:false},headers:new Headers({origin:"http://127.0.0.1:3100"}),asResponse:true});
  headers=new Headers({cookie:response.headers.getSetCookie().map(v=>v.split(";")[0]).join("; "),origin:"http://127.0.0.1:3100"});
  sourceId=(await profiles.createProfile(headers,core)).id;
  candidateId=(await profiles.createProfile(headers,{...core,gender:"Man",displayName:"Synthetic Candidate",education:"Education "+canary,communicationStyle:"Style "+canary})).id;
  await profiles.savePreference(headers,sourceId,{revision:await revision(sourceId),preference});
  for(let i=0;i<13;i++)await profiles.createProfile(headers,{...core,gender:"Man",displayName:"Synthetic Candidate "+i});
  await profiles.saveContact(headers,candidateId,{revision:await revision(candidateId),contact:{email:canary,phone:"+91 12345 67890"}});
  for(const reviewStatus of ["PENDING","REJECTED"] as const){
    const id=(await profiles.createProfile(headers,{...core,displayName:"Synthetic "+reviewStatus+" candidate"})).id;
    await db().profile.update({where:{id},data:{status:"ARCHIVED",reviewStatus}});unreviewedIds.push(id);
  }
});
after(async()=>{await db().$disconnect();});
test("all matching, explanation, search and weight boundaries require authentication",async()=>{
  await assert.rejects(matching.rankedMatches(new Headers(),{sourceId}),/sign in/);
  await assert.rejects(matching.searchProfiles(new Headers(),{kind:"REAL"}),/sign in/);
  await assert.rejects(matching.matchingSources(new Headers()),/sign in/);
  await assert.rejects(matching.getScoringSettings(new Headers()),/sign in/);
  await assert.rejects(matching.saveScoringSettings(new Headers(),{}),/sign in/);
  await assert.rejects(aiGateway.explain(new Headers(),{sourceId,candidateId}),/sign in/);
  for(const path of ["matches","matches/explain","search/interpret","search/profiles"]){
    const response=await POST(new Request("http://127.0.0.1:3100/api/workspace/"+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://127.0.0.1:3100"},body:"{}"}),{params:Promise.resolve({path:path.split("/")})});assert.equal(response.status,401);
  }
});
test("recommendations are configurable from five to ten and expose no contacts",async()=>{
  const first=await matching.rankedMatches(headers,{sourceId});
  assert.equal(first.results.length,10);assert.equal(first.total,14);assert.equal(first.nextCursor,null);
  assert.equal(first.excluded.reasons.REVIEW_NOT_APPROVED,2);
  assert.ok(!JSON.stringify(first).includes(canary));assert.ok(!JSON.stringify(first).includes("+91 12345"));assert.ok(!JSON.stringify(first).includes("ciphertext"));
  const five=await matching.rankedMatches(headers,{sourceId,limit:5});assert.equal(five.results.length,5);assert.deepEqual(five.results,first.results.slice(0,5));
  await assert.rejects(matching.rankedMatches(headers,{sourceId,limit:4}));await assert.rejects(matching.rankedMatches(headers,{sourceId,limit:11}));
  assert.equal((await matching.rankedMatches(headers,{sourceId,filters:{gender:"man"}})).total,14);
  assert.deepEqual((await matching.rankedMatches(headers,{sourceId})).results,first.results);
  const sources=await matching.matchingSources(headers);for(const id of unreviewedIds)assert.ok(!sources.sources.some(profile=>profile.id===id));
  for(const id of unreviewedIds)await assert.rejects(matching.rankedMatches(headers,{sourceId:id}),/active, approved profile/);
});
test("dataset and scoring changes produce a different deterministic result snapshot",async()=>{
  const first=await matching.rankedMatches(headers,{sourceId});
  assert.notEqual((await matching.rankedMatches(headers,{sourceId:candidateId})).snapshot,first.snapshot);
  assert.notEqual((await matching.rankedMatches(headers,{sourceId,filters:{minAge:25}})).snapshot,first.snapshot);
  await profiles.updateProfile(headers,candidateId,{revision:await revision(candidateId),profile:{...core,gender:"Man",displayName:"Synthetic updated candidate",education:"Education "+canary,communicationStyle:"Style "+canary}});
  assert.notEqual((await matching.rankedMatches(headers,{sourceId})).snapshot,first.snapshot);
  await profiles.seedDemo(headers);
  const isolated=await matching.rankedMatches(headers,{sourceId});assert.ok(isolated.results.every(p=>p.candidate.kind==="REAL"));
  const demo=(await profiles.listProfiles(headers,{kind:"DEMO"})).profiles[0];
  const demoMatches=await matching.rankedMatches(headers,{sourceId:demo.id});assert.ok(demoMatches.results.every(p=>p.candidate.kind==="DEMO"));
});
test("strict preferences exclude candidates without exposing excluded IDs as result cards",async()=>{
  await profiles.savePreference(headers,sourceId,{revision:await revision(sourceId),preference:{...preference,minAge:35,maxAge:40,dealBreakers:["AGE_RANGE"]}});
  const results=await matching.rankedMatches(headers,{sourceId});
  assert.equal(results.results.length,0);assert.equal(results.excluded.ineligible,16);
  await profiles.savePreference(headers,sourceId,{revision:await revision(sourceId),preference});
});
test("settings normalize positive non-100 totals, version/audit transactionally and invalidate old pages",async()=>{
  const first=await matching.rankedMatches(headers,{sourceId}),old=await matching.getScoringSettings(headers);
  const weights=Object.fromEntries(Object.entries(defaultWeights).map(([k,v])=>[k,v*2]));
  const saved=await matching.saveScoringSettings(headers,{weights,version:old.version,confirmation:"SAVE WEIGHTS"});
  assert.equal(saved.version,old.version+1);
  await assert.rejects(matching.saveScoringSettings(headers,{weights,version:old.version,confirmation:"SAVE WEIGHTS"}),/settings changed/);
  await assert.rejects(matching.saveScoringSettings(headers,{weights,version:saved.version,confirmation:"wrong"}));
  assert.notEqual((await matching.rankedMatches(headers,{sourceId})).snapshot,first.snapshot);
  const event=await db().auditEvent.findFirstOrThrow({where:{action:"SCORING_WEIGHTS_UPDATED"}});
  assert.ok(Array.isArray(event.fields));assert.ok(!JSON.stringify(event).includes(canary));
});
test("strict request schemas reject arbitrary profile objects, scores, SQL, consent claims and actor IDs",async()=>{
  for(const extra of [{scores:100},{profile:core},{actorId:"user"},{consent:true},{sql:"SELECT *"}]){
    await assert.rejects(matching.rankedMatches(headers,{sourceId,...extra}));
    await assert.rejects(aiGateway.explain(headers,{sourceId,candidateId,...extra}));
  }
  const response=await POST(route("matches",{sourceId,profiles:[core]}),{params:Promise.resolve({path:["matches"]})});assert.equal(response.status,400);
  assert.equal((await PATCH(route("settings/weights",{},"PATCH"),{params:Promise.resolve({path:["settings","weights"]})})).status,400);
  assert.equal((await GET(new Request("http://127.0.0.1:3100/api/workspace/ai/raw",{headers}),{params:Promise.resolve({path:["ai","raw"]})})).status,404);
});
test("unknown/PII search stays local without unfiltered results; structured search remains useful",async()=>{
  const result=await matching.searchProfiles(headers,{kind:"REAL",query:"active profiles "+canary});assert.equal(result.profiles.length,0);assert.equal(result.interpretation?.recognized,false);
  assert.equal((await matching.searchProfiles(headers,{kind:"REAL",filters:{gender:"man"}})).total,14);
  assert.ok((await matching.searchProfiles(headers,{kind:"REAL",filters:{minAge:25,maxAge:40}})).total>0);
  assert.equal((await matching.searchProfiles(headers,{kind:"REAL",query:"same region"})).profiles.length,0);
});
test("two-profile explanations need both current scopes and send only minimized number DTOs",async()=>{
  let calls=0,serialized="";
  const gateway=createAiGateway({transport:async(task,dto)=>{calls++;assert.equal(task,"EXPLANATION");serialized=JSON.stringify(dto);return JSON.stringify({summary:"Known factor indicators need human review; incomplete evidence remains unknown."});}});
  assert.equal((await gateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Local explanation");assert.equal(calls,0);
  await consent(sourceId,"EXPLANATION");
  assert.equal((await gateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Local explanation");assert.equal(calls,0);
  await consent(candidateId,"EXPLANATION");
  assert.equal((await gateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Gemini explanation");assert.equal(calls,1);
  for(const forbidden of [canary,sourceId,candidateId,"bio","email","phone","ciphertext","displayName","apiKey","educationLevels","gender","Woman","Man"])assert.ok(!serialized.includes(forbidden),forbidden+" was not minimized");
  await consent(candidateId,"EXPLANATION","WITHDRAWN");
  assert.equal((await gateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Local explanation");assert.equal(calls,1);
});
test("consent withdrawal during generation discards output; old AI explanations are never cached/reused",async()=>{
  await consent(candidateId,"EXPLANATION");
  const gateway=createAiGateway({transport:async()=>{await consent(candidateId,"EXPLANATION","WITHDRAWN");return JSON.stringify({summary:"This model text must never be reused."});}});
  const result=await gateway.explain(headers,{sourceId,candidateId,useGemini:true});
  assert.equal(result.source,"Local explanation");assert.ok(!result.summary.includes("never be reused"));
});
test("malformed, oversized, unsolicited-score and unsafe model output plus timeouts use labeled fallback",async()=>{
  await consent(candidateId,"EXPLANATION");
  for(const raw of ["bad JSON",JSON.stringify({summary:"x".repeat(5000)}),JSON.stringify({summary:"hello",score:100}),JSON.stringify({summary:"<script>bad</script>"}),JSON.stringify({summary:canary})]){
    const gateway=createAiGateway({transport:async()=>raw});assert.equal((await gateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Local explanation");
  }
  const gateway=createAiGateway({deadlineMs:10,transport:()=>new Promise(()=>{})});
  const started=Date.now();assert.equal((await gateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Local explanation");assert.ok(Date.now()-started<2000);
  assert.equal((await aiGateway.explain(headers,{sourceId,candidateId,useGemini:true})).source,"Local explanation");
});
test("query interpretation requires SEARCH consent, sends canonical grammar alone, and validates model constraints",async()=>{
  const query="Show active profiles in the same region who want a long-term relationship and share at least two interests.";
  const local=interpretLocal(query);let calls=0;
  const gateway=createAiGateway({transport:async(task,dto)=>{calls++;assert.equal(task,"SEARCH");assert.deepEqual(dto,{query:local.safeQuery});return JSON.stringify({filters:local.filters,explanation:"Applied the specified relative region, goal and shared-interest requirements."});}});
  assert.equal((await gateway.interpret(headers,{sourceId,query,useGemini:true})).source,"Local fallback");assert.equal(calls,0);
  await consent(sourceId,"SEARCH");
  assert.equal((await gateway.interpret(headers,{sourceId,query,useGemini:true})).source,"Gemini interpretation");assert.equal(calls,1);
  await gateway.interpret(headers,{sourceId,query:"active profiles "+canary,useGemini:true});assert.equal(calls,1);
  const broaden=createAiGateway({transport:async()=>JSON.stringify({filters:{},explanation:"Everything."})});
  assert.equal((await broaden.interpret(headers,{sourceId,query,useGemini:true})).source,"Local fallback");
  const arbitrary=createAiGateway({transport:async()=>JSON.stringify({filters:{sql:"SELECT *"},explanation:"Everything."})});
  assert.equal((await arbitrary.interpret(headers,{sourceId,query,useGemini:true})).source,"Local fallback");
  await consent(sourceId,"SEARCH","WITHDRAWN");
  await gateway.interpret(headers,{sourceId,query,useGemini:true});assert.equal(calls,1);
});
test("AI audit metadata contains no prompt/response/private values and scopes do not affect local matching",async()=>{
  const events=JSON.stringify(await db().auditEvent.findMany({where:{action:{startsWith:"AI_"}}}));
  for(const value of [canary,"This model text","Show active profiles","Known factor indicators",core.bio])assert.ok(!events.includes(value));
  assert.ok((await matching.rankedMatches(headers,{sourceId})).results.length>0);
});
