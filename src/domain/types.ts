import type { ProfileInput, ProfileReviewStatus, UserRole, consentScopes } from "./validation";
export type ConsentScope = typeof consentScopes[number];
export type MatchmakerUser = { id: string; name: string; role: UserRole };
export type ProfileDTO = ProfileInput & {
  id: string; kind: "REAL" | "DEMO"; status: "ACTIVE" | "ARCHIVED"; reviewStatus: ProfileReviewStatus; revision: number;
  demoKey: string | null; createdAt: string; updatedAt: string;
};
export type ProfileDetail = ProfileDTO & {
  preference: { data: unknown; revision: number } | null;
  consents: { scope: ConsentScope; status: "GRANTED" | "WITHDRAWN"; policyVersion: string; provenance: string; synthetic: boolean; revision: number; changedAt: string }[];
};
