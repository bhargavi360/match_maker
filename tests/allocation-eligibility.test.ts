import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { checkAllocationProfile } from "../src/domain/allocation-eligibility";
import type { MatchingPerson } from "../src/domain/matching";

const today = new Date().toISOString().slice(0, 10);
function person(overrides: Partial<MatchingPerson> = {}): MatchingPerson {
  return {
    id: randomUUID(), kind: "REAL", status: "ACTIVE", reviewStatus: "APPROVED", displayName: "Synthetic profile", gender: null,
    demoKey: null, revision: 1, reportedAge: 30, ageConfirmedOn: today, city: null, region: null, country: null, education: null,
    communicationStyle: null, interests: [], values: [], relationshipGoals: [], lifestyle: [], preference: null, ...overrides,
  };
}

test("allocation eligibility excludes inactive, unapproved, underage, and stale-age records", () => {
  const inactive = checkAllocationProfile(person({ status: "ARCHIVED" }), today);
  assert.equal(inactive.person, null);
  assert.ok(inactive.reasons.includes("INACTIVE"));

  for (const reviewStatus of ["PENDING", "REJECTED"] as const) {
    const result = checkAllocationProfile(person({ status: "ARCHIVED", reviewStatus }), today);
    assert.equal(result.person, null);
    assert.ok(result.reasons.includes("INACTIVE"));
    assert.ok(result.reasons.includes("REVIEW_" + reviewStatus));
  }

  const underage = checkAllocationProfile(person({ reportedAge: 17 }), today);
  assert.equal(underage.person, null);
  assert.ok(underage.reasons.includes("UNDERAGE"));

  const staleDate = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const stale = checkAllocationProfile(person({ ageConfirmedOn: staleDate }), today);
  assert.equal(stale.person, null);
  assert.ok(stale.reasons.includes("AGE_UNCONFIRMED"));
});
