# Matchmaker AI — Stage 10 QA of Stages 3–8

A private single-matchmaker workspace built on the Stage 3 design system. Authentication, profiles, deterministic matching, human workflows and encrypted email drafts use the owned SQLite database. Every outgoing email needs exact-message human approval and a separate explicit dispatch. Local drafts/copy/export work without Resend; verified provider evidence controls delivery status. Optional Gemini search/explanation remains behind the existing consent gateway; local email drafts never call it. Persistent internal chat saves encrypted conversations and reviewable changes; exact human confirmation is mandatory for business mutations.

## Local setup

Use Node.js 24 and npm. Run commands inside this sibling directory, never the legacy project:

```powershell
npm ci
npm run db:generate
npm run local:configure
npm run db:migrate
npm run dev
```

If `.env.local` already exists, skip `local:configure` and review the existing rebuild configuration privately. The command refuses to overwrite it. Stage 8 adds three chat tables through additive migration `202610100004_stage8` after the preserved Stage 7 email migration; run the guarded migration command when updating an earlier checkout. No account, main demo data or provider secrets are automatically created. Existing configuration/data are preserved.

Open <http://127.0.0.1:3100/setup> once. Read `MATCHMAKER_SETUP_TOKEN` privately from the rebuild's `.env.local`, enter it into the setup form, and create the initial operator account. The token is never provided in a URL, page source, or browser storage. Setup then remains permanently closed. Additional users can create accounts at `/register` and sign in at `/login`; each account has its own workspace and cannot access another account's records. There is no password recovery flow, and no verification email is sent.

For the production-mode **local** server:

```powershell
npm run build
npm run start
```

Both servers bind to loopback port 3100. Stop the local server before running browser tests, which deliberately refuse to reuse an existing server.

## Environment configuration

[.env.example](.env.example) contains placeholders only. No legacy secrets are used.

| Name | Purpose |
| --- | --- |
| `BETTER_AUTH_URL` | Exact application origin; HTTP allowed only for loopback, otherwise HTTPS required |
| `BETTER_AUTH_SECRET` | Random session signing secret, at least 32 bytes of entropy |
| `MATCHMAKER_SETUP_TOKEN` | High-entropy one-time operator token; 32 random bytes encoded as hex |
| `CONTACT_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as canonical base64 |
| `CONTACT_KEY_ID` | Identifier for the contact key, such as `local-v1` |
| `DATABASE_URL` | Optional absolute `file:` path ending in `matchmaker.sqlite`, outside OneDrive/legacy paths |
| `GEMINI_ENABLED` | Optional explicit opt-in: `true`; default disabled |
| `GEMINI_API_KEY` | Optional private Gemini Developer API key; never copied from the legacy app |
| `GEMINI_MODEL` | Optional explicitly chosen supported Gemini text-model name; no automatic model alias |
| `RESEND_API_KEY` | Optional private Resend key; authenticated email retrieval permissions needed for reconciliation |
| `RESEND_FROM_EMAIL` | Bare sender address on the operator’s verified sending domain |
| `RESEND_REPLY_TO` | Optional bare reply-to address; frozen into exact approval |
| `RESEND_WEBHOOK_SECRET` | Private webhook signing secret; required for configured sending |
| `APP_ORIGIN` | Exact bare origin matching BETTER_AUTH_URL; HTTPS outside loopback |

`local:configure` generates fresh cryptographically random development secrets without printing them. Keep this ignored file private. Never prefix these variables with `NEXT_PUBLIC_`. The existing contact key also encrypts chat titles/messages/proposals, drafts and approved email snapshots, with separate authenticated bindings. Email writes validate existing ciphertext before proceeding under a configured key. Retain the original key/identifier; changing them does not rotate ciphertext. Rotation, multi-key recovery and recovery of lost keys are not implemented. No main Resend credentials were configured and live delivery remains unverified.

## Database and migration workflow

The Windows default is `%LOCALAPPDATA%\MatchmakerAIRebuild\matchmaker.sqlite`, outside synchronized source. Other systems default to the user's local share directory. The migration script verifies an application ownership marker, refuses unclear existing database ownership, and creates a fresh empty file before Prisma's SQLite migration on Windows.

Schema: `prisma/schema.prisma`. Config: `prisma7.config.ts`. History: `prisma/migrations/sqlite/`.

```powershell
npm run db:generate
npm run db:migrate
```

`db:migrate` runs Prisma **migrate deploy** only against the configured owned rebuild database. It is safe to rerun applied migrations. Do not use `prisma migrate reset` on this workspace. To develop a later migration, use a disposable owned development database, generate/review the SQL, preserve the handwritten constraints/triggers, and apply the reviewed history through the guarded script. SQLite CHECK constraints and triggers are not all represented in Prisma's schema.

Future PostgreSQL will require its own provider schema/adapter and migration history. Do not replay SQLite SQL on PostgreSQL. No PostgreSQL credentials, hosting provider, or deployment are configured.

## Authentication and data rules

- Better Auth's maintained scrypt implementation hashes passwords. Setup and registration accept passwords of 12–128 characters.
- A transaction claims the permanent bootstrap latch and creates the initial operator, credential, settings, and audit events together. Later registrations create separate users and credentials in the same database, reject duplicate emails, and write an audit event transactionally. The SQLite migration preserves existing user records and their references while allowing additional accounts. The setup latch cannot be reopened or deleted.
- Sessions are database-backed, expire after 12 hours, and update after 30 minutes of activity. HttpOnly SameSite=Strict cookies use Secure for HTTPS; localhost HTTP is a deliberate development exception. Browser-close sessions are requested; cookie caching is disabled so revoked sessions lose access immediately.
- Bootstrap allows 5 attempts, registration 8, and login 10 per 15 minutes. Global SQLite buckets provide atomic limits across processes without collecting IP addresses or user agents. Exhaustion can temporarily block the operator too.
- Protected service operations independently call `requireMatchmaker()`. Mutation requests require the configured same origin, JSON, strict validation, and at most 32 KiB.
- Profiles retain unknown facts as null/empty collections. Reported age and confirmation date are paired; no birth date, gender, or orientation is inferred. Results are bounded to 20 profiles per page.
- Global profile revisions protect profile/contact/preference/consent/status mutations. Stale requests fail and ask for reload.
- Private email/phone values live only in separate AES-256-GCM ciphertext, bound to the profile and key ID. Ordinary list/detail DTOs omit contacts. Open the authorized contact editor explicitly to decrypt them.
- Archive preserves data and consent records; reactivation restores active status. Permanent deletion needs exact name-based confirmation and cascades contacts/preferences/consents, applicable workflows/snapshots/decisions and editable email drafts. Sanitized audit, encrypted approved-email ledger, attempts and minimal provider evidence are retained for duplicate prevention/reconciliation. Deletion never recalls an accepted/uncertain send; retained deliveries cannot dispatch without current draft/workflow authorization. See [email retention and key policy](docs/email-delivery.md).

## Consent and demo isolation

SEARCH, MATCHING, EXPLANATION, EMAIL_DRAFT, and CHAT are independent scopes. Missing records mean UNSET. Grants/withdrawals store policy version, an internal evidence reference, time, and revision. Withdrawing permission is immediately reflected in authorization checks. Recording permission does not enable AI. The operator must have actual customer evidence; possessing a profile is not consent.

Settings offers optional idempotent seeding of four locally generated fictional adults. Stable unique demo keys and immutable DEMO classification keep them separate. Demo records cannot store deliverable contacts. Demo permission records are explicitly synthetic.

Review demo reset to see profile/dependent counts, including workflows/snapshots/decisions. Type RESET DEMO to confirm. A server-validated snapshot token detects changed demo data, and the transaction deletes only DEMO profiles and their dependents. Every REAL profile, account, permanent latch, settings record, and audit history remains. There is no whole-database reset button and no seed/reset on startup.

## Routes and structure

`/login`, `/register`, `/setup`; protected `/dashboard`, `/profiles`, `/profiles/new`, `/profiles/[id]`, `/profiles/[id]/edit`, `/matches`, `/workflow`, `/email`, `/chat`, `/settings`.

- `src/server/`: server-only auth, database, encryption, security, and transactional services.
- `src/domain/`: universal typed DTOs and strict schemas.
- `src/app/(workspace)/`: authenticated shell and pages; each data operation also authenticates.
- `src/components/`: retained Stage 3 controls plus login, live profiles/dashboard, contacts/preferences/consent, and demo controls.
- `public/demo/portraits/`: unchanged generated assets and [provenance](public/demo/portraits/provenance.json); real profiles use a neutral placeholder. Uploads are not implemented.
- `src/generated/prisma/`: generated and ignored; regenerate after schema changes.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
npm test
npm run test:security
npm run test:matching
npm run test:stage5
npm run test:workflow
npm run test:stage6
npm run test:email
npm run test:stage7
npm run test:stage8
npm run test:e2e
```

`npm test` runs every Node `*.test.ts` suite, including Stage 10 fixture-safety regressions; individual stage scripts remain available. The security suites use unique temporary databases. Provider tests use deterministic fakes and SDK-signed webhook fixtures, never live endpoints. Playwright uses installed Google Chrome; its runner always creates fresh database/secrets and disables live Gemini/Resend, overriding inherited configuration. Workers reuse only a validated run-bound fixture, and preparation validates that fixture before migration. Setup/login precedes synthetic fixtures. The browser runner copies specs into a fresh ignored local directory to avoid OneDrive reparse-point discovery failures, adjusting relative imports; original specs are preserved. Screenshots/reports/fixture-session state stay in ignored `test-results/`. No test uses the main or legacy database. Disposable databases remain in unique OS temporary directories for inspection.

## Matching, search and optional Gemini

Choose a source in Matches and rank candidates in its classification. Only eligible active adult pairs are returned, ten at a time. Strict rules apply in both directions. Missing or stale required facts need review; unknown factor evidence is disclosed separately from a numeric zero. See [the complete algorithm contract](docs/matching-algorithm.md).

Settings edits all eight raw weights, previews normalized shares, requires `SAVE WEIGHTS` confirmation, and increments a version through an authenticated optimistic transaction. Old result cursors become invalid. Existing weights totaling 100 still work; other positive totals are normalized too.

The Profiles advanced-search panel and Matches structured filters work locally. A small natural-language grammar supports the displayed examples. Unrecognized or personal text returns no broadened results and never leaves the server. Named-location, education and communication filters are entered through structured fields and stay local.

Gemini is disabled unless `GEMINI_ENABLED=true`, a private `GEMINI_API_KEY`, and an explicitly chosen supported `GEMINI_MODEL` are configured in this rebuild. Configuration alone sends nothing: the operator must request the optional task. Source SEARCH permission is required for query-only interpretation; both current EXPLANATION permissions are required for a pair. Synthetic demo permissions remain synthetic. No main provider secrets were added or copied, no service was provisioned, and live provider operation has not been verified.

The single server-only gateway sends a canonical allowlisted query alone for search, or temporary aliases and deterministic factor numbers for explanations. It excludes names, contacts, biographies, photos, account identifiers and arbitrary text. Strict output validation, an eight-second deadline, response limits and a shared request budget protect the boundary. Unsafe output, missing permission/configuration, timeout or provider failure returns a labeled local fallback. Outside chat, AI explanations are not persisted or cached. Chat stores encrypted interpretations separately from tool facts and hides them when current permission is withdrawn; each new request and returned response rechecks current permissions.

## Saved workflows and human decisions

Open `/workflow`, select an active source, create the journey and continue to current ranked candidates. Select a candidate, read the factor evidence and limitations, then explicitly record your explanation review. Approve Match and Reject Match each require a separate confirmation and persist only after server acceptance. Reopening keeps the old decision in history and requires a new assessment and review. A stale-data warning locks previews; refresh or reopen as directed. Previous steps preserve valid context. Stale journeys can revisit source/candidate selection but cannot advance to drafting.

Step 4 opens editable local email drafts for the exact approved pair. Step 5 opens the same scoped email approval/delivery workspace. Match approval never authorizes an outgoing email. Archive makes a journey read-only and prevents new dispatch, while existing provider evidence remains reconcilable.

See [email approval/state/idempotency/webhook/reconciliation/setup rules](docs/email-delivery.md), [Stage 7 completion evidence](docs/stage-7-report.md), [workflow rules](docs/workflow-state-machine.md), [matching rules](docs/matching-algorithm.md), and historical [Stage 6](docs/stage-6-report.md), [Stage 5](docs/stage-5-report.md), [Stage 4](docs/stage-4-report.md) / [Stage 3](docs/stage-3-report.md) reports. Production provisioning/deployment, recovery, backup/restore and real photo uploads remain unimplemented. No live Gemini/Resend call was made. Stage 9 remains absent; Stage 10 audits the implemented application and does not fill that feature gap. See [Stage 8 completion evidence](docs/stage-8-report.md) and the [Stage 10 findings and release prerequisites](docs/stage-10-report.md).

## Email operation

Open Email and select a current human-approved workflow. Save an encrypted local plain-text draft, copy/export it, or review its actual private recipient/from/reply-to/content/revision. Approval freezes that exact snapshot for one hour and does not send. A separate confirmation claims a durable attempt before a single bounded Resend request. Stable per-delivery keys and database leases prevent concurrent logical submission. Timeouts/persistence uncertainty stay UNKNOWN; unresolved sends block replacement approvals for that recipient. Only an explicit valid same-payload/key retry is permitted within both approval expiry and the conservative 23-hour ceiling. Resend documents a 24-hour provider window in its [official idempotency guidance](https://resend.com/docs/dashboard/emails/idempotency-keys).

The raw-body webhook uses the official SDK verifier and durable event-ID dedupe. Accepted and delivered remain distinct; neither establishes a person read the email. Reconcile manually through authenticated exact-message provider retrieval. There is no public cron endpoint/scheduler or automatic retry. Configure your own sender domain/key and public HTTPS webhook only after reviewing the setup and retention limits in [email-delivery.md](docs/email-delivery.md); loopback is not publicly reachable. The main application remains useful without these integrations.

## Persistent internal chat

Open `/chat` to create, rename, archive/reopen and explicitly delete encrypted conversations. Choose a local lookup task or optional minimized Gemini interpretation. Typed proposals support selected profile fields, existing workflow navigation and encrypted email draft creation/editing. Review exact values and revision before confirming; wording in a message never approves a match or sends email. No new environment variables are required. See [chat tools, confirmation, privacy and retention](docs/chat-tools.md).
