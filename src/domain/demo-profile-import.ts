import { createHash } from "node:crypto";
import { preferenceSchema, profileSchema, type ProfileInput } from "./validation";

type PreferenceData = ReturnType<typeof preferenceSchema.parse>;
export type PreparedDemoProfile = {
  sourceId: string;
  demoKey: string;
  kind: "DEMO";
  status: "ARCHIVED";
  reviewStatus: "PENDING";
  profile: ProfileInput;
  preference: PreferenceData;
};
export type DemoImportIssue = { record: number | null; field: string; code: string };
export type UnresolvedDemoPreference = { sourceId: string | null; field: "partnerPreferences"; code: string };
export type DemoImportReport = {
  total: number;
  coreValidRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  genderCounts: { male: number; female: number; other: number };
  uniqueStableIds: number;
  prepared: PreparedDemoProfile[];
  issues: DemoImportIssue[];
  preferenceMapping: {
    ageRangeRecords: number;
    explicitGoalValues: Record<string, number>;
    ambiguousGoalMentions: Record<string, number>;
    locations: number;
    sharedValues: number;
    communicationStyles: number;
    educationLevels: number;
    lifestyle: number;
    dealBreakers: number;
    fullyStructuredRecords: number;
  };
  unresolvedPreferences: UnresolvedDemoPreference[];
  skippedFields: string[];
};

const goalMap: Record<string, "LONG_TERM" | "MARRIAGE" | "COMPANIONSHIP" | "EXPLORING"> = {
  "long term": "LONG_TERM", "long-term": "LONG_TERM", marriage: "MARRIAGE",
  companionship: "COMPANIONSHIP", exploring: "EXPLORING",
};
const lifestyleMap: Record<string, "ACTIVE" | "HOME_ORIENTED" | "SOCIAL" | "TRAVEL" | "EARLY_RISER" | "NIGHT_OWL" | "VEGETARIAN" | "NON_SMOKER" | "SMOKER"> = {
  active: "ACTIVE", "home oriented": "HOME_ORIENTED", "home-oriented": "HOME_ORIENTED",
  social: "SOCIAL", travel: "TRAVEL", "early riser": "EARLY_RISER", "night owl": "NIGHT_OWL",
  vegetarian: "VEGETARIAN", "non-smoker": "NON_SMOKER", "non smoker": "NON_SMOKER", smoker: "SMOKER",
};
const explicitGoalPattern = /\b(?:looking for|seeking|wants?|hopes? for|interested in|prefers?)\s+(?:a\s+|an\s+)?(marriage|companionship|exploring|long[- ]term\s+(?:relationship|partnership))\b/gi;
const explicitAgeRangePattern = /\bpreferred\s+age\s+(\d{2,3})\s*[-\u2010-\u2015]\s*(\d{2,3})\b/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function strictDate(value: unknown, today: string): string | null {
  if (typeof value !== "string") return null;
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    [, year, month, day] = [iso[0], Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const dashed = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
    if (!dashed) return null;
    const first = Number(dashed[1]), second = Number(dashed[2]);
    year = Number(dashed[3]);
    const dmyValid = first >= 1 && first <= 31 && second >= 1 && second <= 12;
    const mdyValid = first >= 1 && first <= 12 && second >= 1 && second <= 31;
    if (!dmyValid && !mdyValid || dmyValid && mdyValid && first !== second) return null;
    month = dmyValid ? second : first;
    day = dmyValid ? first : second;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const normalized = date.toISOString().slice(0, 10);
  return normalized <= today ? normalized : null;
}

function stringField(record: Record<string, unknown>, key: string, issues: DemoImportIssue[], index: number, required = false): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    if (required || value !== undefined && value !== null) issues.push({ record: index, field: key, code: "EXPECTED_STRING" });
    return null;
  }
  if (required && value.trim().length === 0) issues.push({ record: index, field: key, code: "REQUIRED" });
  return value;
}

function stringList(value: unknown, field: string, index: number, issues: DemoImportIssue[]): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    issues.push({ record: index, field, code: "EXPECTED_STRING_ARRAY" });
    return [];
  }
  return value as string[];
}

function stableDemoKey(sourceId: string) {
  const digest = createHash("sha256").update(`matchmaker-demo-import-v1\0${sourceId}`).digest("hex");
  return `demo50-v1-${digest}`;
}

function blankPreferenceData(minAge: number, maxAge: number, goals: PreferenceData["goals"]): unknown {
  return { minAge, maxAge, locations: [], sharedValues: [], communicationStyles: [], educationLevels: [], goals, lifestyle: [], dealBreakers: [] };
}

function parsePreference(value: unknown, index: number, issues: DemoImportIssue[]) {
  if (isRecord(value)) {
    const result = preferenceSchema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) issues.push({ record: index, field: `partnerPreferences.${issue.path.join(".") || "root"}`, code: "SCHEMA_INVALID" });
      return { data: null as PreferenceData | null, ageRange: false, goalValues: [] as string[], ambiguousGoals: [] as string[], unresolved: "INVALID_STRUCTURED_OBJECT" };
    }
    return {
      data: result.data,
      ageRange: result.data.minAge !== null && result.data.maxAge !== null,
      goalValues: result.data.goals,
      ambiguousGoals: [] as string[],
      unresolved: null as string | null,
    };
  }

  if (typeof value !== "string" || value.trim() === "") {
    return { data: null as PreferenceData | null, ageRange: false, goalValues: [] as string[], ambiguousGoals: [] as string[], unresolved: "MISSING_OR_UNSUPPORTED_PREFERENCE" };
  }

  const ageMatches = [...value.matchAll(explicitAgeRangePattern)];
  let ageRange: { minAge: number; maxAge: number } | null = null;
  let residual = value;
  if (ageMatches.length === 1) {
    const minAge = Number(ageMatches[0][1]), maxAge = Number(ageMatches[0][2]);
    const minOk = preferenceSchema.shape.minAge.safeParse(minAge).success;
    const maxOk = preferenceSchema.shape.maxAge.safeParse(maxAge).success;
    if (minOk && maxOk && minAge <= maxAge) {
      ageRange = { minAge, maxAge };
      residual = residual.replace(ageMatches[0][0], "");
    }
  }

  const goalMatches = [...value.matchAll(explicitGoalPattern)];
  const goalValues: PreferenceData["goals"] = [];
  for (const match of goalMatches) {
    const normalized = match[1].toLowerCase().replaceAll("-", " ").replace(/\s+(?:relationship|partnership)$/, "");
    const goal = goalMap[normalized];
    if (goal && !goalValues.includes(goal)) goalValues.push(goal);
    residual = residual.replace(match[0], "");
  }
  const ambiguousGoals: string[] = [];
  for (const match of value.matchAll(/\b(long[- ]term|marriage|companionship|exploring)\b/gi)) {
    const insideExplicitGoal = goalMatches.some(goal => match.index! >= goal.index! && match.index! < goal.index! + goal[0].length);
    if (!insideExplicitGoal) ambiguousGoals.push(goalMap[match[1].toLowerCase().replaceAll("-", " ")] ?? "UNMAPPED_GOAL");
  }
  const hasUnmappedRemainder = residual.replace(/[\s;,.:.-]/g, "").replace(/[\u2010-\u2015]/g, "") !== "";
  const parsed = ageRange !== null && !hasUnmappedRemainder
    ? preferenceSchema.safeParse(blankPreferenceData(ageRange.minAge, ageRange.maxAge, goalValues))
    : null;
  return {
    data: parsed?.success ? parsed.data : null,
    ageRange: ageRange !== null,
    goalValues,
    ambiguousGoals,
    unresolved: parsed?.success ? null : "UNMAPPED_PREFERENCE_TEXT",
  };
}

/** Pure preparation only. It does not access a database or include contact values. */
export function prepareDemoProfiles(input: unknown, today = new Date().toISOString().slice(0, 10)): DemoImportReport {
  const issues: DemoImportIssue[] = [], prepared: PreparedDemoProfile[] = [];
  const unresolvedPreferences: UnresolvedDemoPreference[] = [];
  const genderCounts = { male: 0, female: 0, other: 0 };
  const preferenceMapping: DemoImportReport["preferenceMapping"] = {
    ageRangeRecords: 0, explicitGoalValues: {}, ambiguousGoalMentions: {}, locations: 0, sharedValues: 0,
    communicationStyles: 0, educationLevels: 0, lifestyle: 0, dealBreakers: 0, fullyStructuredRecords: 0,
  };
  if (!Array.isArray(input)) {
    return { total: 0, coreValidRecords: 0, invalidRecords: 0, duplicateRecords: 0, genderCounts, uniqueStableIds: 0, prepared, issues: [{ record: null, field: "root", code: "EXPECTED_ARRAY" }], preferenceMapping, unresolvedPreferences, skippedFields: ["fullName", "emailAddress", "mobileNumber"] };
  }

  const seenIds = new Set<string>(), invalidRecords = new Set<number>();
  let duplicateRecords = 0, coreValidRecords = 0;
  input.forEach((value, offset) => {
    const index = offset + 1, before = issues.length;
    if (!isRecord(value)) {
      issues.push({ record: index, field: "record", code: "EXPECTED_OBJECT" });
      invalidRecords.add(index);
      return;
    }
    const sourceId = value.id;
    if (typeof sourceId !== "string" || !sourceId.trim() || sourceId.trim() !== sourceId || sourceId.length > 160) {
      issues.push({ record: index, field: "id", code: "INVALID_STABLE_ID" });
    } else if (seenIds.has(sourceId.toLocaleLowerCase("en-US"))) {
      issues.push({ record: index, field: "id", code: "DUPLICATE_STABLE_ID" });
      duplicateRecords += 1;
    } else {
      seenIds.add(sourceId.toLocaleLowerCase("en-US"));
    }

    if (value.isDemo !== true || value.dataStatus !== "synthetic_demo_pending_review") issues.push({ record: index, field: "isDemo/dataStatus", code: "SYNTHETIC_PENDING_MARKER_REQUIRED" });
    const rawGender = typeof value.gender === "string" ? value.gender.trim().toLowerCase() : "";
    if (rawGender === "male") genderCounts.male += 1;
    else if (rawGender === "female") genderCounts.female += 1;
    else { genderCounts.other += 1; issues.push({ record: index, field: "gender", code: "GENDER_MUST_BE_MALE_OR_FEMALE" }); }

    const displayName = stringField(value, "displayName", issues, index, true);
    const age = value.reportedAge;
    if (typeof age !== "number" || !Number.isInteger(age) || age < 18 || age > 120) issues.push({ record: index, field: "reportedAge", code: "INVALID_ADULT_AGE" });
    const ageConfirmedOn = strictDate(value.ageLastConfirmed, today);
    if (!ageConfirmedOn) issues.push({ record: index, field: "ageLastConfirmed", code: "INVALID_OR_AMBIGUOUS_DATE" });
    const interests = stringList(value.interests, "interests", index, issues);
    const values = stringList(value.values, "values", index, issues);
    const rawGoals = typeof value.relationshipGoals === "string" ? [value.relationshipGoals] : stringList(value.relationshipGoals, "relationshipGoals", index, issues);
    const relationshipGoals = rawGoals.map(goal => {
      const mapped = goalMap[goal.trim().toLowerCase()];
      if (!mapped) issues.push({ record: index, field: "relationshipGoals", code: "UNMAPPED_VALUE" });
      return mapped ?? goal;
    });
    const rawLifestyle = stringList(value.lifestyle, "lifestyle", index, issues);
    const lifestyle = rawLifestyle.map(item => {
      const mapped = lifestyleMap[item.trim().toLowerCase()];
      if (!mapped) issues.push({ record: index, field: "lifestyle", code: "UNMAPPED_VALUE" });
      return mapped ?? item;
    });
    const preference = parsePreference(value.partnerPreferences, index, issues);
    if (preference.ageRange) preferenceMapping.ageRangeRecords += 1;
    for (const goal of preference.goalValues) preferenceMapping.explicitGoalValues[goal] = (preferenceMapping.explicitGoalValues[goal] ?? 0) + 1;
    for (const goal of preference.ambiguousGoals) preferenceMapping.ambiguousGoalMentions[goal] = (preferenceMapping.ambiguousGoalMentions[goal] ?? 0) + 1;
    if (preference.data) {
      preferenceMapping.fullyStructuredRecords += 1;
      preferenceMapping.locations += Number(preference.data.locations.length > 0);
      preferenceMapping.sharedValues += Number(preference.data.sharedValues.length > 0);
      preferenceMapping.communicationStyles += Number(preference.data.communicationStyles.length > 0);
      preferenceMapping.educationLevels += Number(preference.data.educationLevels.length > 0);
      preferenceMapping.lifestyle += Number(preference.data.lifestyle.length > 0);
      preferenceMapping.dealBreakers += Number(preference.data.dealBreakers.length > 0);
    }
    if (preference.unresolved) unresolvedPreferences.push({ sourceId: typeof sourceId === "string" ? sourceId : null, field: "partnerPreferences", code: preference.unresolved });

    const profileCandidate = {
      displayName: displayName ?? "", gender: rawGender || null,
      reportedAge: typeof age === "number" ? age : null, ageConfirmedOn,
      city: stringField(value, "city", issues, index), region: stringField(value, "region", issues, index), country: stringField(value, "country", issues, index),
      education: stringField(value, "education", issues, index), occupation: stringField(value, "occupation", issues, index),
      interests, values, relationshipGoals, lifestyle,
      communicationStyle: stringField(value, "communicationStyle", issues, index), bio: stringField(value, "about", issues, index),
    };
    const profile = profileSchema.safeParse(profileCandidate);
    if (!profile.success) for (const issue of profile.error.issues) issues.push({ record: index, field: issue.path.join(".") || "profile", code: "PROFILE_SCHEMA_INVALID" });
    if (issues.length !== before) { invalidRecords.add(index); return; }
    coreValidRecords += 1;
    if (!profile.data || !preference.data || preference.unresolved || typeof sourceId !== "string") return;

    prepared.push({ sourceId, demoKey: stableDemoKey(sourceId), kind: "DEMO", status: "ARCHIVED", reviewStatus: "PENDING", profile: profile.data, preference: preference.data });
  });

  if (input.length !== 50) issues.push({ record: null, field: "root", code: "EXPECTED_EXACTLY_50_RECORDS" });
  if (genderCounts.male !== 25 || genderCounts.female !== 25 || genderCounts.other !== 0) issues.push({ record: null, field: "gender", code: "EXPECTED_25_MALE_AND_25_FEMALE" });
  return {
    total: input.length, coreValidRecords, invalidRecords: invalidRecords.size, duplicateRecords, genderCounts,
    uniqueStableIds: seenIds.size, prepared, issues, preferenceMapping, unresolvedPreferences,
    skippedFields: ["fullName (displayName is the schema field)", "emailAddress (contact data not imported)", "mobileNumber (contact data not imported)", "dataStatus (validated as source marker only)"],
  };
}

export type ExistingDemoIdentity = { demoKey: string | null; kind: string };
/** Pass only existing profiles for the same owner; call inside the eventual import transaction. */
export function planDemoImport(report: DemoImportReport, existing: readonly ExistingDemoIdentity[]) {
  const existingByKey = new Map<string, string[]>();
  for (const row of existing) if (row.demoKey) existingByKey.set(row.demoKey, [...(existingByKey.get(row.demoKey) ?? []), row.kind]);
  const alreadyPresentDemoIds: string[] = [], conflicts: { sourceId: string; existingKind: string }[] = [];
  const duplicatePreparedIds: string[] = [], seenPreparedKeys = new Set<string>();
  for (const candidate of report.prepared) {
    if (seenPreparedKeys.has(candidate.demoKey)) { duplicatePreparedIds.push(candidate.sourceId); continue; }
    seenPreparedKeys.add(candidate.demoKey);
    const kinds = existingByKey.get(candidate.demoKey) ?? [];
    if (kinds.length && kinds.every(kind => kind === "DEMO")) alreadyPresentDemoIds.push(candidate.sourceId);
    else if (kinds.length) conflicts.push({ sourceId: candidate.sourceId, existingKind: kinds.find(kind => kind !== "DEMO") ?? "DUPLICATE_EXISTING_KEY" });
  }
  const blocked = report.total !== 50 || report.coreValidRecords !== 50 || report.invalidRecords !== 0 || report.duplicateRecords !== 0 || report.issues.length > 0 || report.unresolvedPreferences.length > 0 || report.prepared.length !== 50 || conflicts.length > 0 || duplicatePreparedIds.length > 0;
  return { allowed: !blocked, alreadyPresentDemoIds, duplicatePreparedIds, conflicts, toCreate: blocked ? [] : report.prepared.filter(candidate => !alreadyPresentDemoIds.includes(candidate.sourceId)) };
}

export const demoImportFieldMapping = [
  "id -> stable demoKey (SHA-256 namespace key)", "displayName -> Profile.displayName", "gender -> Profile.gender",
  "reportedAge -> Profile.reportedAge", "ageLastConfirmed -> Profile.ageConfirmedOn (strict date parser)",
  "city/region/country -> matching Profile fields", "education/occupation -> matching Profile fields",
  "communicationStyle -> Profile.communicationStyle", "interests/values -> JSON string arrays",
  "relationshipGoals -> LONG_TERM/MARRIAGE/COMPANIONSHIP/EXPLORING", "lifestyle -> supported Profile lifestyle enum values",
  "about -> Profile.bio", "partnerPreferences -> existing preferenceSchema fields only when explicitly and completely mapped",
  "isDemo + dataStatus -> required synthetic source markers; output kind DEMO, status ARCHIVED, reviewStatus PENDING",
];
