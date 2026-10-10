# Matching algorithm and AI boundary

Algorithm version: **mutual-coverage-v1**. Scores are product heuristics for professional review. They are not scientifically validated probabilities, predictions or approval decisions.

## Eligibility comes first

Both profiles must be different, ACTIVE, in the same REAL/DEMO classification, and validated adults aged at least 18. Reported age must have a real, nonfuture confirmation date within **365 days** of the request's UTC date. No birth date or advancing age is inferred. This freshness interval is a documented initial product rule, not a medical or scientific standard.

Strict rules are checked independently in both directions. AGE_RANGE requires both accepted bounds and the other person's fresh confirmed age. LOCATION requires an exact accepted city/region/country label; an unmatched label with any unknown location granularity stays unresolved, since the missing fact could contain an accepted place. RELATIONSHIP_GOALS requires an explicitly accepted goal and at least one recorded goal. SMOKING requires one recorded preferred smoking state and one unambiguous recorded state in the other profile.

Explicit smoking states are NON_SMOKER and SMOKER. Absence of either means unknown; other lifestyle tags are not evidence of smoking status. Conflicting states require review. The added SMOKER value is an additive validated JSON category. It does not infer or convert any existing profile.

A known strict violation is INELIGIBLE. Missing/stale/invalid required evidence is UNRESOLVED. Neither gets a score or appears as a candidate card. Valid current preferences with no configured hard rules assert no additional strict rule; they do not assert that unrecorded preferences are satisfied. Factor fallbacks below still apply. Unsupported/corrupt stored preferences or facts fail closed with safe reason codes.

There is no human rejection/workflow table to consult in this stage, and none is invented. Non-age facts use the current recorded values and revisions; field-specific expiry/verification policies remain a later decision.

## Eight directional factors

Categorical strings use Unicode NFKC, trimmed/collapsed whitespace and lowercase. Duplicate normalized set members do not inflate overlap. Exact labels do not imply synonyms, prestige, geography inference or lifestyle facts.

| Factor | Default raw weight | Direction A → B |
| --- | ---: | --- |
| Values | 20 | Fraction of A's explicit preferred values present in B's recorded values; otherwise Jaccard overlap of recorded value sets |
| Relationship goals | 20 | Fraction of A's explicitly acceptable goals present in B's goals; otherwise Jaccard overlap |
| Interests | 15 | Jaccard overlap of the two normalized recorded interest sets |
| Lifestyle | 15 | Average known agreement on A's explicit desired attributes, otherwise A's recorded attributes; no comparable attributes means unknown |
| Communication style | 10 | B's style accepted by A's explicit list (100/0), otherwise exact recorded agreement (100/0) |
| Location | 10 | Explicit accepted-place preferences first (100/0/unknown); otherwise same city 100, region 70, country 40, different known countries 0 |
| Age preferences | 5 | B within A's complete accepted range: 100. Outside: decrease 10 per year, minimum zero. Missing either bound means unknown |
| Education | 5 | B's recorded description accepted by A's explicit list (100/0); no explicit preference means unknown |

Empty/missing actual sets are unknown, even with an explicit preference. Empty sets are never a perfect Jaccard match. Education is never ranked by prestige. Acceptable education/communication lists are optional additive fields in the existing preference JSON; old records default to empty lists and do not receive invented preferences.

Lifestyle attributes currently encode positive reported facts. Unmentioned tags stay unknown. Explicit comparable opposites are EARLY_RISER/NIGHT_OWL and NON_SMOKER/SMOKER; known opposition scores zero. Agreement contributes 100. Directional lifestyle coverage is usable comparisons divided by requested attributes. A requested TRAVEL fact with no recorded comparison stays unknown. Strict smoking is enforced before any lifestyle score.

Fallback location comparison requires both recorded countries to avoid assuming that similarly named cities are the same place. A known matching city takes precedence unless recorded regions conflict; then the matching country/region hierarchy applies. When a same-country comparison lacks region or city, its coverage is the fraction of the three granularities comparable in both profiles. A missing country makes fallback location unknown. Exact accepted-location labels remain the initial preference format; a future geocoded taxonomy is not implemented.

## Mutual score and coverage

Each factor computes scoreAB and scoreBA. If either direction is unknown, mutualScore is null and usable mutual evidenceCoverage is zero. Otherwise mutualScore is the lower direction and evidenceCoverage is the lower directional usable fraction. This conservative rule prevents a known direction from supplying an assumed score for the unknown direction.

For validated raw weights:

    overallScore = sum(weight * evidenceCoverage * mutualScore)
                   / sum(weight * evidenceCoverage)
    weightedCompleteness = 100 * sum(weight * evidenceCoverage) / sum(weight)

All eight weights are required integers from 0 through 100, with at least one positive. The stored total does not need to equal 100. Zero-weight factors cannot affect the score or completeness denominator. Proportional scaling leaves results unchanged.

If no positively weighted mutual evidence is usable, status is INSUFFICIENT_DATA and the score is null. A known factor score of zero still contributes evidence. Internally, factor comparisons and weighted calculations retain fractional precision; returned directional/factor/overall scores and completeness are rounded once to nearest whole numbers. Returned coverage fractions stay in [0,1]. Labels use the displayed integer completeness: below 50 Limited evidence, 50–79 Partial evidence, 80 or higher More complete evidence. These labels describe facts available, not statistical confidence.

Results include algorithm version, weight version, both profile revisions and both preference revisions (null if absent). Matching computes assessments on demand without a pair matrix. The human workflow separately freezes a selected assessment snapshot for exact review, approval and later stale-evidence checks.

## Ranking and pagination

Eligible numeric scores sort descending, then displayed completeness descending, then stable profile UUID ascending. Eligible INSUFFICIENT_DATA entries follow numeric scores and retain their missing-data disclosure. Every page has at most ten records.

The service reads source, candidate facts/preferences and settings within one SQLite read transaction. An HMAC-authenticated offset cursor binds the ordered classification dataset's IDs/global revisions/preference revisions, source ID, exact effective filters/query, weights/version, algorithm version and UTC day. Changing a profile, contact, consent, preferences, archive state, reset/seed, source, filter or weights invalidates the old cursor. Deleted/created rows change the snapshot too. Changed data produces 409 and asks for a fresh search; pages are never silently combined across versions.

The initial bounded implementation supports at most 1,000 profiles per classification. Above that limit it fails explicitly; it does not silently truncate ranking. Source selection displays the first 200 active profiles and labels that limit. A larger-dataset index/selection strategy remains a later extension. No private contacts are selected into matching/search DTOs.

## Structured and natural-language search

Exact allowlisted structured fields: min/max age, city, region, country, education, communication style, allowed goals, required interest terms and lifestyle categories. Matching is always active-only and source-classification isolated. Profiles' existing ordinary list retains its separate active/archive/all controls; the advanced search is active-only with an explicit REAL or DEMO mode.

Relative Matches filters support same city/region/country and minimum shared-interest count. Relative advanced Profiles search has no source and therefore returns no broadened results, with a message directing the operator to Matches. Missing required filter facts do not satisfy filters.

The local grammar recognizes active profiles, age ranges such as ages 25 to 40, long-term relationship/marriage/companionship/exploring, non-smoker/vegetarian/early riser/night owl/home oriented/travel/social, same city/region/country and share at least one/two/three (or a bounded integer) interests. Remaining unrecognized text makes the interpretation fail. It is labeled Local fallback and returns no results rather than dropping unknown constraints. An explicitly empty query uses the structured filters.

Natural and structured restrictions are combined conservatively: intersect age ranges/goal choices, combine required interest/lifestyle terms, and reject contradictory exact filters. The response/UI shows effective filters actually applied.

## Optional Gemini gateway

Only src/server/ai-gateway.ts imports/constructs the official Google SDK. No route accepts client profile objects, authoritative scores, consent claims or arbitrary fields. Both endpoints authenticate independently. The gateway uses no tools, SQL, images, history, profile mutation or workflow actions.

Configuration requires GEMINI_ENABLED=true, GEMINI_API_KEY and an explicitly chosen supported GEMINI_MODEL. Placeholders are in .env.example; no credentials were added to the actual environment by Stage 5. API availability/model behavior has not been live-tested. Use the [official model documentation](https://ai.google.dev/gemini-api/docs/models) when selecting the operator's model.

Search interpretation requires the selected source's current SEARCH grant, although no source/candidate values are sent. Only a canonical query reconstructed from fully recognized allowlisted grammar leaves the server. Arbitrary original text, named locations, identities and all profile data stay local. Model filters must pass strict validation and exactly preserve the local constraints; any broadened/changed constraint is rejected. This deliberate limit prioritizes privacy over open-ended interpretation. Structured fields handle unsupported named filters locally.

Pair explanation requires current EXPLANATION grants for both profiles. The server recomputes eligibility/scores from stored facts and sends only Person A/Person B aliases, overall integer score/completeness and eight factor keys/directional/mutual scores/coverage fractions. Names, IDs, contacts/ciphertext, biographies, education/communication free text, photos, notes and keys are absent. Consent is rechecked after output, and a changed assessment stamp discards model text. The Matches page does not persist/cache explanations; closing/reopening requests a fresh result. Persistent internal chat stores its responses encrypted, labels model interpretation separately from stored evidence, and withholds historical Gemini content when current required consent is withdrawn. See [chat retention and tools](chat-tools.md).

Generated text is untrusted plain text, escaped by React, with no HTML or execution. Strict output schemas reject unsolicited score/ID fields and bounded unsafe text. The gateway enforces an eight-second task deadline/abort, one provider attempt, 512 output-token limit, 64 KiB entire response-body cap and 4 KiB generated-JSON cap. A shared atomic 30-task/15-minute bucket limits optional dispatches. Failures are sanitized and audited by action only, without prompts, responses or private values.

Unconfigured Gemini, absent scope, unsafe query/output, quota exhaustion, timeout or provider error produces a clearly labeled Local explanation or Local fallback. Deterministic matching never requires AI-processing consent. Permission recording alone does not enable a provider, and synthetic permission never becomes real customer permission.

SDK cancellation bounds the application's wait; provider-side processing/billing cancellation is not guaranteed. The gateway does not retroactively delete a response already sent to a provider, and revocation cannot erase text the operator has already viewed. It blocks new requests/reuse and discards responses that become unauthorized while in flight. No production hosting, provider account provisioning, approval workflow, email delivery or persistent chat is included.
