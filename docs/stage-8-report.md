# Stage 8 completion evidence

Implemented in the independent sibling `Data crew/intern/matchmaker-ai-rebuild` on 10 October 2026. Stage 8 adds owned encrypted internal conversations, typed local lookups, optional minimized Gemini interpretation and exact confirmed mutations through existing domain services. Live Gemini and Resend remain unverified; neither was called. Stage 9/10, backups/restore, deployment, legacy import and customer portals were not started.

## Preflight and preservation

Read AGENTS, README, available Stage 3–7 reports, the earlier supplied architecture prompt, installed Next.js route-handler/data-security guides and the authoritative schema, authentication, contact encryption, consent, gateway, matching, workflow and email implementations. Completed Stage 1/2 reports and separate architecture plans were not present in the workspace; no claim is made that missing documents were read.

All 102 existing Node tests passed before editing. No dependency was added or upgraded: Node 24.14.0, Next 16.4.0, React 19.3.0, Prisma/client/SQLite adapter 7.10.0, Better Auth 1.7.7, Zod 4.6.5, Gemini SDK 2.28.0, Resend 6.32.1, Playwright 1.64.0 and axe 4.13.0 remain pinned. No legacy content, configuration or secrets were copied.

Read-only legacy metadata was measured before and after: 157 files excluding dependencies/Git/generated Next caches, SHA-256 `361cfd10c7cdd093f0db7c0441b2fc192dd0869d15179927f12924266415d369` over sorted relative path/size/mtime entries. The root lockfile remains 88 bytes at its original mtime. The sibling remains untracked in the parent repository; no Git mutation, branch, commit or index write occurred.

## Files and database changes

| Paths | Changes |
| --- | --- |
| prisma/schema.prisma; prisma/migrations/sqlite/202610100004_stage8/migration.sql | Three additive tables, relations, indexes, CHECK constraints and evidence/lifecycle/context triggers |
| src/domain/chat.ts | Strict bounded commands, allowlisted operations, encrypted content contracts and public DTOs |
| src/server/chat.ts | Ownership, encrypted persistence, leases, tools, proposals, atomic confirmation and minimal receipts |
| src/server/transaction.ts; src/server/profiles.ts; src/server/workflows.ts; src/server/email/service.ts | Internal optional transaction composition; existing domain validation/audits retained; shared local draft template and scoped draft read |
| src/server/ai-gateway.ts; src/server/security.ts | CHAT summary in sole gateway, paired CHAT/EXPLANATION checks and bounded shared chat rate limit |
| src/app/api/workspace/[...path]/route.ts; src/app/(workspace)/chat/page.tsx | Authenticated same-origin strict API and persistent protected page |
| src/components/chat-live.tsx; src/components/shell.tsx; src/app/globals.css | Live conversation controls, separate evidence, exact review, recovery and responsive token-based styles |
| src/components/demo-controls.tsx; src/components/settings.tsx; src/components/profile-detail.tsx | Chat dependent counts and accurate deletion disclosure |
| tests/stage8-security.test.ts; tests/stage8.spec.ts; tests/shell.spec.ts; tests/stage6.spec.ts; tests/stage7.spec.ts; tests/global-setup.ts | Security/integration/browser coverage, updated live route expectation, removal of scripted chat from the live route and bounded foreground browser setup |
| package.json; README.md; AGENTS.md; docs/chat-tools.md; this report | Test command, current scope, operation/retention/configuration documentation |
| .gitignore; eslint.config.mjs; tsconfig.json | Exclude moved failed generated Next cache after OneDrive EPERM |

`ChatConversation` holds owner, encrypted title, REAL/DEMO kind, immutable context, active/archive state, revision and ordered sequence allocation. `ChatMessage` holds encrypted user/tool/assistant content, unique request identity, sequence, origin/task/status and response lease token. `ChatProposal` holds encrypted frozen operation, digest, request identity, lifecycle/revision/expiry, confirmation actor/time/revision and minimal execution receipt. Foreign keys delete chat when its bound profile is deleted, and delete messages/proposals when their conversation is deleted; there is no cascade from chat into business records.

The reviewed SQL creates only these three tables and their constraints/indexes/triggers. Existing tables and migrations were not replaced. The guarded migration applied only `202610100004_stage8` to the owned main database. Four migrations are complete; twelve business/chat tables have zero rows and `foreign_key_check` has zero violations. Main operator setup remains pending; no account or demo/customer data was inserted into it.

## Security and architecture

Every service independently authenticates and every conversation lookup filters owner ID. All API mutations retain existing same-origin JSON/32-KiB enforcement. UUIDs, revisions, pagination, content and tools use strict schemas. Clients cannot supply actor, arbitrary target, SQL, tool implementation, delivery state or provider content. The single-operator workspace authorizes existing profile services; the conversation additionally limits targets and REAL/DEMO classification.

Typed tasks cover notes, literal profile lookup, selected profile summary, current eligible ranking, fresh pair comparison and recorded assessment explanation. Stored facts/tool evidence and local/Gemini interpretation are visibly separate. Model output never selects or executes actions. Unsupported tasks fail honestly. All text renders as text, with bounded wrapping and no arbitrary HTML.

Gemini remains inside the existing gateway. CHAT permission is required for source summaries; both CHAT and EXPLANATION are required for pair interpretation. Pre-call, post-call, pre-persistence and historical-read checks prevent stale grants from exposing interpretations after withdrawal. Only canonical age/enums/counts/preferences or existing numeric assessment factors leave the server. Transcript, imported instructions, private contacts, names, IDs, arbitrary strings and secrets remain local. Provider absence/error/timeout/invalid output returns an explicitly local fallback. All tests use fakes.

Proposals capture server-derived targets, exact before/after content and expected resource revision. `PROPOSED → AWAITING_CONFIRMATION → CONFIRMED → EXECUTED` is recorded with audits; confirmation requires exact revision/digest and explicit interface literal. Revisions require new review. Rejection, cancellation, expiry and failure cannot execute. Existing domain mutation, confirmation audits and execution receipt commit atomically; rollback leaves no partial business change. Exact repeated confirmation returns its receipt. CONFIRMED is an intermediate transaction state, never a background execution queue.

The chat allowlist excludes match approval, email approval and dispatch. Draft create/edit calls the existing encrypted service and requires the existing current human-approved workflow. Exact local draft content is reviewed before creation. Existing unsent-approval cancellation and accepted-evidence immutability are preserved. No provider call occurs during proposal execution.

Encryption reuses the existing AES-GCM key with per-record chat namespaces. Key canaries reject missing/replaced keys before new writes. Audits omit transcripts and values. Message requests reserve durable ordered evidence before read-only work, use thirty-second token-bound leases and permit explicit recovery; old responses cannot overwrite reclaimed leases. Conversation/history/proposals are paginated and capped. Archive preserves history/cancels pending proposals; explicit whole-chat deletion leaves all business evidence intact. Profile-linked demo deletion/reset remains classification isolated and snapshot bound.

## Verification

Stage 8 verification is complete. All final required checks passed.

- Initial Stage 8 integration run: 22/25 passed; fixed a nested workflow-read transaction, then 25/25 passed.
- Combined regression run after the fix: 127/127 passed. Final expanded run: **130/130 passed**, zero failures/skips, 65.339 seconds (102 earlier tests plus 28 Stage 8 tests).
- Production build: passed after replacing a test-only untyped SQLite import with Node's built-in SQLite and moving aside a failed OneDrive generated cache. Initial retry returned EPERM; no application data was deleted or reset.
- Final `npm run typecheck`, `npm run lint` and `npm run build`: passed after the additional tests and final UI fixes.
- Two harness starts were interrupted before completion to bound setup waits and correct an encoded test label; no successful result is claimed for those starts.
- Initial completed full browser run: 31/36 passed. One 30-second workflow timeout prevented cleanup; three later workflow selectors matched leftover identically named fixtures. The chat transport-error check also matched Next's empty route-announcer alert. Added bounded 90-second workflow/email allowances, unique workflow fixture names and a scoped chat alert selector. Added a fourth chat-to-Email browser flow and mobile exact review; final fresh-database run: **37/37 passed in 7.1 minutes**.
- Final browser coverage includes four chat flows (persistence/rename/archive/reopen/delete and HTML injection; exact keyboard profile confirmation/replay plus dark 320px review; honest loading/transport error/reload recovery; confirmed draft create/edit checked in the real Email workspace with zero deliveries). All 56 route/theme/viewport combinations at 1440/768/390/320px passed with zero axe violations, overflow, page errors or external requests. Reviewed current 320px light chat, 768px dark chat, desktop exact review and 320px dark exact review screenshots.
- Built client scan: 25 JavaScript chunks, zero occurrences of the configured auth secret, setup token or encryption key values. Values were not printed.

Node verification command:

```powershell
node --conditions=react-server --import tsx --test tests/security.test.ts tests/matching.test.ts tests/stage5-security.test.ts tests/workflow.test.ts tests/stage6-security.test.ts tests/email.test.ts tests/stage7-security.test.ts tests/stage8-security.test.ts
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The 28 Stage 8 checks cover all service/HTTP authentication, owner isolation and manipulated context, strict bodies/CSRF/bounds, ordering/pagination/request dedupe, encryption/audit exclusion, minimized mocked Gemini with missing/granted/withdrawn consent, injection/invalid outputs/timeouts, strict deal-breakers, active and reclaimed leases, explicit interrupted retry, exact concurrent confirmation, revisions/digests, reject/cancel/expire, stale targets, atomic fault-injected rollback, workflow gates, encrypted draft reuse, unsent approval invalidation, archive/delete/profile cascade/demo isolation, replaced keys and session revocation. The preserved earlier suites also verify accepted-email immutability and delivery idempotency.

## Configuration and limitations

No environment variable or new secret is required. Existing ignored `.env.local` remains unchanged. Apply the guarded migration, retain the original key/identifier, build/start locally, then use the existing setup/login. Optional Gemini requires explicit existing configuration and current customer evidence; configuration is not live verification. No live email or customer data was used in tests.

Restored the owned production-mode loopback preview at `http://127.0.0.1:3100`. Main `/setup` returns 200 with setup ready, anonymous `/chat` emits Next's streamed login redirect, and anonymous `/api/workspace/chat` returns 401. Final main business/chat counts remain zero, all four migrations are complete, foreign-key violations remain zero, the 157-file legacy metadata hash/root lockfile metadata still match preflight, and the final 25 client chunks contain zero configured private-secret value hits.

Scope is intentionally narrow: message text does not drive an arbitrary natural-language agent; profile editing supports three fields; context is fixed; lists are bounded; workflow selection initially shows twenty existing workflows. No automatic model/tool retry, background jobs, scheduled retention, multi-key rotation or lost-key recovery exists. Rate exhaustion after a durable turn claim can leave interrupted evidence; reload and retry explicitly after the lease. Transport errors require reload to resolve ambiguity. Archived/historical facts are snapshots. Context-free DEMO notes require manual deletion; other historical profile lookup facts remain encrypted until conversation deletion, with missing-link tool results withheld. Read [chat-tools.md](chat-tools.md) for the complete contract.
