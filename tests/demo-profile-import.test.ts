import assert from "node:assert/strict";
import test from "node:test";
import { planDemoImport, prepareDemoProfiles } from "../src/domain/demo-profile-import";

function record(id: string, gender: "Male" | "Female") {
  return {
    id,
    isDemo: true,
    dataStatus: "synthetic_demo_pending_review",
    displayName: `Fictional ${id}`,
    fullName: `Fictional ${id}`,
    gender,
    reportedAge: 29,
    ageLastConfirmed: "10-10-2026",
    city: "Bengaluru",
    region: "Karnataka",
    country: "India",
    education: "Bachelor's degree",
    occupation: "Designer",
    communicationStyle: "Warm and direct",
    interests: ["Reading", "Travel"],
    values: ["Kindness", "Family"],
    relationshipGoals: ["long term", "marriage"],
    lifestyle: ["home oriented", "non-smoker"],
    about: "Fictional synthetic profile for validation.",
    partnerPreferences: {
      minAge: 25,
      maxAge: 38,
      locations: ["Bengaluru"],
      sharedValues: ["Kindness"],
      communicationStyles: ["Warm"],
      educationLevels: ["Graduate"],
      goals: ["LONG_TERM"],
      lifestyle: ["NON_SMOKER"],
      dealBreakers: ["AGE_RANGE"],
    },
    emailAddress: "placeholder@example.invalid",
    mobileNumber: "+910000000000",
  };
}

function dataset() {
  return Array.from({ length: 50 }, (_, index) => record(`synthetic-${index + 1}`, index < 25 ? "Male" : "Female"));
}

test("prepares exactly 50 synthetic records with stable keys and pending demo classification", () => {
  const first = prepareDemoProfiles(dataset(), "2026-10-10");
  const again = prepareDemoProfiles(dataset(), "2026-10-10");
  assert.equal(first.issues.length, 0);
  assert.equal(first.prepared.length, 50);
  assert.deepEqual(first.genderCounts, { male: 25, female: 25, other: 0 });
  assert.equal(first.coreValidRecords, 50);
  assert.equal(first.preferenceMapping.fullyStructuredRecords, 50);
  assert.deepEqual(first.prepared.map(profile => profile.demoKey), again.prepared.map(profile => profile.demoKey));
  assert.ok(first.prepared.every(profile => profile.kind === "DEMO" && profile.status === "ARCHIVED" && profile.reviewStatus === "PENDING"));
  assert.equal(first.prepared[0].profile.relationshipGoals[0], "LONG_TERM");
  assert.equal(first.prepared[0].profile.lifestyle[0], "HOME_ORIENTED");
  assert.equal("emailAddress" in first.prepared[0], false);
  assert.equal("mobileNumber" in first.prepared[0], false);
});

test("rejects duplicate stable IDs, ambiguous dates, and unstructured partner preferences", () => {
  const rows = dataset() as unknown as Array<Record<string, unknown>>;
  rows[1] = { ...rows[1], id: rows[0].id };
  rows[2] = { ...rows[2], ageLastConfirmed: "10-11-2026", partnerPreferences: "Age 25 to 38; location flexible" };
  const report = prepareDemoProfiles(rows, "2026-10-10");
  assert.equal(report.prepared.length, 48);
  assert.ok(report.issues.some(issue => issue.field === "id" && issue.code === "DUPLICATE_STABLE_ID"));
  assert.ok(report.issues.some(issue => issue.field === "ageLastConfirmed" && issue.code === "INVALID_OR_AMBIGUOUS_DATE"));
  assert.ok(report.unresolvedPreferences.some(item => item.field === "partnerPreferences"));
});

test("rejects invalid dates and non-synthetic markers without exposing contact values", () => {
  const rows = dataset();
  rows[0] = { ...rows[0], ageLastConfirmed: "31-02-2026", isDemo: false };
  const report = prepareDemoProfiles(rows, "2026-10-10");
  assert.equal(report.prepared.length, 49);
  assert.ok(report.issues.some(issue => issue.field === "ageLastConfirmed"));
  assert.ok(report.issues.some(issue => issue.field === "isDemo/dataStatus"));
  assert.equal(JSON.stringify(report).includes("placeholder@example.invalid"), false);
  assert.equal(JSON.stringify(report).includes("+910000000000"), false);
});

test("maps explicit preference facts but reports residual prose without storing it", () => {
  const rows = dataset().map(row => ({ ...row, partnerPreferences: "Preferred age 25–35; nearby; seeking marriage" }));
  const report = prepareDemoProfiles(rows, "2026-10-10");
  assert.equal(report.coreValidRecords, 50);
  assert.equal(report.preferenceMapping.ageRangeRecords, 50);
  assert.equal(report.preferenceMapping.explicitGoalValues.MARRIAGE, 50);
  assert.equal(report.unresolvedPreferences.length, 50);
  assert.equal(report.prepared.length, 0);
  assert.equal(JSON.stringify(report).includes("nearby"), false);
});

test("import planning skips existing DEMO keys and blocks any REAL key conflict", () => {
  const report = prepareDemoProfiles(dataset(), "2026-10-10");
  const first = report.prepared[0], second = report.prepared[1];
  const blocked = planDemoImport(report, [
    { demoKey: first.demoKey, kind: "DEMO" },
    { demoKey: second.demoKey, kind: "REAL" },
  ]);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.toCreate.length, 0);
  assert.deepEqual(blocked.duplicatePreparedIds, []);
  assert.deepEqual(blocked.alreadyPresentDemoIds, [first.sourceId]);
  assert.deepEqual(blocked.conflicts, [{ sourceId: second.sourceId, existingKind: "REAL" }]);

  const idempotent = planDemoImport(report, [{ demoKey: first.demoKey, kind: "DEMO" }]);
  assert.equal(idempotent.allowed, true);
  assert.equal(idempotent.toCreate.length, 49);
});
