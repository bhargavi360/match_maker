import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { queryAccountCredentialStatus } from "../src/server/account-diagnostic";
import { classifyAuthException, classifyAuthResponse, createAuthCorrelationId, logAuthFailure } from "../src/server/auth-diagnostics";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matchmaker-security-"));
Object.assign(process.env, { DATABASE_URL: "file:" + path.join(directory,"matchmaker.sqlite"), BETTER_AUTH_URL: "http://127.0.0.1:3100", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), MATCHMAKER_SETUP_TOKEN: randomBytes(32).toString("hex"), CONTACT_ENCRYPTION_KEY: randomBytes(32).toString("base64"), CONTACT_KEY_ID: "test-v1" });
const setup = { token: process.env.MATCHMAKER_SETUP_TOKEN!, name: "Synthetic Test Matchmaker", email: "operator@example.invalid", password: "Synthetic-testing-passphrase-2026" };
const { db } = await import("../src/server/db");
const { bootstrap } = await import("../src/server/bootstrap");
const { auth, requireMatchmaker } = await import("../src/server/auth");
const services = await import("../src/server/profiles");
const { getDashboard } = await import("../src/server/dashboard");
const matching = await import("../src/server/matching");
const { rateLimit, jsonBody, sameOrigin } = await import("../src/server/security");
const { encryptContact, decryptContact } = await import("../src/server/contacts");
const { POST: loginRoute } = await import("../src/app/api/auth/[...path]/route");
const { GET: workspaceGet } = await import("../src/app/api/workspace/[...path]/route");
const { profileSchema, weightsSchema, defaultWeights } = await import("../src/domain/validation");
let authorized: Headers;
const registration = { name: "Second Matchmaker", email: "second@example.invalid", password: "Second-testing-passphrase-2026", confirmPassword: "Second-testing-passphrase-2026" };
const anotherRegistration = { name: "Third Matchmaker", email: "third@example.invalid", password: "Third-testing-passphrase-2026", confirmPassword: "Third-testing-passphrase-2026" };
const profile = { displayName: "Synthetic Test Customer", reportedAge: 32, ageConfirmedOn: "2026-10-09", city: "Fixture City", region: null, country: null, education: null, occupation: "Synthetic occupation", interests: ["Reading"], values: ["Kindness"], relationshipGoals: ["LONG_TERM"], lifestyle: [], communicationStyle: null, bio: "Private synthetic bio must not appear in audits" };
function request(pathname: string, body: unknown, origin = "http://127.0.0.1:3100") { return new Request(origin + pathname, { method: "POST", headers: { Origin: origin, "Content-Type":"application/json" }, body: JSON.stringify(body) }); }
async function captureAuthLogs<T>(action: () => Promise<T>) {
  const entries: string[] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => entries.push(values.map(String).join(" "));
  try { return { result: await action(), entries }; }
  finally { console.error = original; }
}
before(() => {
  const result = spawnSync(process.execPath, ["--import","tsx","scripts/database.ts"], { env: process.env, encoding:"utf8" });
  assert.equal(result.status,0,result.stderr);
});
after(async () => { await db().$disconnect(); });
test("bootstrap refuses missing/invalid configuration and rolls back a failed account transaction", async () => {
  const saved=process.env.MATCHMAKER_SETUP_TOKEN; delete process.env.MATCHMAKER_SETUP_TOKEN;
  await assert.rejects(bootstrap(setup)); process.env.MATCHMAKER_SETUP_TOKEN=saved;
  await assert.rejects(bootstrap({ ...setup, token:"wrong" }));
  await db().$executeRawUnsafe("CREATE TRIGGER test_abort_account BEFORE INSERT ON Account BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  await assert.rejects(bootstrap(setup));
  assert.equal(await db().user.count(),0);
  assert.equal((await db().systemState.findUniqueOrThrow({where:{id:1}})).bootstrapCompleted,false);
  await db().$executeRawUnsafe("DROP TRIGGER test_abort_account");
});
test("concurrent bootstrap has exactly one winner; database singleton and permanent latch constraints hold", async () => {
  const results=await Promise.allSettled(Array.from({length:3},()=>bootstrap(setup)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(await db().user.count(),1); assert.equal(await db().account.count(),1);
  const account=await db().account.findFirstOrThrow(); assert.notEqual(account.password,setup.password);
  await assert.rejects(bootstrap(setup));
  assert.equal((await db().user.findFirstOrThrow()).slot,1);
  await assert.rejects(db().systemState.update({where:{id:1},data:{bootstrapCompleted:false}}));
  await assert.rejects(db().systemState.delete({where:{id:1}}));
  assert.deepEqual(weightsSchema.parse(defaultWeights),defaultWeights);
});
test("unauthenticated service and endpoint reads are rejected; registration creates an additional account", async () => {
  await assert.rejects(requireMatchmaker(new Headers()),/sign in/);
  await assert.rejects(services.listProfiles(new Headers(),{}),/sign in/);
  const response=await workspaceGet(new Request("http://127.0.0.1:3100/api/workspace/profiles"),{params:Promise.resolve({path:["profiles"]})});
  assert.equal(response.status,401);
  const originalCredential = await db().account.findFirstOrThrow({where:{user:{email:setup.email},providerId:"credential"}});
  const created = await loginRoute(request("/api/auth/sign-up/email",registration),{params:Promise.resolve({path:["sign-up","email"]})});
  assert.equal(created.status,201);
  const another = await loginRoute(request("/api/auth/sign-up/email",anotherRegistration,"http://localhost:3100"),{params:Promise.resolve({path:["sign-up","email"]})});
  assert.equal(another.status,201);
  assert.equal((await db().user.findUniqueOrThrow({where:{email:registration.email}})).slot,2);
  assert.equal((await db().user.findUniqueOrThrow({where:{email:anotherRegistration.email}})).slot,3);
  assert.equal((await loginRoute(request("/api/auth/sign-up/email",{...registration,email:"Second@EXAMPLE.invalid"}),{params:Promise.resolve({path:["sign-up","email"]})})).status,409);
  const account = await db().account.findFirstOrThrow({where:{user:{email:registration.email}}});
  assert.notEqual(account.password,registration.password);
  assert.equal((await db().account.findUniqueOrThrow({where:{id:originalCredential.id}})).password,originalCredential.password);
});
test("login fails generically, sets safe cookies without JSON tokens, and avoids IP/user-agent persistence", async () => {
  const badAttempt = await captureAuthLogs(() => loginRoute(request("/api/auth/sign-in/email",{email:"unknown@example.invalid",password:"incorrect"}),{params:Promise.resolve({path:["sign-in","email"]})}));
  const bad = badAttempt.result;
  assert.equal(bad.status,401); assert.deepEqual(await bad.json(),{error:"Unable to sign in with those credentials.",code:"UNAUTHORIZED"});
  assert.equal(badAttempt.entries.length,1);
  const badDiagnostic=JSON.parse(badAttempt.entries[0]);
  assert.deepEqual(Object.keys(badDiagnostic).sort(),["category","code","correlationId"]);
  assert.equal(badDiagnostic.category,"credentials"); assert.equal(badDiagnostic.code,"INVALID_EMAIL_OR_PASSWORD");
  assert.match(badDiagnostic.correlationId,/^[0-9a-f-]{36}$/i);
  assert.ok(!badAttempt.entries.join(" ").includes("unknown@example.invalid"));
  const response=await loginRoute(request("/api/auth/sign-in/email",{email:setup.email,password:setup.password}),{params:Promise.resolve({path:["sign-in","email"]})});
  assert.equal(response.status,200); assert.deepEqual(await response.json(),{ok:true});
  const cookies=response.headers.getSetCookie(); assert.ok(cookies.some(c=>c.includes("HttpOnly")&&c.toLowerCase().includes("samesite=strict")));
  authorized=new Headers({cookie:cookies.map(c=>c.split(";")[0]).join("; "),origin:"http://127.0.0.1:3100"});
  assert.ok(await requireMatchmaker(authorized));
  const session=await db().session.findFirstOrThrow(); assert.equal(session.ipAddress,null); assert.equal(session.userAgent,null);
  const second=await loginRoute(request("/api/auth/sign-in/email",{email:registration.email,password:registration.password}),{params:Promise.resolve({path:["sign-in","email"]})});
  assert.equal(second.status,200);
  const third=await loginRoute(request("/api/auth/sign-in/email",{email:anotherRegistration.email,password:anotherRegistration.password}),{params:Promise.resolve({path:["sign-in","email"]})});
  assert.equal(third.status,200);
  const incorrectAttempt=await captureAuthLogs(()=>loginRoute(request("/api/auth/sign-in/email",{email:registration.email,password:"incorrect-password"}),{params:Promise.resolve({path:["sign-in","email"]})}));
  assert.equal(incorrectAttempt.result.status,401);
  assert.equal(JSON.parse(incorrectAttempt.entries[0]).category,"credentials");
});
test("session/database failures keep a generic client response and emit only a sanitized diagnostic", async () => {
  const triggerName="test_fail_session_insert";
  const sentinel="synthetic-private-session-error";
  await db().$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "Session" BEGIN SELECT RAISE(ABORT, '${sentinel}'); END`);
  let attempt: { result: Response; entries: string[] } | undefined;
  try {
    attempt=await captureAuthLogs(()=>loginRoute(request("/api/auth/sign-in/email",{email:setup.email,password:setup.password}),{params:Promise.resolve({path:["sign-in","email"]})}));
  } finally {
    await db().$executeRawUnsafe(`DROP TRIGGER "${triggerName}"`);
  }
  assert.ok(attempt);
  assert.equal(attempt.result.status,401);
  assert.deepEqual(await attempt.result.json(),{error:"Unable to sign in with those credentials.",code:"UNAUTHORIZED"});
  assert.equal(attempt.entries.length,1);
  const diagnostic=JSON.parse(attempt.entries[0]);
  assert.deepEqual(Object.keys(diagnostic).sort(),["category","code","correlationId"]);
  assert.equal(diagnostic.category,"database");
  assert.match(diagnostic.code,/^(?:SQLITE_CONSTRAINT(?:_TRIGGER)?|PRISMA_P\d{4})$/);
  assert.ok(!attempt.entries.join(" ").includes(setup.email));
  assert.ok(!attempt.entries.join(" ").includes(setup.password));
  assert.ok(!attempt.entries.join(" ").includes(sentinel));
});
test("auth diagnostics classify only safe codes and account lookup returns booleans", async () => {
  assert.deepEqual(classifyAuthException({ code: "P2021", message: "private user data" }),{category:"database",code:"PRISMA_P2021"});
  assert.deepEqual(classifyAuthException(new Error("private password data")),{category:"internal",code:"AUTH_SIGNIN_EXCEPTION"});
  assert.deepEqual(await classifyAuthResponse(Response.json({ code: "INVALID_EMAIL_OR_PASSWORD", message: "private account data" },{status:401})),{category:"credentials",code:"INVALID_EMAIL_OR_PASSWORD"});
  assert.deepEqual(await classifyAuthResponse(Response.json({ code: "private-email-value" },{status:500})),{category:"internal",code:"AUTH_HTTP_500"});

  const diagnosticDb=new DatabaseSync(":memory:");
  try {
    diagnosticDb.exec('CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE); CREATE TABLE "Account" (id TEXT PRIMARY KEY, accountId TEXT, providerId TEXT, userId TEXT, password TEXT);');
    diagnosticDb.prepare('INSERT INTO "User" (id,email) VALUES (?,?)').run("synthetic-user","synthetic@example.invalid");
    diagnosticDb.prepare('INSERT INTO "Account" (id,accountId,providerId,userId,password) VALUES (?,?,?,?,?)').run("synthetic-account","synthetic-user","credential","synthetic-user","not-a-real-hash-sentinel");
    const status=queryAccountCredentialStatus(diagnosticDb,"synthetic@example.invalid");
    assert.deepEqual(status,{userFound:true,credentialRecordFound:true});
    assert.equal(JSON.stringify(status).includes("synthetic@example.invalid"),false);
    assert.equal(JSON.stringify(status).includes("not-a-real-hash-sentinel"),false);
    assert.deepEqual(queryAccountCredentialStatus(diagnosticDb,"missing@example.invalid"),{userFound:false,credentialRecordFound:false});
  } finally {
    diagnosticDb.close();
  }

  const messages:string[]=[];
  const original=console.error;
  console.error=(...values:unknown[])=>messages.push(values.map(String).join(" "));
  try { logAuthFailure({category:"internal",code:"AUTH_SIGNIN_EXCEPTION"},createAuthCorrelationId()); }
  finally { console.error=original; }
  assert.equal(messages.length,1);
  assert.deepEqual(Object.keys(JSON.parse(messages[0])).sort(),["category","code","correlationId"]);
});
test("registered accounts own isolated profiles, contacts, dashboard data, and settings", async () => {
  const login = await loginRoute(request("/api/auth/sign-in/email", { email: registration.email, password: registration.password }), { params: Promise.resolve({ path: ["sign-in", "email"] }) });
  const secondHeaders = new Headers({ cookie: login.headers.getSetCookie().map(c => c.split(";")[0]).join("; "), origin: "http://127.0.0.1:3100" });
  const ownerProfile = await services.createProfile(authorized, { ...profile, displayName: "Owner A private profile" });
  const secondProfile = await services.createProfile(secondHeaders, { ...profile, displayName: "Owner B private profile" });
  await services.saveContact(secondHeaders, secondProfile.id, { revision: 1, contact: { email: "owner-b-contact@example.invalid", phone: null } });
  assert.deepEqual((await services.listProfiles(authorized, {})).profiles.map(p => p.id), [ownerProfile.id]);
  assert.deepEqual((await services.listProfiles(secondHeaders, {})).profiles.map(p => p.id), [secondProfile.id]);
  assert.deepEqual((await matching.matchingSources(secondHeaders)).sources.map(p => p.id), [secondProfile.id]);
  assert.ok((await matching.matchingSources(authorized)).sources.some(p => p.id === ownerProfile.id));
  await assert.rejects(services.getProfile(authorized, secondProfile.id), /not found/i);
  await assert.rejects(services.getContact(authorized, secondProfile.id), /not found/i);
  await assert.rejects(services.updateProfile(authorized, secondProfile.id, { revision: 1, profile }), /not found/i);
  await assert.rejects(services.changeStatus(authorized, secondProfile.id, { revision: 1, status: "ARCHIVED" }), /not found/i);
  assert.equal((await getDashboard(authorized)).active, await db().profile.count({ where: { ownerId: (await requireMatchmaker(authorized)).id, status: "ACTIVE" } }));
  assert.equal((await getDashboard(secondHeaders)).active, 1);
  assert.ok((await db().appSettings.findUniqueOrThrow({ where: { ownerId: (await requireMatchmaker(authorized)).id } })).id !== (await db().appSettings.findUniqueOrThrow({ where: { ownerId: (await requireMatchmaker(secondHeaders)).id } })).id);
  const leakedAudit = JSON.stringify((await getDashboard(authorized)).activity);
  assert.ok(!leakedAudit.includes("Owner B private profile"));
  assert.ok(!JSON.stringify(await services.getContact(secondHeaders, secondProfile.id)).includes("owner-a"));
});
test("same-origin and streamed size limits reject forged and oversized requests", async () => {
  assert.throws(()=>sameOrigin(request("/api/bootstrap",{},"https://foreign.invalid")));
  assert.throws(()=>sameOrigin(new Request("http://127.0.0.1:3100/api/bootstrap")));
  assert.doesNotThrow(()=>sameOrigin(request("/api/auth/sign-up/email",{},"http://localhost:3100")));
  assert.throws(()=>sameOrigin(request("/api/auth/sign-up/email",{},"http://localhost:3101")));
  const nodeEnv=process.env.NODE_ENV;
  (process.env as Record<string,string|undefined>).NODE_ENV="production";
  assert.throws(()=>sameOrigin(request("/api/auth/sign-up/email",{},"http://localhost:3100")));
  if (nodeEnv === undefined) delete (process.env as Record<string,string|undefined>).NODE_ENV;
  else (process.env as Record<string,string|undefined>).NODE_ENV=nodeEnv;
  const crossSite=request("/api/auth/sign-up/email",{},"http://localhost:3100");
  crossSite.headers.set("Sec-Fetch-Site","cross-site");
  assert.throws(()=>sameOrigin(crossSite));
  const large=request("/api/bootstrap",{token:"x".repeat(40000)});
  await assert.rejects(jsonBody(large,profileSchema),/too large/);
});
test("shared rate limits are atomic across independent database clients", async () => {
  await db().rateLimitBucket.deleteMany();
  const peer=new PrismaClient({adapter:new PrismaBetterSqlite3({url:process.env.DATABASE_URL!})});
  try {
    const now=BigInt(Date.now()),end=now+900000n;
    const attempts=await Promise.all(Array.from({length:20},(_,i)=> (i%2 ? peer : db()).$queryRaw<{count:number}[]>`INSERT INTO RateLimitBucket(key,count,expiresAt) VALUES ('bootstrap',1,${end}) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`));
    assert.deepEqual(attempts.map(r=>r[0].count).sort((a,b)=>a-b),Array.from({length:20},(_,i)=>i+1));
    await assert.rejects(rateLimit("bootstrap",5),/Too many/);
    await db().rateLimitBucket.update({where:{key:"bootstrap"},data:{expiresAt:now-1n}});
    await rateLimit("bootstrap",5);
    assert.equal((await db().rateLimitBucket.findUniqueOrThrow({where:{key:"bootstrap"}})).count,1);
  } finally { await peer.$disconnect(); await db().rateLimitBucket.deleteMany(); }
});
test("profile CRUD validates fields and rejects stale revisions and demo conversion", async () => {
  await assert.rejects(services.createProfile(authorized,{...profile,reportedAge:17}));
  await assert.rejects(services.createProfile(authorized,{...profile,kind:"DEMO"}));
  await assert.rejects(services.createProfile(authorized,{...profile,ageConfirmedOn:"2026-02-30"}));
  const created=await services.createProfile(authorized,profile);
  const edited=await services.updateProfile(authorized,created.id,{revision:1,profile:{...profile,occupation:"Updated synthetic occupation"}});
  assert.equal(edited.revision,2);
  await assert.rejects(services.updateProfile(authorized,created.id,{revision:1,profile}),/changed/);
  const archived=await services.changeStatus(authorized,created.id,{revision:2,status:"ARCHIVED"});
  assert.equal(archived.status,"ARCHIVED");
  const active=await services.changeStatus(authorized,created.id,{revision:3,status:"ACTIVE"});assert.equal(active.revision,4);
});
test("pending and rejected profiles cannot be reactivated", async () => {
  for (const reviewStatus of ["PENDING", "REJECTED"] as const) {
    const created = await services.createProfile(authorized, { ...profile, displayName: `Synthetic ${reviewStatus} review fixture` });
    await db().profile.update({ where: { id: created.id }, data: { status: "ARCHIVED", reviewStatus } });
    await assert.rejects(services.changeStatus(authorized, created.id, { revision: created.revision, status: "ACTIVE" }), /approved before it can be reactivated/i);
    const saved = await db().profile.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(saved.status, "ARCHIVED");
    assert.equal(saved.reviewStatus, reviewStatus);
  }
});
test("contacts are encrypted, authenticated to profile/key, and absent from ordinary DTOs and audits", async () => {
  const created=await services.createProfile(authorized,{...profile,displayName:"Contact Fixture"});
  const contact={email:"private-contact@example.invalid",phone:"+91 00000 00000"};
  await services.saveContact(authorized,created.id,{revision:1,contact});
  const stored=await db().profileContact.findUniqueOrThrow({where:{profileId:created.id}});
  assert.ok(!stored.ciphertext.includes(contact.email)); assert.deepEqual(decryptContact(created.id,stored),{...contact,phone:"+910000000000"});
  assert.throws(()=>decryptContact("different-profile",stored));
  assert.deepEqual((await services.getContact(authorized,created.id)).email,contact.email);
  const detail=await services.getProfile(authorized,created.id);
  assert.ok(!JSON.stringify(detail).includes(contact.email)); assert.ok(!("contact" in detail));
  const list=await services.listProfiles(authorized,{q:"Contact"});assert.ok(!JSON.stringify(list).includes(contact.email));
  const key=process.env.CONTACT_ENCRYPTION_KEY;delete process.env.CONTACT_ENCRYPTION_KEY;
  assert.throws(()=>encryptContact(created.id,contact)); await assert.rejects(services.getContact(authorized,created.id));
  process.env.CONTACT_ENCRYPTION_KEY=key;
  const audits=JSON.stringify(await db().auditEvent.findMany());assert.ok(!audits.includes(contact.email));assert.ok(!audits.includes(profile.bio));assert.ok(!audits.includes(setup.token));assert.ok(!audits.includes(setup.password));
});
test("preferences are validated, consent starts unset and scopes/withdrawals are independent", async () => {
  const p=await services.createProfile(authorized,{...profile,displayName:"Permission Fixture"});
  assert.deepEqual((await services.getProfile(authorized,p.id)).consents,[]);
  await assert.rejects(services.requireConsent(authorized,p.id,"MATCHING"));
  const preference={minAge:25,maxAge:40,locations:[],sharedValues:[],goals:[],lifestyle:[],dealBreakers:[]};
  await services.savePreference(authorized,p.id,{revision:1,preference});
  await assert.rejects(services.savePreference(authorized,p.id,{revision:2,preference:{...preference,minAge:50,maxAge:20}}));
  const consent={scope:"SEARCH",status:"GRANTED",policyVersion:"test-v1",provenance:"fixture-consent-reference"};
  await services.saveConsent(authorized,p.id,{revision:2,consent});
  assert.equal((await services.requireConsent(authorized,p.id,"SEARCH")).synthetic,false);
  await assert.rejects(services.requireConsent(authorized,p.id,"MATCHING"));
  await services.saveConsent(authorized,p.id,{revision:3,consent:{...consent,status:"WITHDRAWN"}});
  await assert.rejects(services.requireConsent(authorized,p.id,"SEARCH"));
  await assert.rejects(services.saveConsent(authorized,p.id,{revision:3,consent}));
});
test("demo seed is idempotent; reset shows dependents and preserves real data, settings, account, and latch", async () => {
  await services.seedDemo(authorized);await services.seedDemo(authorized);
  assert.equal(await db().profile.count({where:{kind:"DEMO"}}),4);
  const demo=await db().profile.findFirstOrThrow({where:{kind:"DEMO"}});
  await assert.rejects(services.updateProfile(authorized,demo.id,{revision:1,profile:{...profile,kind:"REAL"}}));
  await assert.rejects(db().profile.update({where:{id:demo.id},data:{kind:"REAL",demoKey:null}}));
  await services.saveConsent(authorized,demo.id,{revision:1,consent:{scope:"CHAT",status:"GRANTED",policyVersion:"synthetic-v1",provenance:"synthetic-fixture"}});
  assert.equal((await services.requireConsent(authorized,demo.id,"CHAT")).synthetic,true);
  const snapshot=await services.previewDemoReset(authorized);
  assert.equal(snapshot.profiles,4);assert.equal(snapshot.consents,1);
  const before={real:await db().profile.count({where:{kind:"REAL"}}),users:await db().user.findMany(),state:await db().systemState.findMany(),settings:await db().appSettings.findMany()};
  await assert.rejects(services.resetDemo(authorized,{confirmation:"WRONG",confirmationToken:snapshot.confirmationToken}));
  await services.resetDemo(authorized,{confirmation:"RESET DEMO",confirmationToken:snapshot.confirmationToken});
  assert.equal(await db().profile.count({where:{kind:"DEMO"}}),0);
  assert.equal(await db().profile.count({where:{kind:"REAL"}}),before.real);
  assert.deepEqual(await db().user.findMany(),before.users);assert.deepEqual(await db().systemState.findMany(),before.state);assert.deepEqual(await db().appSettings.findMany(),before.settings);
});
test("permanent deletion requires exact confirmation, cascades dependencies, and retains sanitized audit", async () => {
  const p=await services.createProfile(authorized,{...profile,displayName:"Delete Fixture"});
  await services.saveContact(authorized,p.id,{revision:1,contact:{email:"delete@example.invalid",phone:null}});
  await services.savePreference(authorized,p.id,{revision:2,preference:{minAge:null,maxAge:null,locations:[],sharedValues:[],goals:[],lifestyle:[],dealBreakers:[]}});
  await services.saveConsent(authorized,p.id,{revision:3,consent:{scope:"MATCHING",status:"GRANTED",policyVersion:"test-v1",provenance:"test-reference"}});
  await assert.rejects(services.deleteProfile(authorized,p.id,{revision:4,confirmation:"DELETE"}));
  await services.deleteProfile(authorized,p.id,{revision:4,confirmation:"DELETE Delete Fixture"});
  assert.equal(await db().profileContact.count({where:{profileId:p.id}}),0);assert.equal(await db().partnerPreference.count({where:{profileId:p.id}}),0);assert.equal(await db().profileConsent.count({where:{profileId:p.id}}),0);
  assert.equal(await db().auditEvent.count({where:{entityId:p.id,action:"PROFILE_DELETED"}}),1);
  const counts=await getDashboard(authorized);assert.equal(counts.active,await db().profile.count({where:{ownerId:(await requireMatchmaker(authorized)).id,status:"ACTIVE"}}));
});
test("HTTPS configuration issues Secure HttpOnly cookies and enforces foreign-key integrity", async () => {
 const code = 'import { auth } from "./src/server/auth.ts"; const response = await auth().api.signInEmail({body:{email:"operator@example.invalid",password:"Synthetic-testing-passphrase-2026",rememberMe:false},headers:new Headers({origin:"https://workspace.example.invalid"}),asResponse:true}); const cookies=response.headers.getSetCookie(); if(response.status!==200||!cookies.some(c=>c.includes("Secure")&&c.includes("HttpOnly")))process.exitCode=1; const {db}=await import("./src/server/db.ts"); await db().$disconnect();';
 const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","--input-type=module","-e",code],{env:{...process.env,BETTER_AUTH_URL:"https://workspace.example.invalid"},encoding:"utf8"});
 assert.equal(result.status,0,"HTTPS session-cookie check failed.");
 await assert.rejects(db().profileContact.create({data:{profileId:"00000000-0000-4000-8000-000000000000",ciphertext:"synthetic",keyId:"test-v1"}}));
});
test("logout revokes the session; profile ownership prevents deleting an account with retained data", async () => {
  const response=await auth().api.signOut({headers:authorized,asResponse:true});assert.equal(response.status,200);
  await assert.rejects(requireMatchmaker(authorized),/sign in/);
  await assert.rejects(db().user.deleteMany());
  assert.equal((await db().systemState.findUniqueOrThrow({where:{id:1}})).bootstrapCompleted,true);
  await assert.rejects(bootstrap(setup));
  assert.ok(await db().user.count());
});
