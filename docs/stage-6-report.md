# Stage 6 completion evidence

Implemented on 9 October 2026 in **Data crew/intern/matchmaker-ai-rebuild**. This stage adds a persistent five-step human workflow, exact reviewed assessment snapshots, explicit approval/rejection/reopening, revision-safe back-navigation, stale evidence invalidation and sanitized transactional audits. Email drafting and delivery remain nonoperational placeholders. Stage 7 is not implemented.

## Preflight and preservation

Read AGENTS, README, Stage 3/4/5 reports, existing schema/initial SQL, profile/contact/preference/consent/delete/reset services, auth, scoring/ranking/AI boundaries, routes, shared controls and existing tests before workflow changes. Followed installed Next.js route-handler and data-security guidance: server-only data access, independent operation authorization, minimal DTOs, strict validation and no rendering mutations.

Observed existing pins: Node 24.14.0, npm 11.9.0, Next 16.4.0, React/React DOM 19.3.0, TypeScript 5.9.3, Better Auth 1.7.7, Prisma/client/SQLite adapter 7.10.0, Zod 4.6.5, Playwright 1.64.0, axe 4.13.0. No dependency was added or upgraded. The rebuild package scripts gained two tests; dependency lockfiles are preserved.

Before core changes, the three existing Node suites passed **13 + 19 + 12 = 44 tests**, and all **26 existing browser tests passed (2.0 minutes)**. Stopped only this task's previously owned loopback server. Tests exclusively use newly owned temporary databases and synthetic records. The main ownership marker remains `matchmaker-ai-rebuild-stage4`; its legacy name identifies the original owner, not the current schema stage.

The smallest migration was proposed before creating it: three new tables, immutable pair evidence, append-only decisions and one active context per source. Existing tables, customer records, settings and secrets are not replaced. Only guarded migrate deploy was run; no database reset, broad deletion, or migration of legacy records occurred.

## Files and purpose

All paths are relative to the independent rebuild.

| Added/changed | Purpose |
| --- | --- |
| prisma/schema.prisma | Three workflow models and explicit profile/snapshot/history relations |
| prisma/migrations/sqlite/202610090002_stage6/migration.sql | Additive SQLite tables, indexes, active-source uniqueness, CHECK constraints, exact review/pair binding and immutable-history triggers |
| src/domain/workflow.ts | Pure state model, transition validation, strict command schemas, DTOs and exact assessment comparison |
| src/server/workflows.ts | Independently authorized bounded reads, selection/review/decisions/reopen/archive, transactional current assessment checks, revision CAS and sanitized audits |
| src/server/errors.ts | Optional safe typed error categories, including authorization errors |
| src/server/profiles.ts | Include workflow dependencies in confirmed deletion/reset audits, demo counts and reset-token revisions |
| src/domain/matching.ts | Export the existing adult-age freshness helper without changing scoring rules |
| src/app/api/workspace/[...path]/route.ts | Explicit allowlisted workflow GET/POST/PATCH operations using the retained Origin/body/auth boundary |
| src/app/(workspace)/workflow/page.tsx | Authorized persisted workflow/list/source loading; stable URL selection |
| src/components/workflow-live.tsx | Five steps, bundled/fallback summaries, candidate ranking, exact review checkbox, confirmed decisions, safe navigation, stale/empty/error/loading states, history and honest placeholders |
| src/components/matches-live.tsx | Share the existing factor/explanation component with workflows |
| src/components/tabs.tsx | Accessible named tablists with unavailable-step handling; original preview behavior retained |
| src/components/shell.tsx, src/app/globals.css | Live workflow notices and token-based responsive workflow layouts |
| src/components/demo-controls.tsx, profile-detail.tsx | Review the workflow history consequences of demo reset/permanent profile deletion |
| tests/workflow.test.ts | Eight pure transition/version/eligibility tests |
| tests/stage6-security.test.ts | Fourteen owned-database authorization, integrity, concurrency, stale evidence, audit and deletion/reset tests |
| tests/stage6.spec.ts | Four real browser human review/decision/reopen/stale/concurrent-tab flows |
| tests/shell.spec.ts | Retained historical examples scoped separately from saved workflows; current live notice |
| package.json | test:workflow and test:stage6 commands |
| AGENTS.md, README.md, docs/workflow-state-machine.md, docs/stage-6-report.md | Current boundaries, operator steps, complete state/API/deletion contract and observed delivery evidence |

Historical reports, portrait assets/provenance, theme tokens, Stage 5 matching/search/weights and the sole AI gateway are retained. Generated Prisma output is ignored and reproducible with db:generate. No provider/email/chat/backup models or SDKs were added.

## Models and migration

Workflow stores stable ID, source/current candidate FKs, initial source revision, selected snapshot, step/status, explicit reviewer/time, optimistic revision and creation/update/archive timestamps. AssessmentSnapshot contains exact pair IDs and compact deterministic assessment JSON: score, completeness, eight factors/coverage/missing evidence, eligibility, algorithm/weight/profile/preference versions, pair-bound hash and time. It contains no full profile, contact, biography, photo or AI text. MatchDecision records exact pair/snapshot, APPROVED/REJECTED/REOPENED, server-derived actor, reviewed-at evidence, event sequence and time. The latest history event supplies the current decision; profiles carry no approval flag.

SQLite enforces no self-match, valid state/step/review fields, REAL/DEMO pair isolation, exact workflow/snapshot/decision/review binding, one non-archived context per source, positive revisions, immutable snapshots and append-only decisions. Indexes cover status/time, source/pair, candidate, snapshot pair and decision sequence/pair. Foreign keys are explicit.

Archive preserves history. Confirmed permanent profile deletion cascades workflows for which the profile is the current source or candidate, then their snapshots/decisions. This is the deliberate privacy-deletion exception to append-only history; direct snapshot/event deletion is refused while the parent exists. Audit history remains sanitized and independent. Demo reset counts/token-binds demo workflow revisions and deletes only demo dependencies, preserving REAL workflows and decisions. Actor and historical pair identifiers are immutable metadata without mutable user/profile FKs, preventing historical rewrites/cascades from operator deletion or a later source switch.

Commands actually executed:

```powershell
npm run db:generate
npm run db:migrate
```

Generation passed. The guarded main migration applied **202610090002_stage6** only to `C:\Users\kandula bhargavi\AppData\Local\MatchmakerAIRebuild\matchmaker.sqlite`, after verifying ownership outside OneDrive/legacy. Read-only inspection confirmed both Stage 4/6 migrations applied, and **0 users, 0 profiles, 0 workflows, 0 snapshots, 0 decisions** in the main database. No test operator or demo/customer records were created there. Fresh temporary test databases successfully replayed both migrations.

## Human decisions and stale state

See [the full transition/API contract](workflow-state-machine.md). IN_PROGRESS permits source/candidate selection and explicit review. Only separate, confirmed human approval enters MATCH_APPROVED/step 4. Rejection enters MATCH_REJECTED/step 3 and blocks drafting. Reopen appends history, clears review/snapshot and moves to step 2; refresh and a new reading are mandatory. ARCHIVED is read-only. No completion state is claimed.

Each selection recomputes current same-classification eligibility and verifies its expected pair-bound stamp. Review/approval/rejection/navigation compare the saved assessment with current source/candidate facts, both preferences, weights/version and algorithm, within the write transaction. Inactive, self, mixed, unresolved and hard-rule-violating pairs fail closed. Global profile revisions conservatively invalidate even non-scoring changes; time-dependent age eligibility is recalculated.

GET/page loading projects a stale REVIEW_REQUIRED response without recording review, decisions or workflow audit writes. A stale consequential mutation commits invalidation, clears review, increments revision and logs WORKFLOW_STALE once before returning a safe conflict. Stale back-navigation to source/candidate selection is allowed; draft/delivery remain locked. Historical approval cannot unlock previews after facts change. Approval is never retried automatically.

All services independently authenticate. Strict schemas reject supplied actors, scores, eligibility, records or arbitrary version claims. Expected workflow revision prevents silent overwrites. Exact snapshot/workflow/pair binding prevents forged references. Business mutations, immutable snapshot/decision insertions and audits are one transaction. Concurrent approval and approval-versus-rejection tests established exactly one decision; repeat/stale requests conflict safely. An injected audit failure proved full rollback of the decision and workflow write.

Optional explanations reuse Stage 5's transient, consent-checked gateway. Neither model output nor page/navigation can create approval. Step 4 explicitly says no email has been generated and requires the next stage for real drafts. Step 5 disables sending/export and states no completion or delivery occurred.

## Audit coverage

WORKFLOW_CREATED, WORKFLOW_SOURCE_SELECTED, WORKFLOW_CANDIDATE_SELECTED/refresh, WORKFLOW_REVIEWED, MATCH_APPROVED, MATCH_REJECTED, MATCH_REOPENED, WORKFLOW_STALE, WORKFLOW_STEP_CHANGED and WORKFLOW_ARCHIVED. Metadata includes workflow/pair/snapshot identifiers, expected revision lineage, applicable algorithm/weight/profile/preference versions and bounded outcome categories. No contacts, complete profile values, unrestricted rationale, AI prompts or model output are logged. Profile deletion/demo reset audits include workflow dependency categories. Tests verified private-contact/biography canaries remain absent from snapshots and audits.

## Observed tests and browser evidence

| Command | Observed result |
| --- | --- |
| npm run test:security | **13 passed, 0 failed**, before and after workflow integration |
| npm run test:matching | **19 passed, 0 failed**, before and after |
| npm run test:stage5 | **12 passed, 0 failed**, faked AI only, before and after |
| npm run test:workflow | **8 passed, 0 failed** |
| npm run test:stage6 | **14 passed, 0 failed** |
| npm run typecheck | Exit 0 |
| npm run lint | Exit 0, zero warnings |
| npm run build | Exit 0; protected workflow/API pages remain dynamic |
| Full npm run test:e2e | **30 passed, 0 failed (2.4 minutes)** on the final build, including focus after approval; all Stage 3–5 tests retained. The prior full run also passed all 30 (2.6 minutes) |
| Production client artifact scan | Three configured secrets absent from **25 client JavaScript files**, values never printed |

Total Node coverage: **66 passing tests**. Tests cover pure transitions, valid/back navigation, explicit review, rejection lock, fresh reopen, stale profile/preference/weight/algorithm evidence, unknown strict facts, self/mixed pairs, actor/score tampering, forged snapshot IDs/database binding, all independent auth boundaries, GET safety, stale tabs, decision races, immutable history, audit rollback and demo/privacy-deletion isolation.

Browser verification uses installed Chrome with a production build and a newly owned disposable database. The retained shell matrix checks all seven routes in light/dark at 1440, 768, 390 and 320 px (56 combinations), WCAG 2 A/AA and 2.1 AA axe scans, overflow, page errors and external requests. Existing keyboard drawer/skip/account/navigation, theme/storage/reduced motion, original examples, setup/login/logout, profile/contact/preference/consent/archive/delete/demo reset, local ranking/search and weights all passed.

Four Stage 6 browser flows create/select actual synthetic profiles, inspect eight factors/completeness, explicitly record review, cancel/confirm human approval, reload persisted decisions, navigate by keyboard, inspect disabled Step 4/5 controls, reject/reopen/refresh with a new snapshot, block stale approval and require renewed review, and demonstrate two-tab revision conflicts plus missing GET approval routes. Additional axe/overflow checks cover current reviewed evidence and dialogs at 390 px, rejection/reopen at dark 320 px, stale/refresh at 768 px. Local screenshots of the reviewed mobile and reopened dark workflow were visually inspected.

Initial new tests exposed fixture pagination, hidden-example selector counts and Next's extra route-announcer alert. Fixtures now follow signed pages, and assertions identify live workflow content. The actual transition and security assertions pass. Focus after saved decisions is moved to the server-confirmed feedback when the initiating control disappears; keyboard step navigation keeps its tab focus. No live Gemini or email provider was called.

## Limits and operator handoff

The production-mode local server is running at http://127.0.0.1:3100. A final read-only anonymous Chrome check confirmed setup remains available, the token is absent from page source, Workflow redirects to login and the workflow API returns 401. The main operator account is still uncreated. Use `/setup` with the token privately read from this rebuild's existing `.env.local`, choose your own credentials, then create profiles or deliberately seed synthetic demos in Settings. No credential choice or provider provisioning was performed for you. The local application binds only to `127.0.0.1:3100`.

Workflow lists are bounded to 20/page; detail shows latest 100 decision events while retaining earlier events. Stage 5 source/classification limits and conservative exact-label/age freshness policies remain. No unrestricted rationale entry, full decision-history browser pagination, scientific validity certification, other browser-engine/screen-reader/physical-device testing, photo upload or production provisioning is claimed. Automated accessibility results are evidence, not certification. Live optional Gemini remains unconfigured/unverified.

Stage 7 must implement real draft persistence, current EMAIL_DRAFT consent and explicit draft/delivery authorization. Stage 6 approval cannot authorize delivery. No Resend, real draft/send operation, webhook, chat/tool mutation, backup/restore, legacy data migration, production deployment or Prompt 7 generation was implemented.

## Legacy confirmation and stop

No original project source, database, configuration, environment file or Git state was written. No legacy customer rows or secret values were read/copied. Read-only legacy metadata still matches **157 files**, aggregate SHA-256 **940be182690330728c93566c3015dc92aabbf2855a14fac2976f846e30212fbf**, excluding dependency/generated Next caches. Workspace-root package-lock.json remains **88 bytes**, unchanged timestamp **1781758296988.519**. Existing user Git changes were preserved; only read-only status was used, no commit/index/branch/deployment action occurred. The rebuild's existing environment values were not edited or printed.

Stop condition: **Stage 6 only. Await user review before Stage 7.**
