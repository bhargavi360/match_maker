import { test } from "node:test";
import assert from "node:assert/strict";
import { emailTextSchema, createDraftSchema, dispatchEmailSchema, reduceEmailEvidence, type EvidenceState, type EmailEventType } from "../src/domain/email";
const at = "2026-10-09T10:00:00.000Z", earlier = "2026-10-09T09:00:00.000Z", later = "2026-10-09T11:00:00.000Z";
const unknown: EvidenceState = { state: "UNKNOWN", evidenceAt: null, evidenceType: null };
test("plain-text validation preserves reviewed whitespace and rejects unsafe headers/body/bounds", () => {
  const value = { subject: " Exact subject ", body: "Line one\n\tLine two " }; assert.deepEqual(emailTextSchema.parse(value), value);
  for (const subject of ["", " ", "Bad\r\nBcc: injected", "Bad\u0000", "x".repeat(201)]) assert.equal(emailTextSchema.safeParse({ ...value, subject }).success, false);
  for (const body of ["", " ", "Bad\u0000", "Bad\r", "x".repeat(10001)]) assert.equal(emailTextSchema.safeParse({ ...value, body }).success, false);
});
test("strict command schemas reject forged recipients, status, HTML, sender and actor claims", () => {
  assert.equal(createDraftSchema.safeParse({ workflowId: "cba5585c-2444-4aec-bec5-fcecbec9578e", recipient: "SOURCE", recipientEmail: "forged@example.invalid" }).success, false);
  for (const extra of [{ state: "DELIVERED" }, { actorId: "forged" }, { from: "forged@example.invalid" }, { html: "<script>" }]) assert.equal(dispatchEmailSchema.safeParse({ revision: 1, confirmation: "SEND EMAIL", ...extra }).success, false);
});
test("late verified evidence resolves UNKNOWN without claiming a read", () => { const state = reduceEmailEvidence(unknown, "email.delivered", at); assert.equal(state.state, "DELIVERED"); assert.equal(state.evidenceType, "WEBHOOK:email.delivered"); });
test("duplicates and earlier progress cannot regress delivered evidence", () => { const delivered = reduceEmailEvidence(unknown, "email.delivered", at); assert.deepEqual(reduceEmailEvidence(delivered, "email.sent", later), delivered); assert.deepEqual(reduceEmailEvidence(delivered, "email.delivered", at), delivered); assert.deepEqual(reduceEmailEvidence(delivered, "email.delivery_delayed", earlier), delivered); });
test("terminal contradictions use event time and deterministic equal-time priority", () => { const delivered = reduceEmailEvidence(unknown, "email.delivered", at); assert.deepEqual(reduceEmailEvidence(delivered, "email.bounced", earlier), delivered); assert.equal(reduceEmailEvidence(delivered, "email.bounced", later).state, "BOUNCED"); assert.equal(reduceEmailEvidence(delivered, "email.suppressed", at).state, "SUPPRESSED"); });
test("authenticated retrieval without an event time cannot overwrite existing terminal evidence", () => { const delivered = reduceEmailEvidence(unknown, "email.delivered", at); assert.deepEqual(reduceEmailEvidence(delivered, "email.failed", later, "RECONCILIATION"), delivered); assert.equal(reduceEmailEvidence(unknown, "email.failed", at, "RECONCILIATION").state, "FAILED"); });
test("all evidence permutations produce the same terminal state without chronological regressions", () => {
  const events: [EmailEventType, string][] = [["email.sent", earlier], ["email.delivered", at], ["email.bounced", later]];
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) { let state = unknown; for (const i of order) state = reduceEmailEvidence(state, ...events[i]); assert.equal(state.state, "BOUNCED"); }
});
