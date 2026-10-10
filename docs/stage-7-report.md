# Stage 7 completion evidence

Implemented and verified in the independent sibling `Data crew/intern/matchmaker-ai-rebuild` on 9–10 October 2026. Stage 7 adds encrypted editable local email drafts, exact-payload human approval, separate explicit dispatch, durable attempts/idempotency, verified provider events and authenticated manual reconciliation. Stage 8 has not begun. Live Resend delivery is **unverified**; no provider credentials were configured, service provisioned, deployment performed or live provider called.

## Preflight and preservation

Read AGENTS, README and Stage 3/4/5/6 reports, schema/migrations, auth, contact encryption, consent/AI gateway, profile/matching/workflow/audit services, configuration, routes and tests. Reviewed installed Next.js route-handler and data-security guidance before framework edits. Verified runtime/framework/ORM/adapter/Zod/Gemini versions and read current official Resend idempotency, verification, event, send and retrieve guidance.

Observed unchanged pins: Node 24.14.0, npm 11.9.0, Next 16.4.0, React/DOM 19.3.0, TypeScript 5.9.3, Better Auth 1.7.7, Prisma/client/SQLite adapter 7.10.0, better-sqlite3 12.11.1, Zod 4.6.5, Gemini SDK 2.28.0, Playwright 1.64.0 and axe 4.13.0. Resend was initially absent. Added exact **resend 6.32.1** for the provider-supported SDK webhook verifier; its pinned lockfile resolves standardwebhooks 1.1.1. Sending/retrieval use the official REST API to enforce a single request, fixed host and complete eight-second abort without SDK base-URL overrides or hidden retries. No existing runtime dependency was upgraded.

Before changes, all **66 existing Node tests** passed: security 13, matching 19, Stage 5 security 12, workflow 8 and Stage 6 security 14. Initial Playwright discovery returned “No tests found”: Node 24 classified hydrated OneDrive spec files as reparse links and Playwright skipped them. Temporary regular local copies allowed the unchanged **30 browser tests to pass (8.6 minutes)** against the Stage 6 production build. The durable Stage 7 browser runner now makes fresh ignored copies and adjusts relative imports, preserving original test files.

Read-only Git status showed the sibling untracked and many unrelated preexisting legacy changes. No Git mutation/commit/reset/index change occurred. Stopped only the previously owned loopback rebuild server for browser tests. All test operators, records and databases were newly generated synthetic fixtures in owned OS temporary directories.

The additive schema/retention change was explained before migration creation: editable drafts cascade with profiles/workflows; approved encrypted email ledger and evidence survive deletion so an uncertain network request and its duplicate protection cannot disappear. Existing account/profile/workflow tables and their data were not rebuilt or replaced.

## Files and purposes

| Relative paths | Purpose |
| --- | --- |
| prisma/schema.prisma; prisma/migrations/sqlite/202610090003_stage7/migration.sql | Four additive models, indexes, partial revision uniqueness, exact draft/pair binding and immutable snapshot/ledger/evidence triggers |
| src/domain/email.ts | Strict plain-text/address/command/snapshot schemas, typed DTOs, explicit state/evidence reducer and truthful descriptions |
| src/server/email/service.ts | Independent auth, encrypted local templates/edits, signed exact preview/approval, expiry/cancellation, transactional leases/attempts, uncertainty recovery, event association/reducer and manual reconciliation |
| src/server/email/resend.ts | Private runtime configuration, bounded fixed-host REST adapter, test-mode fail-closed transport and SDK raw-body webhook verification/schema |
| src/server/contacts.ts | Reuse existing AES-GCM implementation with explicit namespaces; unchanged contact binding/wrapper semantics |
| src/server/profiles.ts; workflows.ts; security.ts | Audited transactional recipient resolution, reuse current reviewed approved pair validation, counted/versioned demo draft reset, retention audit categories and shared email budgets |
| src/app/api/workspace/[...path]/route.ts; api/webhooks/resend/route.ts | Explicit authenticated email operations and dedicated verified provider webhook |
| src/components/email-live.tsx; src/app/(workspace)/email/page.tsx | Scoped persistent draft editor/list, overview/retained delivery ledger, exact review and separate dispatch dialogs, local copy/export, provider/expiry/stale/uncertain/evidence UI |
| src/components/workflow-live.tsx; src/app/(workspace)/workflow/page.tsx | Steps 4/5 link the current approved workflow to its independent email workspace |
| src/components/settings.tsx; src/app/(workspace)/settings/page.tsx; shell.tsx; dashboard-live.tsx | Safe actual provider status and honest current-feature copy |
| src/components/dialog.tsx; globals.css | Preserve focus after an asynchronous email preview; semantic-token responsive message/history layouts |
| src/components/profile-detail.tsx; demo-controls.tsx | Explain retained approved-email evidence; show counted editable-draft removal |
| tests/email.test.ts; stage7-security.test.ts; stage7.spec.ts | Pure reducer/validation, owned-database fault/security/concurrency/verification tests and real/local plus configured-UI-fixture browser coverage |
| tests/shell.spec.ts; stage6.spec.ts | Retain historical previews, wait for streamed shell hydration and update current Stage 7 step expectations |
| scripts/browser-tests.mjs; playwright.config.ts; eslint.config.mjs; tsconfig.json; .gitignore | Reliable OneDrive-safe discovery, explicit disabled test transport and ignored local test artifacts |
| package.json; package-lock.json; .env.example | Exact SDK dependency, test commands and placeholder-only private provider environment contract |
| AGENTS.md; README.md; docs/workflow-state-machine.md; email-delivery.md; stage-7-report.md | Current scope, operator/setup/retention/state/API/reconciliation rules and observed evidence |

The original EmailPreview remains a clearly labeled collapsed design example. Existing portrait assets/provenance, design tokens, scoring/consent/auth behavior and the sole Gemini gateway are preserved. Generated Prisma/client/build/test artifacts are ignored and reproducible.

## Models and migration

EmailDraft stores workflow/current decision/assessment/recipient binding, encrypted subject/body, key ID, revision, local/manual provenance and timestamps. Recipient addresses are resolved on demand through the audited private-contact service, not copied into general profile/workflow DTOs.

EmailDelivery stores the immutable encrypted exact outgoing snapshot and digest, original draft/revision/workflow/recipient/decision/assessment IDs, authenticated approver/time, one-hour expiry, state/revision, optional provider ID, stable key, attempts/retry/lease fields, credential fingerprint and minimal state-evidence timestamp/type. Its optional draft FK is set null on deletion; the original identity survives.

EmailSendAttempt stores delivery, unique attempt number/operation UUID, start/finish, safe PENDING/ACCEPTED/REJECTED/UNKNOWN category, optional provider ID and allowlisted/fixed error code. Completed attempts cannot be rewritten/deleted. EmailProviderEvent stores signed unique event ID, provider ID, type/source, occurrence/receipt timestamps, optional delivery/tag and evidence digest, with immutable evidence and one-time association. Addresses/subjects/bodies/raw payloads are absent from events/audits.

SQLite checks/triggers bind drafts to the current approved workflow/pair/decision/assessment; enforce exact delivery-to-draft identity, one live/consumed logical delivery per draft revision, unresolved-recipient replacement blocking, stable per-delivery key and immutable approval/payload/key/first-attempt identity. Delivery/attempt/event deletion is refused. Provider message IDs and attempt operation IDs are unique. Existing Stage 4/6 SQL constraints remain intact.

`npm run db:generate` succeeded. The guarded `npm run db:migrate` applied **202610090003_stage7** only to `%LOCALAPPDATA%/MatchmakerAIRebuild/matchmaker.sqlite`, after verifying the original owner marker outside OneDrive/legacy. Read-only inspection confirmed all three migrations, zero foreign-key violations, and **0 users/profiles/workflows/snapshots/decisions/drafts/deliveries/attempts/provider events** in the main database. No main operator, demo or customer data was created. Temporary test databases replayed all three migrations. No reset/drop/destructive migration command was run.

## Exact approval and dispatch architecture

The server accepts only a workflow and SOURCE/CANDIDATE role for creation. It checks the current reviewed Stage 6 match and derives recipient/pair itself. Templates and edits stay local: there is no new AI request or free-text transmission, and scoped AI permissions are not treated as permission to send.

Review shows actual recipient identity/address, server-configured sender/reply-to, exact plain-text subject/body and revision. A two-minute HMAC token binds actor, proposed delivery UUID, draft/revision and canonical digest. Explicit approval verifies it and recomputes current pair/eligibility/profile/preference/contact/sender/content inside the snapshot+audit transaction. The approved snapshot lasts one hour and approval never calls the provider. Editing cancels only unattempted approval; accepted/uncertain requests are never recalled. Stale current evidence blocks dispatch and the UI explains fresh review/cancellation/reconciliation options.

Explicit SEND EMAIL claims revision CAS, 30-second operation lease and durable attempt/audit before transport. One bounded request submits the frozen text, UUID tag and stable key; response evidence is persisted before a truthful result is returned. Concurrent/repeated requests cannot claim another logical submission. The provider credential fingerprint blocks an uncertain retry across accounts. No dispatch operation is exposed to AI/chat or GET/navigation.

## Duplicate protection and uncertainty

The key is always `matchmaker-email/<delivery-id>`. A valid explicit retry uses that same key/payload. Resend’s documented retention is **24 hours**; the app uses **23 hours from the first claim**, with the stricter original unexpired one-hour approval also required. No automatic retry exists. After these windows, an attempted UNKNOWN delivery stays blocked for manual provider reconciliation. Ledger/unique constraints remain beyond provider retention. [Official idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

A timeout, possible submission connection failure, ambiguous conflict/5xx/malformed success, or provider acceptance followed by local write failure remains UNKNOWN. A rejection of a later retry cannot disprove earlier acceptance. If the result cannot persist, the precommitted key/attempt/lease survive; best-effort uncertainty is written or expired-lease recovery completes it on the next explicit operation. Late evidence can resolve it without a replacement send. Unresolved attempts block new approvals for the recipient profile across draft/workflow identities. A consumed revision cannot be sent again under a fresh key; a deliberate new message needs a new reviewed revision/logical approval after earlier uncertainty is resolved. Exactly-once transport is not promised.

## Webhooks, reducer and reconciliation

The dedicated raw-body endpoint verifies required bounded svix headers using the official Resend SDK/standardwebhooks verifier, including its five-minute timestamp tolerance. Only then does a strict bounded schema accept seven subscribed outbound event types. The event and sanitized audit/state change commit before acknowledgement; unmatched events are retained. Unique signed IDs deduplicate; changed evidence under the same ID is rejected. Stored duplicates bypass the high shared valid-new-event budget; invalid signatures cannot consume it. No raw message/provider payload or detailed signature/SQL error is exposed. [Official signature guidance](https://resend.com/docs/webhooks/verify-webhooks-requests).

The reducer separates ACCEPTED from DELIVERED; delivery means recipient-mail-server acceptance, never a read receipt. Terminal evidence cannot regress to accepted/delayed. Terminal webhook contradictions use occurrence time and a documented equal-time tie rule; contradictory events remain stored. Early verified events associate after the provider ID is durably bound. Authenticated retrieval cannot overwrite existing terminal evidence because last_event has no occurrence timestamp. [Provider event definitions](https://resend.com/docs/webhooks/event-types).

Manual reconciliation independently authenticates, uses the shared bounded request budget and same operation lease, then fetches known/operator-located provider IDs with authenticated server access. It matches exact sender/single recipient/subject/text/reply-to/tag; the official response boundary excludes extra HTML/CC/BCC. Tags alone never bind an unknown event. Mismatched/unavailable/unsupported evidence leaves the current outcome unchanged. No public reconciliation endpoint, scheduler, CRON_SECRET or unawaited background task is configured. [Official retrieval fields](https://resend.com/docs/api-reference/emails/retrieve-email).

## Verification evidence

The commands below were actually executed from the rebuild. Browser results distinguish complete-suite runs from targeted reruns; all 33 unique browser tests have passed across the runs described below.

| Command/check | Observed result |
| --- | --- |
| npm install --save-exact resend@6.32.1 --no-fund --no-audit | Added official SDK and 5 packages; exact manifest/lockfile pin |
| npm run db:generate | Passed after additive schema/key-fingerprint fields |
| npm run db:migrate | Passed, Stage 7 only applied to verified owned main database |
| npm run typecheck | Passed, no TypeScript errors |
| npm run lint | Passed with max-warnings=0 after removing an unused test import and using const |
| npm run build | Passed; actual Email/API/webhook pages are dynamic |
| npm run test:security | 13 passed, 0 failed |
| npm run test:matching | 19 passed, 0 failed |
| npm run test:stage5 | 12 passed, 0 failed |
| npm run test:workflow | 8 passed, 0 failed |
| npm run test:stage6 | 14 passed, 0 failed |
| npm run test:email | 7 passed, 0 failed |
| npm run test:stage7 | Final expanded run: 29 passed, 0 failed |
| npm run test:e2e | Latest full run: 31 passed, 2 timed out, 12.5 minutes; affected checks subsequently passed in targeted runs below |
| Targeted Playwright, five checks | 3 passed, 2 failed, 4.4 minutes; all local/stale-draft and workflow accessibility checks passed; remaining navigation/cleanup timing issues corrected |
| Targeted Playwright, final two checks | 2 passed, 0 failed, 1.9 minutes; two-tab concurrency and expanded desktop/mobile exact approval/dispatch checks |
| Generated client secret scan | 25 client JavaScript files; 3 configured secrets checked privately; 0 occurrences |
| Read-only main DB inspection | Three migrations, all nine business/account counts zero, no foreign-key violations |

Node coverage verifies authentication/CSRF/strict schemas, exact ciphertext/digest/pair binding, approval without transport, expiry/reapproval, stale contact/sender/preferences/archive/decision, missing/replaced key, local operation without provider, concurrent dispatch, repeated send/key protection, timeout and same-key retry, cross-draft unresolved-recipient blocking, rejected retry uncertainty, accepted-then-local-write-failure reconciliation, retry ceiling, changed provider credentials, signed raw-body/timestamp/schema rejection, unmatched/duplicate/early/out-of-order/contradictory events, durable webhook acknowledgement, audit rollback, exact authenticated reconciliation, active/recovered leases, late results, profile-deletion retention and counted/version-bound DEMO draft reset preserving REAL evidence. All seven suites total **102 passing Node tests**, with no live network provider.

An expanded Node run initially hit the production 30-request test budget after 27 passing cases. Test isolation now clears only the owned temporary email bucket between cases; the production limit was preserved. The subsequent expanded suite passed all 28; the final added demo-reset case increased the passing total to 29.

The first Stage 7 browser run had 29 passes/4 failures: new dashboard badge overflow at 320 px, a streaming duplicate-shell assertion, historical email preview not expanded, and async preview focus restoration. These were corrected with concise badge text, hydration wait, explicit expansion and a captured return-focus reference. The next full run passed 31/33; the five-view accessibility and two-tab tests exceeded 30 seconds. A five-check follow-up passed the five-view test and real local/stale-draft tests, while exposing a five-second navigation wait in the background tab and cleanup timeout after the newly expanded email test's three axe scans. Tests now switch active tabs explicitly, allow 15 seconds for saved-workflow navigation and 90 seconds for these multi-view/multi-scan cases. The final two-check run passed both. No security assertions were removed or relaxed, and production timeouts/rate limits were unchanged. The result is **33 unique browser tests validated across full and targeted runs**, with the exact observed run totals above.

The targeted commands executed were:

```powershell
npm run test:e2e -- --grep "every workflow view|two tabs cannot|unconfigured provider|stale match blocks|exact approval"
npm run test:e2e -- --grep "two tabs cannot|exact approval"
```

### Browser and accessibility coverage

Installed Google Chrome **155.0.8059.39** ran against the production build and a newly owned synthetic SQLite fixture database for each run, with live transport explicitly disabled. The full route matrix covered Dashboard, Profiles, Matches, Workflow, Email, Chat and Settings in light/dark themes at 1440, 768, 390 and 320 pixels: **56 route/theme/viewport combinations**, zero horizontal overflow, zero axe WCAG 2 A/AA and 2.1 AA violations, no page JavaScript errors and no external browser requests in that matrix. Existing navigation, profile/auth/settings/matching and human workflow checks also passed across the reported runs.

Real email browser checks exercised encrypted local create/edit/revision/reload, unsaved-change guards, export without a provider or delivery-state mutation, stale approved-match blocking and rejection of forged state fields. The configured flow used explicitly labeled HTTP UI fixtures: exact address/content preview, initially disabled confirmations, Escape/focus return, approval without dispatch, separate send checkbox, truthful accepted status and all 13 displayed delivery states. Those fixtures verify UI behavior; real adapter/security/evidence semantics are covered by the Node fakes and owned database tests, not a live provider.

Additional email axe/overflow checks covered the local editor at 320 light and 768 dark, exact approval at 1440, and separate dispatch/final ledger at 320 dark. Manually reviewed generated screenshots `test-results/screenshots/stage7-local-draft-320.png`, `stage7-local-draft-dark-768.png` and `stage7-exact-dispatch-ui-fixture.png`, including the scrollable narrow dispatch dialog. Screenshots contain synthetic fixtures only and are ignored local artifacts. No screen-reader or other browser-engine certification is claimed.

## Operator steps and limits

Restored the owned main production preview with `npm run start` at **http://127.0.0.1:3100** (ready in 452 ms). A fresh anonymous Chrome check confirmed `/setup` available, `/email` redirects to `/login`, the email API returns 401 and the unconfigured webhook returns 503. No operator was created by this check; the nine main business/account table counts remain zero, three migrations are finished and no foreign-key violations exist. The protected email workspace is available after operator setup/login.

The main database remains empty; create your actual operator account at `/setup` using the rebuild’s existing private setup token and your chosen credentials. No token is printed or placed in a URL. No main .env.local secret was replaced or copied from legacy.

Local drafts are immediately useful after a current human-approved match. For live email after review, configure your own Resend key with send/retrieve permission, verified sender domain, optional reply-to, matching APP_ORIGIN/BETTER_AUTH_URL and a public HTTPS signed webhook for the seven supported events. This stage does not provision those services. Loopback alone cannot receive public webhooks. Configured syntax is honestly labeled live-unverified; no mock proves live delivery.

Reconciliation is manual. UNKNOWN with no provider ID needs a dashboard-located ID followed by server-side exact verification. Not-found or missing evidence never forces failure or unlocks a replacement. Email ledgers/evidence currently have indefinite retention and no purge API. Approved encrypted snapshots survive profile deletion to preserve uncertainty/dedupe, as disclosed in the deletion UI; expired/deleted/currently invalid workflow approval cannot submit. Key rotation, multi-key recovery, lost-key recovery, scheduled jobs, provider/account provisioning and production deployment remain unimplemented. Preserve the original key; email writes fail on accidental replacement. Automated axe is not a full accessibility certification; screen readers/other browser engines are not manually certified.

## Legacy preservation and stop

All application writes belong to this sibling or its owned external/temporary data directories. No legacy source, database, environment/configuration, customer row/content/secret or Git state was written, adopted or copied; unrelated preexisting edits remain. Stage 7’s initial and final metadata snapshots contain the same **157** nondependency/non-Next-cache files, with unchanged SHA-256 **361cfd10c7cdd093f0db7c0441b2fc192dd0869d15179927f12924266415d369** using this stage’s sorted path/size/mtime record format. Root package-lock.json remains **88 bytes**, mtime **1781758296988.519**, unchanged. No Git mutation occurred.

Stop after Stage 7 and wait for review. No persistent AI chat/tools, bulk campaign, backups/restore, legacy migration, production provisioning/deployment, real-photo upload or Prompt 8 work was started.
