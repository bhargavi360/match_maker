import { test } from "node:test";
import assert from "node:assert/strict";
import { contactSchema, genderSchema, profileSchema, profileReviewStatusSchema, userRoleSchema } from "../src/domain/validation";
import { formatAgeConfirmedDisplay, parseAgeConfirmedDisplay } from "../src/domain/profile-form";

const profile = {
  displayName: "Synthetic Profile",
  reportedAge: null,
  ageConfirmedOn: null,
  city: null,
  region: null,
  country: null,
  education: null,
  occupation: null,
  interests: [],
  values: [],
  relationshipGoals: [],
  lifestyle: [],
  communicationStyle: null,
  bio: null,
};

test("gender is explicitly reported text, while empty and explicit unknown labels stay null", () => {
  assert.equal(genderSchema.parse(undefined), null);
  assert.equal(genderSchema.parse(null), null);
  assert.equal(genderSchema.parse("  "), null);
  for (const value of ["unknown", "UNDISCLOSED", "Not disclosed", "Prefer not to say", "Prefer not to disclose"]) {
    assert.equal(genderSchema.parse(value), null);
  }
  assert.equal(genderSchema.parse("  Woman  "), "Woman");
  assert.equal(genderSchema.safeParse("g".repeat(81)).success, false);
});

test("existing profile inputs remain valid with an unknown gender default", () => {
  assert.equal(profileSchema.parse(profile).gender, null);
  assert.equal(profileSchema.parse({ ...profile, gender: "Man" }).gender, "Man");
});

test("user roles and profile review statuses reject unrecognized values", () => {
  assert.equal(userRoleSchema.parse("USER"), "USER");
  assert.equal(userRoleSchema.safeParse("OWNER").success, false);
  assert.equal(profileReviewStatusSchema.parse("APPROVED"), "APPROVED");
  assert.equal(profileReviewStatusSchema.safeParse("ACTIVE").success, false);
});

test("age confirmation display converts valid DD-MM-YYYY dates to the domain format", () => {
  assert.deepEqual(parseAgeConfirmedDisplay("09-10-2026"), { ok: true, value: "2026-10-09" });
  assert.deepEqual(parseAgeConfirmedDisplay(""), { ok: true, value: null });
  assert.deepEqual(parseAgeConfirmedDisplay("31-02-2026"), { ok: false });
  assert.deepEqual(parseAgeConfirmedDisplay("2026-10-09"), { ok: false });
  assert.equal(formatAgeConfirmedDisplay("2026-10-09"), "09-10-2026");
  assert.equal(formatAgeConfirmedDisplay(null), "");
});

test("private contacts require an international phone number and normalize punctuation", () => {
  assert.deepEqual(contactSchema.parse({ email: "fixture@example.invalid", phone: "+91 (98765) 43210" }), {
    email: "fixture@example.invalid",
    phone: "+919876543210",
  });
  assert.equal(contactSchema.safeParse({ email: "not-an-email", phone: "+919876543210" }).success, false);
  assert.equal(contactSchema.safeParse({ email: "", phone: "98765 43210" }).success, false);
  assert.deepEqual(contactSchema.parse({ email: "", phone: "" }), { email: null, phone: null });
});
