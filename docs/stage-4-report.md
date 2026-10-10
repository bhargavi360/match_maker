# Stage 4 completion report

Implemented on 9 October 2026 in `Data crew/intern/matchmaker-ai-rebuild`, the independent sibling of the legacy dashboard. This stage adds single-account setup/login, authorized local profiles, encrypted contacts, structured preferences, scoped consent, real dashboard queries, demo isolation, and sanitized audit events. The Stage 3 visual system and disconnected integration previews are retained. Stage 5 has not started.

## Files and purpose

Paths below are relative to this rebuild.

| Created or changed | Purpose |
| --- | --- |
| `package.json`, `package-lock.json` | Exact Stage 4 dependency pins, ESM support, configure/migrate/generate/security scripts; existing Next/React versions preserved |
| `.env.example`, `.gitignore` | Placeholder configuration; ignore actual environment values, database artifacts, and generated Prisma client |
| `prisma/schema.prisma`, `prisma7.config.ts` | Prisma 7 configuration, SQLite provider, Stage 4 model set and generated-client destination |
| `prisma/migrations/sqlite/migration_lock.toml`, `prisma/migrations/sqlite/202610090001_stage4/migration.sql` | Initial SQLite migration with reviewed constraints, foreign keys, permanent-latch/classification/consent triggers and transactional session audits |
| `scripts/local-configure.mjs`, `scripts/database.ts` | Fresh secret generation without output; guarded migration of the owned database outside OneDrive |
| `src/server/config.ts`, `db.ts`, `auth.ts`, `bootstrap.ts`, `security.ts`, `errors.ts`, `page-data.ts` | Validated configuration, server-only DB/auth boundary, race-safe bootstrap, shared limits, bounded requests, safe responses and authenticated page loading |
| `src/server/profiles.ts`, `contacts.ts`, `dashboard.ts` | Transactional profile/contact/preference/consent/demo operations, authenticated encryption, authorized actual summaries |
| `src/domain/types.ts`, `validation.ts` | Explicit DTOs and strict shared validation, enumerated scoring inputs, validated initial weights |
| `src/app/api/bootstrap/route.ts`, `api/auth/[...path]/route.ts`, `api/workspace/[...path]/route.ts` | Explicit protected HTTP operations; signup/recovery/provider routes are not exposed |
| `src/app/login/page.tsx`, `setup/page.tsx` | Internal login and token-gated first-run setup in the existing design |
| `src/app/(workspace)/layout.tsx` | Authenticated shell. Seven Stage 3 route directories moved under this group without changing public URLs |
| `src/app/(workspace)/dashboard/page.tsx`, `profiles/page.tsx`, `profiles/new/page.tsx`, `profiles/[id]/page.tsx`, `profiles/[id]/edit/page.tsx` | Actual authorized dashboard/list/detail/create/edit pages |
| `src/components/api.ts`, `auth-form.tsx`, `dashboard-live.tsx`, `profiles-live.tsx`, `profile-form.tsx`, `profile-detail.tsx`, `demo-controls.tsx` | Validated forms, saving/error/empty states, bounded filters, separate contact editor, preferences/consent/status controls, confirmed deletion/reset |
| `src/components/shell.tsx`, `settings.tsx`, `profiles.tsx`, `src/app/layout.tsx`, `loading.tsx`, `error.tsx`, `globals.css` | Signed-in identity/logout, honest live/preview notices, settings demo controls, actual loading/errors, responsive forms and tablet toolbar fix |
| `tests/security.test.ts`, `stage4.spec.ts`, `global-setup.ts`, `scripts/browser-prepare.ts`, `playwright.config.ts`, `tests/shell.spec.ts` | Disposable database tests; real browser setup/login/profile/reset flows; retained Stage 3 navigation/theme/preview coverage |
| `README.md`, `AGENTS.md`, `docs/stage-4-report.md` | Local operator instructions, Stage 4 boundaries and this evidence report |

The actual ignored `.env.local` was generated solely for this rebuild. Generated Prisma output is reproducible and ignored. Existing theme tokens, local synthetic portraits/provenance, historical Stage 3 report, and disconnected Matches/Workflow/Email/Chat components are retained.

## Versions and compatibility decision

Observed Node.js: **24.14.0**; npm: **11.9.0**. Existing framework pins remain Next.js **16.4.0**, React/React DOM **19.3.0**, TypeScript **5.9.3**.

| Dependency | Exact installed version |
| --- | --- |
| Better Auth | 1.7.7 |
| Better Auth Prisma adapter, included through `better-auth/adapters/prisma` | `@better-auth/prisma-adapter` 1.7.7 |
| Prisma CLI / generated-client runtime | `prisma` / `@prisma/client` 7.10.0 |
| SQLite driver adapter | `@prisma/adapter-better-sqlite3` 7.10.0 |
| SQLite native driver, transitive | `better-sqlite3` 12.11.1 |
| Zod | 4.6.5 |
| Server-only boundary marker | `server-only` 0.0.1 |
| Next environment loader | `@next/env` 16.4.0 |
| TypeScript script runner | `tsx` 4.23.15 |
| Playwright / axe | 1.64.0 / 4.13.0 |

Before schema creation, official [Better Auth Prisma guidance](https://better-auth.com/docs/adapters/prisma), [password authentication](https://better-auth.com/docs/authentication/email-password), [session management](https://better-auth.com/docs/concepts/session-management), and [Prisma 7 system requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements) / [SQLite setup](https://www.prisma.io/docs/v7/prisma-orm/quickstart/sqlite) were reviewed, along with installed package peer ranges and installed Next.js authentication/routing/cookie documentation. These checks supported using the recommended libraries without upgrading the framework or introducing a second ORM/auth system. PostgreSQL hosting and credentials were not added.

## Schema and commands actually executed

The fresh database is `C:\Users\kandula bhargavi\AppData\Local\MatchmakerAIRebuild\matchmaker.sqlite`. An application ownership marker is required beside it. Overrides require an absolute `file:` URL ending in `matchmaker.sqlite`; OneDrive and legacy-project paths are refused. No preexisting database was adopted.

Models: `SystemState`, `User`, `Account`, `Session`, library-required `Verification`, `RateLimitBucket`, `AppSettings`, `Profile`, `ProfileContact`, `PartnerPreference`, `ProfileConsent`, `AuditEvent`. No assessment, delivery, persistent chat, or backup models were added.

Database rules include singleton system/settings IDs, the unique account slot fixed at 1, unique credential/provider pairs and demo keys, one contact/preference per profile, unique profile/scope consent, valid states, paired age/confirmation date, positive revisions, foreign-key cascades, immutable REAL/DEMO classification, matching synthetic-consent classification, and a bootstrap latch that cannot be reopened or deleted. Audit history deliberately survives profile deletion without retaining private values.

Commands executed from the rebuild:

```powershell
npm install --save-exact better-auth@1.7.7 @prisma/client@7.10.0 @prisma/adapter-better-sqlite3@7.10.0 zod server-only --no-fund --no-audit
npm install --save-dev --save-exact prisma@7.10.0 tsx@4.23.15 --no-fund --no-audit
npm install --save-exact @next/env@16.4.0 --no-fund --no-audit
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --config prisma7.config.ts
node node_modules/prisma/build/index.js generate --config prisma7.config.ts
npm run local:configure
npm run db:migrate
```

The generated SQL was reviewed and augmented with constraints/triggers before applying `202610090001_stage4`. Initial Windows migration of a nonexistent SQLite file failed; the guarded script now creates an empty file only for the verified owned destination, after which migrate deploy succeeded. No migration reset was used. Browser/security fixtures run the same migration against unique owned OS temporary directories. SQLite history must not be replayed on PostgreSQL; a future provider needs separate schema/adapter/history.

## Bootstrap, sessions and authorization evidence

Bootstrap checks the configured high-entropy token with a length gate and timing-safe comparison, hashes using Better Auth's maintained scrypt implementation, then claims the false latch and creates user, credential, settings and audits in one transaction. Three concurrent attempts in the security test yielded exactly one success and exactly one user/credential. An injected account-insert failure rolled back the user, settings, audit and latch. Direct second-account creation and attempts to reopen/delete the latch were rejected. After deleting the fixture account, setup still remained closed.

Only email sign-in and sign-out are allowed through the auth HTTP handler; ordinary signup is disabled and its URL returns 404. Login errors are generic. Session tokens are delivered through HttpOnly SameSite=Strict cookies, never login JSON or browser storage. HTTPS configuration was tested for Secure cookies; HTTP loopback is the documented local exception. Sessions are database-backed, expire after 12 hours, update after 30 minutes, request browser-session cookies, and bypass cookie caching. Logout revokes the database session. IP/user-agent fields remain null. Every protected service independently checks the current session, single-account slot, completed latch and maintenance flag.

Bootstrap/login use separate global atomic SQLite buckets (5/10 attempts per 15 minutes). Concurrent increments from two independent Prisma clients proved shared state, rejection above the maximum and expiry reset. Mutations require exact configured Origin, reject cross-site fetch metadata, and accept only strict validated JSON up to 32 KiB, including streamed bodies with absent or misleading length headers. Unknown failures produce safe operator-facing responses.

## Profiles, contacts, permissions and demo isolation

- Authorized list/search uses only non-contact facts, structured kind/status/city filters and 20-row pages. Unknown age/location/etc. stays unknown. No birth date, gender or orientation is inferred. Adult reported ages are paired with real nonfuture confirmation dates.
- All profile, contact, preference, consent and status writes claim a global profile revision in the transaction. Stale revisions fail instead of overwriting a newer change. New profiles are server-classified REAL; ordinary edits cannot change classification.
- Email/phone values are stored separately as AES-256-GCM ciphertext with a random nonce, authenticated profile/key-ID binding and a version identifier. Explicit authorized contact opening is audited. List/detail/dashboard/audit DTOs omit contact values. Missing/invalid keys, tampered ciphertext and wrong profile/key binding fail closed.
- Preferences contain optional age bounds, locations, shared values, allowed goals/lifestyle and explicit deal-breakers. Missing preferences are unknown.
- SEARCH, MATCHING, EXPLANATION, EMAIL_DRAFT and CHAT remain independent. Missing consent is UNSET. Grant/withdrawal records include policy version, internal evidence reference, time and revisions. A withdrawal immediately makes the authorization helper reject the relevant scope. Demo provenance is synthetic. Recording permission makes no AI call.
- Archive retains dependencies; reactivation restores active status. Permanent deletion requires `DELETE <current display name>`, checks revision, cascades contacts/preferences/consents and retains sanitized audit history.
- Optional seeding upserts four fictional adults through stable unique demo keys, with no contacts or consent grants. Repeating it creates no duplicates. Reset first presents dependent counts and a snapshot token, then requires `RESET DEMO`; changed data invalidates the token. The transaction deletes only DEMO profiles/dependents. Security tests compared REAL rows, account, latch and settings before/after reset and proved preservation.
- Dashboard queries actual active/REAL/DEMO/recent/archived/incomplete counts, independent scope consent summaries, and recent sanitized activity. Empty fresh data renders without seeding. Unimplemented match/email/workflow statistics are not invented.

Audit writes accompany mutations transactionally. SQLite session triggers record successful login/revocation in the corresponding database transaction; failed logins log no supplied email, password, body or session token. Profile audits record changed field names, not field values.

## Observed checks and browser coverage

- `npm run typecheck`: passed, no TypeScript errors.
- `npm run lint`: passed with `--max-warnings=0`.
- `npm run build`: passed after the final live/preview copy and metadata updates; the actual protected pages/API routes are dynamic.
- `npm run test:security`: **13 passed, 0 failed**, using disposable synthetic fixtures.
- Final `npm run test:e2e`: **23 passed, 0 failed (2.1 minutes)**, including the retained Stage 3 suite and four Stage 4 browser tests.
- Client artifact scan: all three configured secret values were absent from 24 generated client JavaScript files; values were never printed.

Browser checks use installed Google Chrome 155.0.8059.39 with a production build, a fresh disposable database and fresh test-only secrets. Global setup performs actual token-based first setup and login through the UI, verifies the setup token is absent from page source, verifies an empty dashboard count of zero, then explicitly seeds synthetic browser fixtures. Test account/session data never touches the main or legacy database.

Retained checks cover all seven shell routes in light/dark at 1440, 768, 390 and 320 px (56 route/theme/viewport combinations), axe WCAG 2 A/AA and 2.1 AA checks, overflow, client errors and external browser requests. Keyboard checks cover skip link, active navigation, sidebar collapse, account menu and the mobile drawer's forward/reverse focus trap, Escape and focus restoration. Theme tests cover OS preferences, reload, unavailable storage and reduced motion. Preview filters/loading/error/portrait fallback and inactive integration controls remain covered.

Stage 4 browser flows cover setup closure, anonymous endpoint rejection, forged Origin and body bounds, absent signup, login failure and logout revocation, mobile profile create/edit/contact/preferences/one-scope consent/archive/reactivate/confirmed delete, and counted demo reset preserving a REAL fixture with matching dashboard totals. The final profile accessibility scan explicitly waits for Next.js's streamed page title; profile fixtures are cleaned in `finally` blocks so a failed assertion cannot contaminate subsequent totals.

Ignored `test-results/screenshots/` contains setup, empty dashboard, mobile profile detail and light/dark dashboard/profiles/matches evidence. Screenshots are local artifacts, not production customer data. Automated axe results do not certify full accessibility; other browsers and assistive technologies were not manually tested.

The final dark desktop dashboard and mobile profile-detail screenshots were visually reviewed after the live/preview notice correction. After starting the main local server, an anonymous Chrome session verified that `/setup` is available, `/profiles` redirects to `/login`, and the profile API rejects the anonymous request with 401. This read-only check created no main account or profiles.

## Operator steps and limits

The main rebuild has fresh local configuration and its migrated empty database. **The actual matchmaker account is not yet created**, and no main demo records were seeded. Start with `/setup`, privately read `MATCHMAKER_SETUP_TOKEN` from this rebuild's ignored `.env.local`, and select your own name, email and passphrase. Then sign in. Setup permanently closes after success; there is no public recovery or verification-email flow.

The application remains local on `127.0.0.1:3100`. Losing the contact key makes ciphertext unrecoverable; key rotation/multiple-key recovery is not implemented. OS account access and inherited Windows file permissions protect local files; this stage does not add disk encryption or deployment hardening. Global login/bootstrap buckets can temporarily block the operator after repeated attempts. Demographic matching policy, real photo upload and future scoring/consent policy approval remain later-stage decisions; neutral optional facts are supported now.

No production PostgreSQL provisioning/deployment, Gemini, live AI, matching logic, actual workflow approvals, email delivery, persistent AI chat, recovery, or backup/restore was performed. There are no outstanding implementation blockers for the implemented Stage 4 paths; choosing the real operator credentials is the required manual first-run step.

## Legacy preservation

No legacy source/configuration/environment/database write or Git command/mutation was performed. No legacy customer rows or secret values were read or copied. The read-only legacy file metadata snapshot (excluding dependency/generated Next cache directories) remained **157 files**, with unchanged SHA-256 aggregate `940be182690330728c93566c3015dc92aabbf2855a14fac2976f846e30212fbf`. The workspace-root `package-lock.json` metadata also remained unchanged. All application/configuration/migration writes belong to this sibling or its newly owned external/temporary data directories.

Stop condition: Stage 4 only. Await review before any Stage 5 work or Prompt 5 generation.
