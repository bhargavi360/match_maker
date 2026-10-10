import { z } from "zod";
export const consentScopes = ["SEARCH", "MATCHING", "EXPLANATION", "EMAIL_DRAFT", "CHAT"] as const;
export const userRoles = ["USER", "ADMIN"] as const;
export const userRoleSchema = z.enum(userRoles);
export type UserRole = z.infer<typeof userRoleSchema>;
export const profileReviewStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export const profileReviewStatusSchema = z.enum(profileReviewStatuses);
export type ProfileReviewStatus = z.infer<typeof profileReviewStatusSchema>;
export const goals = ["LONG_TERM", "MARRIAGE", "COMPANIONSHIP", "EXPLORING"] as const;
export const lifestyles = ["ACTIVE", "HOME_ORIENTED", "SOCIAL", "TRAVEL", "EARLY_RISER", "NIGHT_OWL", "VEGETARIAN", "NON_SMOKER", "SMOKER"] as const;
export const dealBreakers = ["AGE_RANGE", "LOCATION", "RELATIONSHIP_GOALS", "SMOKING"] as const;
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable();
const list = z.array(z.string().trim().min(1).max(40)).max(12).refine(items => new Set(items.map(item => item.toLowerCase())).size === items.length, "Remove duplicate items.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(value); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value && value <= new Date().toISOString().slice(0,10); }, "Use a real confirmation date that is not in the future.").nullable();
const unknownGenderLabels = new Set(["unknown", "undisclosed", "not disclosed", "prefer not to say", "prefer not to disclose"]);
export const genderSchema = z.union([
  z.string().trim().max(80).transform(value => {
    const normalized = value.normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
    return !normalized || unknownGenderLabels.has(normalized) ? null : value;
  }),
  z.null(),
]).default(null);
export const profileSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
  gender: genderSchema,
  reportedAge: z.number().int().min(18).max(120).nullable(),
  ageConfirmedOn: date,
  city: optionalText(80), region: optionalText(80), country: optionalText(80),
  education: optionalText(160), occupation: optionalText(160),
  interests: list, values: list,
  relationshipGoals: z.array(z.enum(goals)).max(4).refine(items => new Set(items).size === items.length),
  lifestyle: z.array(z.enum(lifestyles)).max(8).refine(items => new Set(items).size === items.length),
  communicationStyle: optionalText(160), bio: optionalText(1500),
}).refine(value => (value.reportedAge === null) === (value.ageConfirmedOn === null), { path: ["ageConfirmedOn"], message: "Age and its confirmation date must be recorded together." });
export type ProfileInput = z.infer<typeof profileSchema>;
export const revisionSchema = z.number().int().min(1);
export const idSchema = z.uuid();
export const contactSchema = z.strictObject({
  email: z.union([z.email().max(254), z.literal("")]).transform(v => v || null).nullable(),
  phone: z.string().max(40).nullable().transform(value => value?.trim().replace(/[\s()-]/g, "") || null)
    .refine(value => value === null || /^\+[1-9]\d{7,14}$/.test(value), "Enter an international number with + and its country code.")
});
export const preferenceSchema = z.strictObject({
  minAge: z.number().int().min(18).max(120).nullable(),
  maxAge: z.number().int().min(18).max(120).nullable(),
  locations: list, sharedValues: list,
  communicationStyles: list.default([]), educationLevels: list.default([]),
  goals: z.array(z.enum(goals)).max(4),
  lifestyle: z.array(z.enum(lifestyles)).max(8),
  dealBreakers: z.array(z.enum(dealBreakers)).max(4),
}).refine(v => v.minAge === null || v.maxAge === null || v.minAge <= v.maxAge, { path: ["maxAge"], message: "Maximum age must be at least the minimum." });
export const consentSchema = z.strictObject({
  scope: z.enum(consentScopes), status: z.enum(["GRANTED", "WITHDRAWN"]),
  policyVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  provenance: z.string().regex(/^[A-Za-z0-9._:/ -]{1,120}$/, "Use an internal evidence reference, without contact details or a full URL.").refine(value => !value.includes("://"), "Use an internal evidence reference, not a full URL."),
});
export const defaultWeights = { values: 20, goals: 20, interests: 15, lifestyle: 15, communication: 10, location: 10, age: 5, education: 5 };
const weight = z.number().int().min(0).max(100);
export const weightsSchema = z.strictObject({ values: weight, goals: weight, interests: weight, lifestyle: weight, communication: weight, location: weight, age: weight, education: weight }).refine(v => Object.values(v).some(value => value > 0), "At least one weight must be positive.");
export const bootstrapSchema = z.strictObject({ token: z.string().max(256), name: z.string().trim().min(1).max(80), email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) });
export const registrationSchema = z.strictObject({ name: z.string().trim().min(1, "Enter your name.").max(80), email: z.email("Enter a valid email address.").max(254).transform(v => v.toLowerCase()), password: z.string().min(12, "Use a password between 12 and 128 characters.").max(128, "Use a password between 12 and 128 characters."), confirmPassword: z.string().min(1, "Confirm your password.").max(128) }).refine(value => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
export const loginSchema = z.strictObject({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });
