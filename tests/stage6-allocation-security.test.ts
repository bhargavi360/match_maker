import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matchmaker-stage6-allocation-"));
Object.assign(process.env, {
  DATABASE_URL: "file:" + path.join(directory, "matchmaker.sqlite"),
  BETTER_AUTH_URL: "http://127.0.0.1:3100",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  MATCHMAKER_SETUP_TOKEN: randomBytes(32).toString("hex"),
  CONTACT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CONTACT_KEY_ID: "stage6-allocation-test",
  MATCHMAKER_TEST_MODE: "1",
  GEMINI_ENABLED: "false",
});

const { db } = await import("../src/server/db");
const { bootstrap } = await import("../src/server/bootstrap");
const { auth } = await import("../src/server/auth");
const profiles = await import("../src/server/profiles");
const matching = await import("../src/server/matching");
const { POST } = await import("../src/app/api/workspace/[...path]/route");
let headers: Headers;
const today = new Date().toISOString().slice(0, 10);
const privateEmail = "allocation-private@example.invalid";
const privatePhone = "+919876543210";

const core = {
  displayName: "Synthetic allocation profile",
  gender: "Woman",
  reportedAge: 30,
  ageConfirmedOn: today,
  city: "Synthetic City",
  region: "Synthetic Region",
  country: "India",
  education: "Synthetic degree",
  occupation: "Synthetic occupation",
  interests: ["Reading", "Music"],
  values: ["Kindness", "Curiosity"],
  relationshipGoals: ["LONG_TERM"] as ("LONG_TERM")[],
  lifestyle: ["NON_SMOKER"] as ("NON_SMOKER")[],
  communicationStyle: "Direct",
  bio: "Fictional test profile.",
};
const preference = {
  minAge: null,
  maxAge: null,
  locations: [],
  sharedValues: [],
  communicationStyles: [],
  educationLevels: [],
  goals: [],
  lifestyle: [],
  dealBreakers: [],
};

async function createProfile(input: Record<string, unknown> = {}) {
  return profiles.createProfile(headers, { ...core, ...input });
}

function allocationRequest(body: unknown, requestHeaders = headers) {
  return new Request("http://127.0.0.1:3100/api/workspace/matches/allocate", {
    method: "POST",
    headers: { ...Object.fromEntries(requestHeaders), origin: "http://127.0.0.1:3100", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeContext = { params: Promise.resolve({ path: ["matches", "allocate"] }) };

before(async () => {
  const migration = spawnSync(process.execPath, ["--import", "tsx", "scripts/database.ts"], { env: process.env, encoding: "utf8" });
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  await bootstrap({ token: process.env.MATCHMAKER_SETUP_TOKEN!, name: "Synthetic Allocation Operator", email: "allocation@example.invalid", password: "Synthetic-allocation-passphrase" });
  const response = await auth().api.signInEmail({
    body: { email: "allocation@example.invalid", password: "Synthetic-allocation-passphrase", rememberMe: false },
    headers: new Headers({ origin: "http://127.0.0.1:3100" }),
    asResponse: true,
  });
  headers = new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), origin: "http://127.0.0.1:3100" });
});

after(async () => {
  await db().$disconnect();
});

test("global allocation independently authenticates and rejects untrusted request fields", async () => {
  await assert.rejects(matching.allocateMatches(new Headers(), { kind: "REAL" }), /sign in/);
  const anonymous = await POST(allocationRequest({ kind: "REAL" }, new Headers()), routeContext);
  assert.equal(anonymous.status, 401);
  await assert.rejects(matching.allocateMatches(headers, { kind: "REAL", profileIds: [randomUUID()] }));
  const forged = await POST(allocationRequest({ kind: "REAL", pairs: [{ score: 100 }], actorId: "forged" }), routeContext);
  assert.equal(forged.status, 400);
});

test("allocation excludes hard deal-breakers and keeps feasible but unscored profiles unmatched", async () => {
  await profiles.seedDemo(headers);
  const demos = (await profiles.listProfiles(headers, { kind: "DEMO" })).profiles;
  assert.equal(demos.length, 4);
  for (const profile of demos.slice(2)) await profiles.changeStatus(headers, profile.id, { revision: profile.revision, status: "ARCHIVED" });

  const strictA = await profiles.getProfile(headers, demos[0].id);
  const strictAUpdated = await profiles.updateProfile(headers, strictA.id, { revision: strictA.revision, profile: { ...core, displayName: "Synthetic strict A", gender: "Woman", reportedAge: 30 } });
  const strictAPreference = await profiles.savePreference(headers, strictA.id, { revision: strictAUpdated.revision, preference: { ...preference, minAge: 18, maxAge: 35, dealBreakers: ["AGE_RANGE"] } });
  const strictB = await profiles.getProfile(headers, demos[1].id);
  const strictBUpdated = await profiles.updateProfile(headers, strictB.id, { revision: strictB.revision, profile: { ...core, displayName: "Synthetic strict B", gender: "Man", reportedAge: 40 } });
  const strictBPreference = await profiles.savePreference(headers, strictB.id, { revision: strictBUpdated.revision, preference: { ...preference, minAge: 30, maxAge: 45, dealBreakers: ["AGE_RANGE"] } });

  const blocked = await matching.allocateMatches(headers, { kind: "DEMO" });
  assert.equal(blocked.eligibleProfileCount, 2);
  assert.equal(blocked.pairCounts.ineligible, 1);
  assert.equal(blocked.pairs.length, 0);
  assert.ok(blocked.pairCounts.reasons.DEAL_BREAKER_AGE_RANGE > 0);
  assert.ok(blocked.unmatched.every(profile => profile.reason === "NO_FEASIBLE_PAIR"));

  const noEvidence = { ...core, gender: null, city: null, region: null, country: null, education: null, interests: [], values: [], relationshipGoals: [], lifestyle: [], communicationStyle: null };
  const emptyPreference = { ...preference, minAge: null, maxAge: null };
  const unknownA = await profiles.updateProfile(headers, strictA.id, { revision: strictAPreference.revision, profile: { ...noEvidence, displayName: "Synthetic unknown A" } });
  const unknownAPreference = await profiles.savePreference(headers, strictA.id, { revision: unknownA.revision, preference: emptyPreference });
  const unknownB = await profiles.updateProfile(headers, strictB.id, { revision: strictBPreference.revision, profile: { ...noEvidence, displayName: "Synthetic unknown B" } });
  await profiles.savePreference(headers, strictB.id, { revision: unknownB.revision, preference: emptyPreference });

  const unresolved = await matching.allocateMatches(headers, { kind: "DEMO" });
  assert.equal(unresolved.eligibleProfileCount, 2);
  assert.equal(unresolved.pairCounts.feasible, 1);
  assert.equal(unresolved.pairCounts.unscored, 1);
  assert.equal(unresolved.pairs.length, 0);
  assert.ok(unresolved.unmatched.every(profile => profile.reason === "INSUFFICIENT_SCORING_EVIDENCE"));
  assert.ok(unknownAPreference.revision > unknownA.revision);
});

test("inactive, review-pending, rejected, underage, and stale-age records are omitted", async () => {
  const pending = await createProfile({ displayName: "Synthetic pending" });
  await db().profile.update({ where: { id: pending.id }, data: { status: "ARCHIVED", reviewStatus: "PENDING" } });
  const rejected = await createProfile({ displayName: "Synthetic rejected" });
  await db().profile.update({ where: { id: rejected.id }, data: { status: "ARCHIVED", reviewStatus: "REJECTED" } });
  const inactive = await createProfile({ displayName: "Synthetic inactive" });
  await profiles.changeStatus(headers, inactive.id, { revision: inactive.revision, status: "ARCHIVED" });
  await assert.rejects(profiles.createProfile(headers, { ...core, displayName: "Synthetic underage", reportedAge: 17 }));
  const staleDate = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await createProfile({ displayName: "Synthetic stale age", ageConfirmedOn: staleDate });

  const result = await matching.allocateMatches(headers, { kind: "REAL" });
  assert.equal(result.eligibleProfileCount, 0);
  assert.equal(result.excludedProfiles.INACTIVE, 3);
  assert.equal(result.excludedProfiles.REVIEW_PENDING, 1);
  assert.equal(result.excludedProfiles.REVIEW_REJECTED, 1);
  assert.equal(result.excludedProfiles.UNDERAGE, 0);
  assert.equal(result.excludedProfiles.AGE_UNCONFIRMED, 1);
  assert.equal(result.pairs.length, 0);
});

test("normal authenticated allocation preserves explanations, ownership, contact privacy, and read-only review", async () => {
  const left = await createProfile({ displayName: "Synthetic match A", gender: "Woman", interests: ["Reading"], communicationStyle: "Direct" });
  const right = await createProfile({ displayName: "Synthetic match B", gender: "Man", interests: ["Hiking"], communicationStyle: "Indirect" });
  await profiles.saveContact(headers, left.id, { revision: left.revision, contact: { email: privateEmail, phone: privatePhone } });
  await profiles.saveContact(headers, right.id, { revision: right.revision, contact: { email: privateEmail, phone: privatePhone } });

  const foreignOwnerId = randomUUID();
  await db().user.create({ data: { id: foreignOwnerId, slot: 2, name: "Synthetic other owner", email: "other-owner@example.invalid" } });
  const foreign = await db().profile.create({ data: { ...core, id: randomUUID(), ownerId: foreignOwnerId, displayName: "Synthetic foreign profile" } });

  const auditsBefore = await db().auditEvent.count();
  const workflowsBefore = await db().workflow.count();
  const decisionsBefore = await db().matchDecision.count();
  const result = await matching.allocateMatches(headers, { kind: "REAL" });
  assert.equal(result.eligibleProfileCount, 2);
  assert.equal(result.pairs.length, 1);
  assert.deepEqual(new Set([result.pairs[0].left.id, result.pairs[0].right.id]), new Set([left.id, right.id]));
  assert.ok(result.pairs[0].assessment.matchingReasons.length > 0);
  assert.ok(result.pairs[0].assessment.conflicts.some(reason => reason.code === "NO_MUTUAL_OVERLAP_INTERESTS"));
  assert.ok(result.pairs[0].assessment.conflicts.some(reason => reason.code === "NO_MUTUAL_OVERLAP_COMMUNICATION"));
  assert.ok(result.pairs[0].assessment.warnings.length > 0);
  assert.ok(!JSON.stringify(result).includes(privateEmail));
  assert.ok(!JSON.stringify(result).includes(privatePhone));
  assert.ok(!JSON.stringify(result).includes("ciphertext"));
  assert.ok(!JSON.stringify(result).includes(foreign.id));
  assert.ok(result.pairs.every(pair => pair.left.kind === result.kind && pair.right.kind === result.kind));

  const routeResponse = await POST(allocationRequest({ kind: "REAL" }), routeContext);
  assert.equal(routeResponse.status, 200);
  const routed = await routeResponse.json() as typeof result;
  assert.deepEqual(routed.pairs.map(pair => pair.score), result.pairs.map(pair => pair.score));
  const recommendations = await matching.rankedMatches(headers, { sourceId: left.id });
  assert.ok(recommendations.results.some(match => match.candidate.id === right.id));
  const searched = await matching.searchProfiles(headers, { kind: "REAL", filters: { gender: "Man" } });
  assert.ok(searched.profiles.some(profile => profile.id === right.id));
  for (const output of [recommendations, searched, routed]) {
    assert.ok(!JSON.stringify(output).includes(privateEmail));
    assert.ok(!JSON.stringify(output).includes(privatePhone));
  }
  assert.equal(await db().auditEvent.count(), auditsBefore);
  assert.equal(await db().workflow.count(), workflowsBefore);
  assert.equal(await db().matchDecision.count(), decisionsBefore);
  assert.equal(await db().profile.count({ where: { id: foreign.id, ownerId: foreignOwnerId } }), 1);
});
