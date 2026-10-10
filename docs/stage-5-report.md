# Stage 5 completion report

Implemented on 9 October 2026 in the independent sibling **Data crew/intern/matchmaker-ai-rebuild**. Stage 5 adds deterministic eligibility/mutual scoring, local and structured search, signed ten-result pagination, factor/completeness disclosures, optional consent-gated Gemini text, and versioned scoring settings. Stage 6 has not started.

## Preservation and preflight

Read the project's AGENTS, README, Stage 3/4 reports, source/schema/migration history, auth boundary, scoped consent and revision services, validation, preview APIs and tests. Reviewed installed Next.js authentication/route guidance. Inspected environment variable names only, without printing their values. The configured database exists outside OneDrive and its owner marker is matchmaker-ai-rebuild-stage4.

Read-only Git status showed the sibling as untracked; no unrelated tracked edits were overwritten and no Git mutation occurred. Initial legacy metadata matched the Stage 4 baseline of 157 files and aggregate SHA-256 940be182690330728c93566c3015dc92aabbf2855a14fac2976f846e30212fbf (dependency/generated Next caches excluded).

Before matching changes, observed **13/13 Stage 4 security tests and 23/23 existing browser tests passing**. Stopped only this task's previously started loopback server to let disposable browser tests own port 3100.

## Created and changed files

| Paths relative to rebuild | Purpose |
| --- | --- |
| src/domain/matching.ts | Pure validated eligibility, eight directional/mutual factors, weighted coverage, ranking, version metadata and local explanation |
| src/domain/search.ts | Strict filter schema, conservative local grammar and deterministic recorded-fact filters |
| src/domain/validation.ts | Eight explicit positive-total weight fields; additive optional education/communication preferences; explicit SMOKER JSON category |
| src/server/matching.ts | Independently authenticated source/search/assessment/ranking services, read snapshots, signed version-bound pagination, optimistic/audited settings |
| src/server/ai-gateway.ts | Sole SDK boundary; current scoped consent, number-only pair DTO, canonical query-only DTO, validated/bounded output and local fallbacks |
| src/server/security.ts | Shared atomic optional-AI request bucket alongside existing bootstrap/login buckets |
| src/app/api/workspace/[...path]/route.ts | Allowlisted matches/search/explanation/weight operations using existing authenticated same-origin/body perimeter |
| src/components/matches-live.tsx, search-controls.tsx, profile-search.tsx, scoring-settings.tsx | Live matches, structured/NL filters, separate advanced Profiles search, confirmations, per-factor/missing evidence, temporary explanation dialog |
| src/components/profiles-live.tsx, profile-detail.tsx | Reuse bundled/neutral portraits; edit optional explicit education/communication preferences without erasing them |
| src/components/settings.tsx, shell.tsx, dashboard-live.tsx | Retained appearance controls, honest live matching/provider notices and a real Matches navigation action |
| src/app/(workspace)/matches/page.tsx, settings/page.tsx, profiles/page.tsx; src/app/layout.tsx, globals.css | Authorized live page integration, responsive token-based controls, current metadata |
| tests/matching.test.ts, stage5-security.test.ts, stage5.spec.ts | Pure mathematical/rule tests, disposable authorized/privacy/pagination tests, real browser matching/settings/search |
| tests/shell.spec.ts, playwright.config.ts | Retained old fixed match examples behind Design state examples; current live labeling; forced provider-disabled browser fixtures |
| package.json, package-lock.json, .env.example | Single exact official SDK dependency, test commands, optional placeholder provider names |
| AGENTS.md, README.md, docs/matching-algorithm.md, docs/stage-5-report.md | Authorized scope, local usage, complete rule/AI contract and evidence |

No Prisma schema/migration change was needed. Existing singleton AppSettings JSON/version and PartnerPreference JSON/revision can represent this stage. Legacy preference records default the newly optional arrays to empty, without assigning a preference. Existing weights totaling 100 remain valid; the new validator also allows other positive totals. The previous migration and auth/contact/consent/reset constraints remain unchanged. No pair/workflow/email/chat tables were created.

## Installed versions and dependency decision

Existing versions preserved: Node **24.14.0**, npm **11.9.0**, Next **16.4.0**, React/React DOM **19.3.0**, TypeScript **5.9.3**, Better Auth **1.7.7**, Prisma/client/SQLite adapter **7.10.0**, native better-sqlite3 **12.11.1**, Zod **4.6.5**, Playwright **1.64.0**, axe **4.13.0**.

Added only **@google/genai 2.28.0** as a direct runtime dependency, with its normal transitive dependencies. Official [SDK library guidance](https://ai.google.dev/gemini-api/docs/libraries), [SDK repository/runtime guidance](https://github.com/googleapis/js-genai), and [structured-output guidance](https://ai.google.dev/gemini-api/docs/structured-output) were checked first. npm metadata reports Node >=20 compatibility, satisfied by Node 24. No old Gemini SDK, second ORM/validator, UI framework or provider account was added. Installation emitted a transitive node-domexception deprecation notice but succeeded.

## Architecture and exact behavior

See [matching-algorithm.md](matching-algorithm.md) for the full rules and DTO contracts.

Eligibility is computed before scoring. Self/inactive/mixed-classification pairs and known strict violations are excluded. Adult age must be at least 18 and confirmed within 365 days. Missing/stale strict-rule facts, conflicting smoking states and invalid stored matching data are unresolved. Both directions' age/location/goal/smoking rules apply. Excluded pairs receive no scores/cards; the UI exposes aggregate safe reason counts only. Local matching does not require AI consent.

Eight factors use the supplied 20/20/15/15/10/10/5/5 defaults. Directional preferences/fallbacks are explicit; empty data stays unknown. Mutual score is the lower direction. Usable evidence coverage is the lower directional coverage, zero if either score is unknown. Overall score divides weighted covered score by weighted usable evidence; completeness divides weighted usable evidence by all positive raw weights. No usable denominator means null/INSUFFICIENT_DATA, while known zero remains a numeric zero with evidence. Computation retains fractional precision, then returns integer scores/completeness. Completeness labels use the displayed integer: <50 Limited, 50–79 Partial, >=80 More complete evidence.

Sorting uses numeric score descending, completeness descending, UUID ascending; insufficient-data results follow numeric results. Signed cursors bind source, effective filters/query, classification dataset/revisions, current weights/version, algorithm and UTC day. Page size is fixed at ten. Updates invalidate old pages with 409. Read snapshots and result recomputation avoid persisting a pair matrix. Capacity is explicitly limited to 1,000 profiles/classification and 200 selectable active sources.

Structured filters use allowed recorded fields only. Local natural-language parsing recognizes the displayed narrow grammar and rejects leftover terms instead of broadening results. Profile advanced search is active-only in the selected classification; relative search needs a Matches source. Structured and recognized natural restrictions are combined conservatively and actual effective filters are returned. All paths independently authenticate and reject client-supplied records/scores/weights/consent/actor fields outside the strict contracts.

Settings requires eight whole-number weights 0–100, at least one positive, and explicit SAVE WEIGHTS confirmation. A transaction checks the expected singleton version, increments it only for meaningful changes and logs changed factor names. Stored sums need not equal 100; normalization is mathematical. Stale settings writes fail, and old result pages become invalid.

## Gemini privacy and fallback controls

Only the gateway imports/constructs GoogleGenAI. Optional dispatch requires explicit configured opt-in, private key and chosen model. No live key was added or copied, and no live API request was made.

Source SEARCH consent is checked for canonical query-only interpretation, even though no profile data is sent. Arbitrary original text and named filters stay local. Model filters must be allowlisted and preserve every local constraint. Two-profile explanations require both current EXPLANATION grants and server-computed eligibility/factors. Requests contain temporary aliases and factor numbers only: no contacts/ciphertext, names, IDs, biographies, photos, account/session values or arbitrary facts. Output is strict validated plain text; unsolicited score/ID fields, unsafe/oversized output and bad JSON are rejected.

The task deadline is eight seconds, provider retries are disabled beyond one attempt, generation is bounded to 512 tokens, full response bodies to 64 KiB and generated JSON to 4 KiB. A shared atomic budget allows 30 optional tasks per 15 minutes. Fresh post-response consent and assessment checks discard changed/unauthorized output. No explanation is cached/persisted; each reopening requests fresh evidence. Provider cancellation does not guarantee billing cancellation or erase data already transmitted.

Missing configuration/scope, unsafe query/output, provider failure, quota exhaustion or timeout produces a labeled Local fallback/Local explanation. Audit records only safe action metadata, never queries, facts, model text or secrets. Existing same-origin, strict JSON, 32 KiB request, DB authorization and contact isolation remain active.

## Commands and observed evidence

All commands ran from the sibling against its own files or unique disposable databases.

| Command/check | Observed result |
| --- | --- |
| npm view @google/genai version engines --json | Version 2.28.0; Node >=20.0.0 |
| npm install --save-exact @google/genai@2.28.0 --no-fund --no-audit | Exit 0 |
| npm run test:security, before and after Stage 5 integration | **13 passed, 0 failed** both times |
| npm run test:matching, final mathematical coverage assertions | **19 passed, 0 failed** |
| npm run test:stage5 | **12 passed, 0 failed**, faked Gemini only |
| npm run typecheck | Exit 0 |
| npm run lint | Exit 0, zero warnings |
| npm run build, latest source changes | Exit 0; actual workspace pages/API routes dynamic |
| Full npm run test:e2e | **26 passed, 0 failed (2.2 minutes)** |
| npm run test:e2e -- tests/stage5.spec.ts, after final readable-filter wording | **3 passed, 0 failed (26.4 seconds)** |
| Generated client scan, latest production build | Three actual configured secret values absent from **26 client JavaScript files**; values never printed |
| Gemini import trace | SDK import/constructor/generateContent only in src/server/ai-gateway.ts |

Pure tests include rules in both directions, all factors, null-versus-zero, normalization, explicit weighted formula, reproducibility and bounds, ranking priorities and narrow parsing. The 12 service tests cover auth and bypass rejection, signed/disjoint/stale pagination, mode separation, settings/audit integrity, PII canaries, both-scope consent, withdrawal during generation, altered model filters, malformed/oversized/injected output, timeout and usable fallback. They use owned OS temporary databases and a test-only injected transport; real SDK dispatch is disabled.

Browser checks used installed Chrome 155.0.8059.39 and the production build with new disposable database/secrets. All 23 Stage 3/4 tests remain passing alongside three Stage 5 tests. Initial new flows exposed test assumptions about source labels/fictional names; selectors now use the actual stored demo ID, and scoring inputs have explicit visible-label names. The settings resize assertion now waits for the confirmation dialog and responsive layout to settle.

The full suite covered all seven routes in light/dark at 1440, 768, 390 and 320 px (56 route/theme/viewport combinations), axe WCAG 2 A/AA and 2.1 AA scans, overflow, external browser requests, theme/storage/reduced motion, keyboard drawer/skip/menu/navigation and retained preview actions. Existing setup/login/logout, profile contacts/preferences/consent/archive/edit/delete and safe demo reset/dashboard totals all passed.

New actual browser flows exercised mobile ranked cards, eight factor rows, missing-evidence/local explanation, optional Gemini's labeled no-provider fallback dialog, narrow NL parsing, unrecognized/PII no-results behavior, a real ten-plus-two disjoint fixture ranking, confirmed weight persistence, stale-cursor rejection, and advanced Profiles filters. Additional axe scans passed for the actual ranking/breakdown, open explanation and weight confirmation dialogs, saved Settings at 320 px and advanced Profiles at 320 px. Mobile screenshots were captured and visually reviewed. Final filter wording presents readable labels rather than raw JSON, with all three affected browser flows passing again after rebuilding.

## Limitations, manual steps and scope

Core matching/search requires no Gemini setup. The final production-mode local server is running on http://127.0.0.1:3100. A read-only anonymous Chrome check confirmed that main one-time setup is still available, Matches redirects to login, the source API returns 401, and the setup token is absent from page source. Create your actual operator account at /setup with the token from this rebuild's private .env.local, then record profiles/facts/preferences and use Matches. No actual operator account or main records/settings were seeded, reset or changed as test fixtures.

Provider setup is optional: privately configure GEMINI_ENABLED, GEMINI_API_KEY and GEMINI_MODEL, then record real evidence for the relevant scopes and explicitly request the optional task. Provider behavior, latency, billing, model quality and configured live service operation remain unverified. All required implemented Stage 5 checks passed; operator first-run credentials and optional provider configuration remain manual steps.

The 365-day age interval, conservative positive-tag lifestyle model, exact label/location matching and small supported query grammar are documented initial product rules. Non-age field verification/expiry, standardized geographic/education vocabularies, larger-dataset indexing and demographic matching policy remain later decisions. No probability/scientific-validity claim is made. Automated accessibility checks do not certify conformance; other browser engines/screen readers/physical devices were not manually tested.

No approval workflow, human rejection schema, five-step business transition, drafting/sending integration, persistent chat/tools, backup/restore, real photo upload, production deployment/PostgreSQL provisioning or legacy migration was implemented. Stage 6 and Prompt 6 generation are awaiting review.

Legacy confirmation: no original project source/config/environment/database write or Git mutation occurred, no legacy customer data or secrets were read/copied, and no destructive database command was run. Final metadata verification matched all **157 legacy files** and the exact initial aggregate hash. The workspace-root lockfile remained **88 bytes**, with its unchanged timestamp 1781758296988.519. Only read-only Git status was used; the sibling remains untracked. No actual environment values were printed or copied, and .env.local has no newly added Gemini variables.
