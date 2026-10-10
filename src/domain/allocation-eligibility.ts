import { ageCurrent, matchingPersonSchema, type MatchingPerson } from "./matching";
import { preferenceSchema } from "./validation";

export type AllocationProfileCheck = { person: MatchingPerson | null; reasons: string[] };

/** Applies the existing profile, approval, adult-age, and age-freshness rules before pair evaluation. */
export function checkAllocationProfile(value: unknown, today: string): AllocationProfileCheck {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const reasons: string[] = [];
  if (record.status !== "ACTIVE") reasons.push("INACTIVE");
  if (record.reviewStatus === "PENDING" || record.reviewStatus === "REJECTED") reasons.push("REVIEW_" + record.reviewStatus);
  else if (record.reviewStatus !== "APPROVED") reasons.push("REVIEW_INVALID");

  const parsed = matchingPersonSchema.safeParse(value);
  if (!parsed.success) {
    reasons.push(typeof record.reportedAge === "number" && record.reportedAge < 18 ? "UNDERAGE" : "UNDERAGE_OR_INVALID_FACTS");
    return { person: null, reasons };
  }
  if (!ageCurrent(parsed.data, today)) reasons.push("AGE_UNCONFIRMED");
  if (parsed.data.preference && !preferenceSchema.safeParse(parsed.data.preference.data).success) reasons.push("INVALID_PREFERENCES");
  return reasons.length ? { person: null, reasons } : { person: parsed.data, reasons };
}
