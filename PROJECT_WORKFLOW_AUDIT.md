# Matchmaker AI Project Workflow Audit

**Audit date:** 2026-10-10  
**Scope:** Source and schema review, read-only metadata inspection of the configured local SQLite database for legacy ownership and backup validation, plus the checks listed under Verification. No personal profile fields or secret values were queried or included.

## Executive summary

This is a Next.js App Router application backed by a local SQLite database and Prisma. Better Auth handles credential verification and database-backed sessions. Authenticated pages and data operations enforce a server-side session check. The UI supports public account registration after one-time operator bootstrap.

The application now models an independent private workspace for each registered account. `User.id` owns profile roots and matching settings; workflows, email records, and other dependent rows derive their owner through parent profile/workflow relations. Chat continues to use its existing `ownerId` relation. Services filter by the authenticated user and SQLite triggers prevent cross-owner workflow, snapshot, draft, and chat context bindings. The additive ownership migration passes disposable database replay; it has **not been applied to the configured local database yet** because a process is actively listening on port 3100 and the production build hits a locked `.next` output file. The configured database remains at its pre-migration schema until a safe maintenance window.

The requested purple notice was emitted once by the shared authenticated shell and therefore appeared on every authenticated route. It has been removed along with its styles. The header, sidebar, page content, footer, and behavior are unchanged.

## 1. Architecture and technology

- **Web:** Next.js 16 App Router, React 19, TypeScript 5.9, custom semantic CSS/theme tokens, and client components for interactive forms and live workspace controls.
- **Authentication:** Better Auth 1.7 with its Prisma adapter; credential passwords are hashed with Better Auth's scrypt implementation.
- **Persistence:** Prisma 7 with SQLite through `@prisma/adapter-better-sqlite3`. Migrations live in `prisma/migrations/sqlite/` and use an ownership-guarded deploy script.
- **Validation and domain:** Zod strict schemas validate requests; pure domain modules implement matching calculations, search parsing, workflow transitions, and email state rules.
- **Optional integrations:** Gemini through a server-only AI gateway and Resend through server-only email transport and signed webhook verification.
- **No middleware/proxy or server actions were found** under `src`. Authenticated route protection is implemented in the workspace layout, API route handlers, and independently in server service functions.

## 2. Login-to-dashboard journey

1. `/` renders a marketing landing page with a sign-in form and links to `/login` and `/register`. The landing page includes bundled fictional portraits and promotional copy; those are static local assets, not user records.
2. `/register` collects name, email, password, and confirmation, then POSTs JSON to `/api/auth/sign-up/email`. The route checks same-origin, applies a database-backed registration limit, validates input, hashes the password, checks duplicate email, and transactionally inserts the user, credential, baseline settings if absent, and an audit event. It redirects the new user to sign in; it does not sign them in automatically.
3. `/login` submits credentials to `/api/auth/sign-in/email`. The route applies rate limiting and delegates credential verification/session creation to Better Auth. Errors are intentionally generic. A successful response sets HttpOnly SameSite cookies (Secure under HTTPS); the UI navigates to `/dashboard`.
4. The shared `(workspace)` layout calls `requireMatchmaker()` from request headers. That resolves a live database session, confirms the user still exists and initial bootstrap is complete, and enforces maintenance mode. Anonymous page data calls are redirected to `/login`; the workspace APIs return authorization errors.
5. The account menu posts to `/api/auth/sign-out`, which delegates session revocation to Better Auth and returns the cookie headers. Session records expire after 12 hours, refresh activity after 30 minutes, and cookie caching is disabled.

The setup restriction is one-time workspace initialization, not a per-account invitation: `/setup` and `POST /api/bootstrap` require the operator-configured setup token and the permanent bootstrap latch closes after initialization. Normal registration requires the latch to be complete but does not accept or require that token. Before bootstrap, new-user registration returns an initialization error; this is an operational prerequisite that should be planned for when deploying a fresh database.

## 3. Implemented routes and features

### Public pages

| Route | Observed behavior |
|---|---|
| `/` | Static landing content, local portraits, and sign-in panel. |
| `/login` | Credential sign-in; links to account creation. Shows success notice after registration. |
| `/register` | Public self-service account form; successful creation redirects to login. |
| `/setup` | One-time operator initialization UI; closed after successful bootstrap. |

### Authenticated pages

All routes below use the shared authenticated workspace layout; their server data loaders and service operations also authenticate.

| Route | Implemented behavior |
|---|---|
| `/dashboard` | Counts active real/demo profiles, recent/archived/incomplete records, consent totals, and recent audit activity. |
| `/profiles` | Paged profile list, filters/search, and create entry point. |
| `/profiles/new` | Validated profile creation. |
| `/profiles/[id]` | Profile details, preferences/consent, and separately opened private contact view. |
| `/profiles/[id]/edit` | Revision-checked editing. |
| `/matches` | Matching source selection, deterministic ranking, structured/local search, and optional explanation controls. |
| `/workflow` | Persisted five-step match journey with current candidate assessments, explicit review, approve/reject, archive/reopen, and stale-evidence handling. |
| `/email` | Saved local plain-text drafts, preview, exact-message approval, separate dispatch, and reconciliation/evidence UI; includes a visibly separate design-state example section. |
| `/chat` | Persistent internal conversations, local tools, optional Gemini interpretation, and reviewable typed proposals. |
| `/settings` | Shared matching weights, optional provider readiness display, appearance controls, and synthetic demo controls. |

### Profile and permission behavior

Profile service functions implement create, list, detail, update, archive/reactivate, exact-confirmation deletion, preferences, consent, and encrypted private contacts. Mutations use strict schemas, optimistic revisions, transactions where needed, and audit records. Contact email/phone fields are stored separately as AES-256-GCM ciphertext bound to profile ID and key ID; ordinary profile list/detail DTOs omit contacts. Consent scopes gate AI tasks. Demo seed/reset functions are explicit and typed to preserve real records.

### Matching and recommendations

`src/domain/matching.ts` calculates mutual heuristic scores across eight factors, applies strict eligibility/deal-breaker checks in both directions, distinguishes missing evidence from a zero score, and ranks deterministically with stable tie-breaking. Server services load only the authenticated user's active profiles and settings, cap result sets, sign cursors, and authenticate each call. Match scores are heuristic indicators, not probabilities. Optional AI explanations summarize minimized deterministic results; Gemini does not calculate scores or approve matches.

### Human workflow and role behavior

Workflow rules live in `src/domain/workflow.ts`; services recalculate eligibility and revisions, compare assessment stamps, and transact state, decisions, and audit events. Navigation/GET does not approve. Human review and a separate approve/reject action are needed; stale evidence blocks progression. There are **no role fields or role-based authorization rules**. The bootstrap-created account is not distinguished by an ongoing role in the User schema. Every registered account can use operator-style functions inside its own isolated workspace.

### Email delivery

Drafting and approval records are local and encrypted. Approval freezes an exact recipient/content payload and is separate from sending. Dispatch is a distinct explicit request; the service commits a durable attempt/lease before contacting Resend, uses idempotency keys, preserves uncertain outcomes as UNKNOWN, and retains evidence for reconciliation. The webhook validates signed raw bodies and deduplicates provider events. Tests use fake providers; live Resend behavior and credentials were not tested in this audit. Local draft work does not require Resend.

### Chat and AI

Chat conversations/messages/proposals are persisted encrypted and filtered by `ownerId`. Proposals do not execute from text alone: the UI and server require an explicit confirmation bound to reviewed values/revisions. Chat cannot approve a match or dispatch email. Gemini is optional and only reached through `src/server/ai-gateway.ts`; permission checks, minimized payloads, strict output schemas, timeouts, and fallback behavior are implemented. No live Gemini request was made.

## 4. Storage and multi-user isolation

### Database location and migration

The normal database is a local SQLite file named `matchmaker.sqlite`, defaulting to the OS application-data directory (Windows `%LOCALAPPDATA%`, otherwise local share). `DATABASE_URL` may select an absolute owned `file:` path ending in that filename; the guard rejects legacy-project and OneDrive paths. `scripts/database.ts` checks a sibling ownership marker and runs Prisma `migrate deploy`; it does not reset the database. Tests create disposable databases and do not target the application database.

### Ownership findings

- `User.email` is unique; each user has separate credential and session rows. The migration and security tests cover multiple registered accounts and credential/session preservation.
- `ChatConversation.ownerId` is a foreign key to User; chat list and lookup operations filter by that authenticated owner. The chat security tests exercise cross-owner denial.
- `Profile.ownerId` references `User.id`; contact, preference, and consent rows derive ownership through their profile. `AppSettings.ownerId` provides a separate settings row per account.
- Workflows derive ownership through their source profile, and services verify the candidate belongs to the same account. Snapshots/decisions derive through the workflow. Drafts/deliveries are filtered through owned workflows; attempts/events are returned only through an authorized delivery. SQLite triggers reject cross-owner workflow, snapshot, draft, and chat bindings.
- Dashboard activity filters by actor ID. Audit rows are attributable to users; there is no general audit-detail endpoint. Rate limits remain global security buckets, not per IP/user.
- Browser storage is not used for profiles or credentials. `localStorage` is used only for the visual theme preference. Persistent business data is in SQLite.
- New accounts receive independent settings and start with no profiles. Existing profiles map to the account recorded as their creator in the unique `PROFILE_CREATED` audit event; singleton settings map to the verified bootstrap account. Contact encryption complements account-level authorization isolation. **Deployment caveat:** until the ownership migration is applied to the configured database, the running local instance still has the old shared schema and must not be treated as isolated.

The tests establish service behavior with fixtures; this audit did not sign into or inspect any real account and did not query production/user data.

## 5. API surface

Handlers are Node.js route handlers. There are no server actions or proxy/middleware handlers.

| Route | Methods and purpose |
|---|---|
| `/api/auth/[...path]` | POST sign-up, sign-in, sign-out only; same-origin check, bounded/validated JSON, rate limiting, Better Auth sessions. Other paths return 404. |
| `/api/bootstrap` | POST one-time token-gated initial account/settings/latch transaction; rate limited and same-origin. |
| `/api/workspace/[...path]` | GET workspace/dashboard/settings/profile/contact/match-source/workflow/email/chat reads. POST profile/demo/matching/search/AI/workflow/email/chat actions. PATCH profile/settings/workflow/draft/chat/consent/contact/preference mutations. DELETE supports confirmed chat/profile deletion. All calls first authenticate; mutations also check same-origin and JSON limits; service functions authenticate independently. |
| `/api/webhooks/resend` | POST signed Resend webhook event ingestion; signature and schema verification occurs in the email service. This is provider-authenticated rather than user-session authenticated. |

The workspace catch-all currently covers: dashboard and settings; profile listing/detail/contact/create/edit/status/preferences/consent/delete; demo seed/reset; matching sources/ranking/explanations and profile search/interpretation; workflows, candidates and transitions; email draft preview/edit/approve plus delivery preview/dispatch/reconcile/cancel; chat conversations/messages/proposals/retries. API route presence was checked in source; endpoint behavior is additionally covered by Node security/domain tests.

## 6. Configuration and external dependencies

The following names are from `.env.example` and source references only; no values are included here.

| Variable names | Requirement/purpose |
|---|---|
| `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | Application origin and session/auth secret; secret is required and must be high entropy. HTTPS is enforced outside loopback. |
| `MATCHMAKER_SETUP_TOKEN` | Required only for one-time operator bootstrap. |
| `DATABASE_URL` | Optional absolute SQLite file override; otherwise the OS-local default applies. |
| `CONTACT_ENCRYPTION_KEY`, `CONTACT_KEY_ID` | Required for encrypted contact/chat/draft data operations; key loss/replacement can make existing ciphertext unreadable. |
| `GEMINI_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional Gemini opt-in. All are required for provider calls; disabled by default. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `RESEND_WEBHOOK_SECRET`, `APP_ORIGIN` | Optional email provider and webhook setup. `APP_ORIGIN` must match the canonical auth origin; sending requires valid operator configuration and public provider access. |

`LOCALAPPDATA`, `NODE_ENV`, and `MATCHMAKER_TEST_MODE` are also read by runtime/config/test code but are environment/runtime controls rather than provider secrets. Gemini and Resend SDKs are dependencies; tests use fakes and signed fixtures and are configured to block live provider traffic.

## 7. Completeness and disconnected/mocked areas

**Implemented and exercised by source/tests:** credential login/logout and registration, session invalidation, protected server routes, profile CRUD/archive/delete, encrypted contacts, consent/preferences, deterministic matching/search, per-user settings, human workflow transitions, encrypted local email drafts, explicit approval/dispatch state machine, webhook/reconciliation evidence, encrypted per-owner chat and review-confirmed proposals, synthetic demo handling, and two-account profile/contact/dashboard/settings isolation.

**Conditional/partially operational:** Gemini generation and Resend transport require deployment-owned credentials and configuration. Source and fake-provider tests exist, but no live external calls or actual delivery were verified. Initial app use depends on operator initialization of the owned database and setup token.

**Static/design-only:** the landing page's portraits and marketing examples are bundled synthetic content. The Email page includes a design-state example section. The legacy preview components remain in the component tree, but the authenticated data pages inspected use the `*-live` components for actual app data.

**Missing or not demonstrated:** password reset/recovery, social sign-in, outbound registration verification email, real photo upload, role administration, automated delivery scheduler/cron, automatic retries, production provisioning/deployment, and encryption-key rotation/recovery. README also notes that no external database or hosting is configured.

The login component contains a generic footnote saying AI, matching, and email delivery are disconnected previews. That text is stale relative to the live service code: matching, workflows, local email operations, and chat are implemented, while only provider calls are optional/configuration-dependent. It was not changed because the requested UI change was limited to the banner.

## 8. Verification results

Commands executed on 2026-10-10:

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | Passed (`tsc --noEmit`). |
| `npm.cmd run lint` | Passed (ESLint with zero warnings). |
| `npx.cmd prisma validate --config prisma7.config.ts` | Passed; Prisma schema is valid. |
| `npm.cmd run db:generate` | Passed; Prisma Client generated for the added owner relations. |
| `npm.cmd test` | Passed: 141 tests, 0 failures. Includes migration replay, auth, matching, workflow, email, chat, browser-fixture safety, a legacy ownership backfill preservation test, and two-account profile/contact/dashboard/settings isolation checks. |
| `node --conditions=react-server --import tsx --test tests/stage6-security.test.ts` | Passed: 14 tests, 0 failures. |
| `node --conditions=react-server --import tsx --test tests/stage8-security.test.ts` | Passed: 28 tests, 0 failures. |
| `npm.cmd run build` | Failed before compilation completed: Windows returned `EPERM` unlinking `.next/server/app/(workspace)/profiles/new/page`. No `.next` cleanup/reset was attempted. |
| `npm.cmd run test:e2e` | Could not start: Playwright refuses to reuse the already-occupied `http://127.0.0.1:3100/login`. The existing server was left running. Thus the updated browser assertion and visual rendering were not executed in this audit. |

The shell test source now asserts the notice count is zero on each authenticated route at multiple viewport widths, but the E2E suite must be rerun after port 3100 is free to verify the rendered result. Static source search confirms no banner markup or banner CSS remains; the generic `.preview-notice` string remains only in that negative browser assertion.

## 9. Prioritized findings and next steps

1. **High — apply the ownership migration during a safe maintenance window.** Port 3100 is occupied and the `.next` build output is locked. Stop the local app cleanly, retain the verified backup, run `npm.cmd run db:migrate`, and verify ownership, integrity, foreign keys, credentials/sessions, and row counts before restart.
2. **High — define roles before granting elevated actions to ordinary registrations.** There is no role model; registration creates another user with the same authenticated access as the bootstrap account. If future operators and staff need different powers, introduce explicit server-enforced roles before exposing admin-only settings or sensitive functions.
3. **High — complete recovery and key-retention operations before production use.** Password recovery and key rotation/recovery are absent. Losing/replacing the configured encryption key makes retained encrypted content inaccessible.
4. **Medium — verify deployment-dependent providers safely.** Configure Gemini/Resend only in a controlled environment, use test/fake providers for tests, and verify sender-domain/webhook setup without sending to real users. No live provider behavior was tested here.
5. **Medium — rerun browser/build verification when the local app is stopped.** Both were attempted and blocked by the output lock / occupied port. Do not delete `.next` files or terminate the running process outside a maintenance window.
6. **Low — correct stale sign-in copy.** The login component's “disconnected previews” note contradicts several live features; update it separately after confirming desired product wording.

## 10. Tenant migration and backup evidence

The legacy owner was not inferred from account ordering. Read-only inspection found one `BOOTSTRAP_COMPLETED` event with a valid actor. A later read-only check found three current profiles, each with exactly one `PROFILE_CREATED` audit by a valid account; the recorded creators span both existing accounts. This per-profile audit trail is the profile backfill source. The singleton settings initialization event belongs to bootstrap, so its row remains with that account. The migration verifies this mapping inside SQLite and fails if any profile has zero, multiple, or invalid creator events, or if workflow/snapshot/email/chat links cross the resulting owners. Empty databases can migrate without legacy backfill.

Before schema edits, a consistent backup was made with SQLite's online backup API. A later read-only comparison found the live database had changed since that first snapshot (the profile count increased), so I created a **newer rollback snapshot** rather than risk losing newer data. Current backup: `matchmaker.sqlite.pre-tenant-2026-10-10T05-53-28.021Z-e9dd19d2-5a4b-4dbb-b55c-be64dddc47a0.bak`; 23 tables, matching per-table row counts, 2 users, 3 profiles, `PRAGMA integrity_check=ok`, zero foreign-key violations, 389,120 bytes, SHA-256 `6b71ecbdc8e4d6ec868de3ee8ddd92fb532cec0b5e6205633f27e30e0acc2d25`. The live database remains at five migrations and the current counts match this new snapshot. Use the newest snapshot for rollback; the earlier verified file remains untouched. The encryption key was not modified. Rollback is restore-from-backup before tenant-scoped writes begin; preserve the post-migration DB separately and retain the same encryption key/key ID.

`TENANT_ISOLATION_OWNERSHIP_MATRIX.md` documents model ownership and derived child ownership. The migration passes disposable full-history replay and schema-to-migration drift checks. It has **not** been applied to the configured SQLite file: port 3100 is occupied and the `.next` build output is locked, so a clean maintenance window is required. Existing application data remains preserved at its original schema; the running instance is not yet tenant-isolated.
