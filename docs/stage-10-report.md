# Stage 10 QA and stabilization

Reviewed 10 October 2026 in `intern/matchmaker-ai-rebuild`. **Local regression verification passed; production release is blocked.** All 138 Node and 39 browser tests passed with no failures or skips; typecheck, lint, build, schema and migration compatibility checks passed. This checkout implements Stages 3–8. Stage 9 backup/restore, deployment and operational recovery are absent. Stage 10 verifies existing behavior and fixes scoped defects; it does not implement those missing features.

## Scope and baseline

Reviewed AGENTS, README, available Stage 3–8 reports, matching/workflow/email/chat contracts, actual schema and four migration files, authorization/HTTP routes, setup/login, consent/contact services, AI gateway, chat proposals, provider transport/evidence handling, settings and audit writes. Stage 1/2/9 completion reports and a separate completed architecture plan were not found. Earlier supplied architecture context and current code are available; missing documents are not treated as evidence of completed work. Installed Next.js headers and data-security guides were consulted before framework changes.

Before edits, the baseline was:

| Check | Command | Observed result |
| --- | --- | --- |
| Types | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0; zero warnings |
| Node suites | `node --conditions=react-server --import tsx --test tests/security.test.ts tests/matching.test.ts tests/stage5-security.test.ts tests/workflow.test.ts tests/stage6-security.test.ts tests/email.test.ts tests/stage7-security.test.ts tests/stage8-security.test.ts` | 130 passed, 0 failed/skipped; 139.023 seconds |
| Production build | `npm run build` | Exit 0 |
| Schema | `node node_modules/prisma/build/index.js validate --config prisma7.config.ts` | Exit 0 |
| Installed dependency tree | `npm ls --depth=0` | Exit 0; pinned direct versions installed; two existing extraneous optional native packages |
| Browser | `npm run test:e2e` | 37 passed, 0 failed/skipped; 6.3 minutes |
| All dependencies | `npm audit --json` | Exit 1; 9 high affected-package entries, 0 critical |
| Production dependency selection | `npm audit --omit=dev --json` | Exit 1; 4 high affected-package entries, 0 critical |

Browser tests used a unique synthetic database, fresh secrets, installed Chrome and the production build. Providers were disabled. No main or legacy database migration, bootstrap, seed or reset was run.

## Findings and dispositions

### P0 — Critical

No substantiated P0 defect was identified in the reviewed local behavior. This is bounded regression evidence, not an assurance that all vulnerabilities have been excluded.

### P1 — High

**Fixed: inherited browser configuration could target user data.** The old Playwright config skipped fresh database/key allocation whenever `MATCHMAKER_BROWSER_DIRECTORY` existed. A safe config-import probe retained a synthetic inherited `DATABASE_URL` and signing secret. Browser setup then runs migration/bootstrap and tests include destructive synthetic fixture operations, so an accidental inherited main URL could mutate an owned user database. The probe opened no database.

The runner now always allocates a new immediate OS-temp child, database URL, signing/setup/encryption secrets and run identity. Workers reuse only a matching fixture manifest bound to the database/secrets; a foreign override gets a fresh fixture. Preparation independently validates ownership before invoking migration. Guards reject traversal, directory junctions, database symlinks, changed identities/keys/paths and missing/foreign manifests. Provider variables are cleared and test mode enforced. The manifest contains a digest, not secrets. Tests prove a foreign sentinel file and directory remain unchanged and that migration was never invoked on rejection. This is an accidental-environment safety boundary, not a defense against someone controlling the entire local filesystem and process.

**Open release gate: dependency advisories.** Full and production-selected audits fail. Prisma and MySQL packages remain in the production selection through optional peer relationships; `--omit=dev` does not yield a clean runtime audit. Direct dependencies and the lockfile remain pinned. No automatic audit fix or blanket override was applied: npm proposed incompatible Next/Prisma major downgrades, and not every advisory has a compatible patched release.

Four distinct advisories underlie the aggregate entries:

- [braces recursion/stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), via lint/glob tooling; affected installed version 3.0.3, no patched version listed at review.
- [deepmerge-ts recursive merge denial of service](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), via Prisma config; the listed fix moves to major version 8.
- [mysql2 authentication downgrade](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), installed version 3.15.3; affected below 3.22.0.
- [mysql2 compressed-packet resource exhaustion](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), affected through 3.23.0.

Source review found SQLite adapters only, controlled local lint patterns/configuration, and no application MySQL connection or user-controlled Prisma configuration. This is a reachability inference, not proof that the installed packages are harmless. Resolve advisories through supported compatible upstream versions and regression checks, or a documented deployment-specific security assessment, before production release.

**Open production prerequisite: recovery/deployment absent.** There is no consistent database backup export/manifest validation/restore implementation, tested rollback, account recovery, encryption-key rotation or lost-key recovery. There is no configured production host, persistent-volume validation, TLS ingress, health endpoint, public webhook hosting or full audit browser. These require separately scoped implementation and operational verification. They were not added to a stabilization task. Losing the SQLite file or encryption key can lose access to private records.

### P2 — Medium

**Fixed: missing framing, MIME and referrer protections.** Baseline `GET /login` returned none of the four added headers. All paths now return `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Actual HTTP regressions cover public, authenticated, API and missing routes. The CSP protects framing only; no comprehensive script policy or production HSTS/TLS verification is claimed.

**Fixed: schema/migration mismatch on the retained email ledger.** Read-only Prisma diff on a newly migrated browser fixture reported an `EmailDelivery` rebuild. The Stage 7 SQL deliberately uses `ON UPDATE NO ACTION` for its nullable draft reference; the Prisma relation omitted this and defaulted to `CASCADE`. The schema now explicitly matches `NoAction`. Existing SQL/checksums/data are unchanged. A regression migrates a fresh owned fixture and requires an empty schema diff. Generated Prisma client was refreshed. Do not execute the diagnostic rebuild SQL: it would discard handwritten protections and is unnecessary.

**Fixed documentation inaccuracies.** Matching documentation now distinguishes on-demand ranking from persisted workflow snapshots and transient Matches explanations from encrypted persistent chat responses. README exposes the complete Node suite and describes validated browser fixtures and missing Stage 9 honestly. AGENTS permits the explicitly requested QA scope while preserving prior approval/provider/legacy boundaries.

### P3 — Low / maintenance

Retain the documented bounded single-operator architecture: global login budget can deny legitimate attempts under abuse; configure suitable perimeter controls before hosting. Large-data selection limits, fixed chat context, explicit interrupted-task retries, indefinite retained email evidence and manual conversation deletion remain. Bundled demo age-confirmation dates are fixed historical evidence; they will eventually become stale and matching correctly requires refreshed adult evidence. Two extraneous optional packages were reported by `npm ls`; no unverified cleanup was performed. Broader retention/rotation and recovery work needs its own scope. No cosmetic redesign or speculative refactor was undertaken.

## Verification of existing security and workflows

- **Authentication/authorization:** atomic single-account bootstrap latch; password hashing and HTTP-only strict cookies; HTTPS secure-cookie regression; sign-out revocation; no public signup/recovery. Services reauthenticate independently. Anonymous HTTP reads/writes, forged actors/IDs, cross-conversation proposal ownership and stale sessions are rejected. Protected dashboard exposes only authorized counts and sanitized recent actions.
- **HTTP/data boundaries:** exact-origin mutations, strict bounded streamed JSON, fixed route/tool schemas and parameterized ORM/tagged SQL. User content never drives raw SQL, code execution or filesystem paths. The only HTML injection found is the static theme bootstrap. React escapes profile/chat text; browser injection regression observes no execution. Path configuration refuses legacy/synchronized database locations. There are no upload/restore handlers to certify.
- **Consent/AI:** deterministic matching works without credentials. Strict mutual deal-breakers override scores; missing facts stay unknown. Scores/weights/coverage are reproducible heuristics, not scientifically validated probabilities. One server gateway checks current per-customer scopes before relevant dispatch and rechecks afterward. Canonical query or aliased numeric factor DTOs exclude contacts, identities, free-text biographies and transcript. Fakes test withdrawal, invalid output, injection, timeout, sanitization and honest local fallback; no live integration is implied.
- **Encryption/audit:** authenticated AES-256-GCM binds contacts, chat, drafts and approval snapshots to their contexts/key IDs. Wrong/replaced keys fail closed. Ordinary DTOs/audits omit private contacts, message bodies, prompts, secrets and provider errors. Transaction failure regressions preserve atomic decisions, receipts and evidence. Sanitized audit writes exist; a dedicated audit/export product is absent. Retained evidence and encrypted historical facts still need an operator retention policy.
- **Workflow/email:** real browser flows create/edit/delete profiles, manage permission, rank/disclose factors, review/approve/reject/reopen/back-navigate, and save/revise/export local drafts. Node tests verify exact frozen approval, separate explicit send, current revision/consent checks, one durable attempt before network, idempotency, honest UNKNOWN timeout, bounded same-key retry, signature/timestamp/replay/duplicate/out-of-order webhooks and exact reconciliation. Configured browser send dialogs use labeled HTTP UI fixtures; actual provider state semantics use Node fakes. No message was sent externally.
- **Persistent chat:** encrypted reload/rename/archive/delete, local search/explanation, pending/rejected/executed changes, exact review, concurrency/revision/digest checks, atomic execution receipts and idempotent replay are covered. Narrow profile/workflow/draft tools cannot approve matches/emails or dispatch; forged send/approve tools and conversational injection are rejected. Consent withdrawal withholds historical model text. Demo reset is version-bound and preserves REAL records, user/settings/latch and retained evidence.

## Browser and accessibility evidence

Chrome production-build tests cover Dashboard, Profiles, Matches, Workflow, Email, Chat and Settings at 1440, 768, 390 and 320 pixels, light/dark themes: 56 route/theme/viewport combinations. The route matrix asserts zero horizontal overflow, zero axe WCAG 2 A/AA and 2.1 AA violations, no page JavaScript errors and no external browser requests. Additional tests cover collapsed navigation, mobile focus trap/Escape restoration, keyboard review dialogs, visible focus, system theme/storage failure, reduced motion, loading/errors/empty/provider-unavailable states, image fallback and unsaved drafts/messages. Synthetic narrow chat review and email editor screenshots were inspected. No screen-reader certification, manual exhaustive contrast audit or cross-engine certification is claimed.

## Final checks

| Check | Command | Observed result |
| --- | --- | --- |
| Types | `npm run typecheck` | Exit 0 |
| Lint | `npm run lint` | Exit 0; zero warnings |
| Complete Node suite | `npm test` | 138 passed, 0 failed/cancelled/skipped/todo; 97.516 seconds |
| Targeted fixes | `npm run test:stage10` | 8 passed, 0 failed/skipped; includes fresh migration replay and empty schema diff |
| Browser | `npm run test:e2e` | Exit 0; 39 passed, 0 failed/skipped; 9.9 minutes |
| Accessibility | axe assertions within `npm run test:e2e` | All 56 final route/theme/viewport combinations and additional dialog/editor scans passed with zero axe violations/overflow; no page errors/external requests in the route matrix |
| Production build | `npm run build` | Exit 0; all protected/API routes dynamic |
| Schema/client | `node node_modules/prisma/build/index.js validate --config prisma7.config.ts`; `npm run db:generate` | Both exit 0 |
| Migration compatibility | `npm run test:stage10`, internally `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --config prisma7.config.ts` | Exit 0, empty diff against a fresh four-migration synthetic fixture |
| Installed packages/lock | `npm ls --depth=0`; direct dependency maps compared to lockfile root | Exit 0; exact pins consistent, two preexisting optional extraneous packages |
| Full audit | `npm audit --json` | Exit 1; 9 high, 0 critical/other affected-package entries |
| Production-selected audit | `npm audit --omit=dev --json` | Exit 1; 4 high, 0 critical/other affected-package entries |
| Preservation/secrets | `node scripts/qa-preservation.mjs`; `git check-ignore .env.local` | Exit 0; unchanged main counts/migrations/legacy metadata/root lock; all four SQL checksums match; integrity OK; 0 FK violations; 25 client chunks, 0 client source maps, 0 configured-private-value hits in client chunks and 129 selected source/document/config files; environment ignored |

The first stabilization browser run finished with 38 passes/1 failure, no skips, in 10.0 minutes. All preexisting tests and the header regression passed; only the new incorrectly named search-link assertion failed. The complete corrected run passed all 39 tests, not just a targeted retry. The earlier 137-test combined Node run also passed before adding the migration-drift regression; final total is 138. The final browser runner flagged the shell matrix as slow (5.7 minutes); one worker is deliberate for shared fixture state. No assertion or production rate limit was weakened.

An initial stabilization build/typecheck caught two missing test-only `NODE_ENV` fields required by Next's augmented environment type; corrected without changing application code. An initial preservation assertion compared SQLite null-prototype objects with ordinary JSON objects; normalizing row prototypes resolved it while retaining exact-value checks. The first new search browser assertion incorrectly expected a name-based link; it now verifies the exact stored profile URL and result count, preserving generic privacy labels. These iteration failures are recorded rather than presented as passing runs.

Ignored artifacts include full/production audit JSON, browser report/traces/screenshots and before/after metadata/count snapshots in `test-results/`. `scripts/qa-preservation.mjs` is a read-only comparison against this run's ignored baseline; it is not a backup/restore tool or a general production diagnostic.

## Database and legacy preservation

Main database remains outside OneDrive, with every business/account/chat table empty, one permanent SystemState row, four finished migrations, `integrity_check = ok` and zero foreign-key violations. All four source SQL SHA-256 values match recorded migrations. No source SQL migration was edited and no main migration/reset was run. Fresh migration replay is limited to owned temporary databases. The database remains SQLite; PostgreSQL/serverless/ephemeral-volume compatibility is not claimed.

Restored the production-mode **local** preview with `npm run start` at `http://127.0.0.1:3100` (ready in 1.654 seconds). Read-only anonymous checks observed `/setup` 200 with setup ready, `/chat` requiring login, `/api/workspace/chat` 401 with `no-store`, and active framing protection. No main operator account was created. The preservation/secret check was repeated afterward and again passed unchanged counts/migrations/legacy metadata, SQLite integrity and zero configured-secret hits.

Legacy preservation uses metadata only: 157 nondependency/non-Git/non-Next-cache files, unchanged sorted path/size/mtime digest `361cfd10c7cdd093f0db7c0441b2fc192dd0869d15179927f12924266415d369`. Root lockfile remains 88 bytes, mtime 1781758296988.519. No legacy customer records, secrets or contents were read/imported. No Git write, staging, commit, reset or branch operation occurred; preexisting changes were left alone. Legacy source, database, environment files and Git state were not modified.

## Before introducing real customer data

1. Resolve or explicitly assess remaining dependency advisories on the chosen release versions and repeat all checks.
2. Implement and rehearse consistent encrypted backup/export, manifest/integrity validation, restore, migration rollback and account/key recovery on synthetic data. Keep database and original encryption key in separately protected durable storage; changing a key does not rotate ciphertext. Do not copy an active SQLite file and assume it is a consistent backup.
3. Choose a persistent SQLite-compatible host/volume with restrictive access, single-instance assumptions and verified restarts. Configure HTTPS, trusted origin, ingress abuse controls, monitoring/health diagnostics and a tested recovery/runbook. No deployment commands or production credentials were exercised here.
4. Keep environment files ignored/server-only; replace placeholders with fresh operator-owned configuration. Bootstrap the real operator privately. Confirm actual customer consent provenance/scope and retention/deletion policies before storing private data.
5. If Gemini is needed, choose a supported model and independently verify authorized minimized requests, failure behavior and consent withdrawal using synthetic data first. Local matching/search needs no provider.
6. If sending is needed, independently verify Resend credentials, domain, send/retrieve permissions, HTTPS signed webhook reachability and exact-message approval/separate dispatch. Rehearse ambiguous timeout/reconciliation and delivery evidence with authorized test recipients before real introductions.
7. Perform manual keyboard/screen-reader checks and target-browser checks for the operator's environment; review retention of ignored synthetic traces and authentication artifacts.

**Not live-verified:** Gemini, Resend delivery/retrieval/public webhooks, production storage/database, HTTPS hosting, deployment, production backup/restore/recovery, screen readers and browser engines beyond installed Chrome. No external provider calls or production connection/deployment occurred. Remaining release blockers are dependency advisories and missing verified recovery/deployment/operational prerequisites.
