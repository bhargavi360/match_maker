# Email approval, dispatch and provider evidence

Stage 7 operates inside the authenticated single-matchmaker rebuild. Local introductions never call Gemini. EMAIL_DRAFT is an AI-processing scope; this stage does not infer send permission from it or transmit message text through the AI gateway. A current Stage 6 reviewed human match decision permits a local draft. The operator separately approves the exact outgoing message and explicitly initiates dispatch.

## Drafts and exact approval

EmailDraft binds an immutable workflow, current match decision, assessment and recipient profile. The server accepts SOURCE/CANDIDATE, resolves those roles itself, and refuses arbitrary recipients. Subject/body are AES-256-GCM encrypted under the existing contact key, with a distinct `email-draft:<id>:<key-id>` authenticated binding. Editing increments the content revision, records manual provenance and cancels only unattempted approvals. The body is plain text; LF/tab are allowed, other controls and subject header controls are refused. The limits are 200 subject characters and 10,000 body characters; text is rendered by React and sent without HTML.

The exact-review operation authenticates independently, rechecks current scoring/eligibility/profile/preference evidence through Stage 6, verifies the decision/pair/assessment, reads the current encrypted draft and resolves the recipient through the audited private-contact service. It validates bare server-configured from/reply-to addresses. It returns the exact recipient/from/reply-to/subject/body/revision to the explicit authorized email context, plus a two-minute signed preview token. That token binds actor, proposed delivery UUID, draft UUID/revision and canonical digest. It contains no address or message content.

Approval requires `APPROVE EMAIL`, the matching revision and signed preview token. The server recomputes everything inside a transaction and compares the digest. Snapshot, approval actor/time, one-hour expiry and sanitized audit commit together. Approval performs no transport call. The encrypted approved payload includes exact sending fields and IDs of its draft/revision/workflow/decision/assessment/pair. A SQLite trigger makes all these approval fields, ciphertext, key ID, digest and idempotency identity immutable. Reapproval of an expired/cancelled unattempted revision creates a new delivery UUID and approved snapshot.

The approval expiry is fixed by server policy, not by browser input. GET projects an expired approval honestly without authorizing or sending; expiry is persisted/audited on the next relevant explicit mutation. Sender, contact, draft, matching evidence or decision changes block submission. Cancel a stale unattempted approval and review a fresh snapshot; after a changed match decision, create a fresh draft. Cancellation and editing never recall accepted or uncertain submissions.

## Durable dispatch protocol

Authenticated mutations use the existing exact-origin, strict JSON and streamed 32-KiB boundary. No GET, page rendering, match approval, Gemini task or chat tool sends an email. Dispatch requires `SEND EMAIL` and current delivery revision, validated configuration, unexpired approval, current exact payload/contact/sender/match, integrity check and an available lease.

The claim transaction uses revision CAS, writes DISPATCHING, a random operation token, 30-second lease, incremented attempt number, fixed first-attempt/retry timestamps, provider-credential fingerprint, EmailSendAttempt and audit. Only after commit does the adapter make one network call. The frozen payload is submitted with plain text and a `delivery_id` tag. The key is always `matchmaker-email/<delivery-uuid>`; neither timeout nor retry creates a replacement key. The result transaction rereads current state, stores attempt outcome, associates early provider events, preserves stronger evidence, releases only its own lease and writes a sanitized audit.

The official REST adapter uses a fixed HTTPS provider host, no redirects, an eight-second abort covering response reading, 64-KiB response limit and no hidden retry. No provider base-URL environment override is honored. `MATCHMAKER_TEST_MODE=1` disables the default transport even if inherited credentials exist; injectable providers are permitted only in that mode. Dispatch and reconciliation share a global 30-request/15-minute database budget without storing IP addresses.

Resend documents **24-hour idempotency retention** and reuse of the key for identical requests. The app imposes a conservative **23-hour ceiling from the first committed attempt**, plus the stricter original one-hour approval expiry. Both must still be valid for a human-triggered same-payload retry. There are no automatic retries. Application ledger/uniqueness rules remain in effect indefinitely, beyond provider retention. [Official idempotency rules](https://resend.com/docs/dashboard/emails/idempotency-keys).

Network error, timeout, ambiguous 5xx/conflict, malformed success evidence or acceptance followed by local persistence failure produces UNKNOWN. A rejection of a retry cannot prove the original uncertain submission failed. A same-key/different-payload provider conflict permanently disables retry of that delivery. Provider credential changes after the first attempt also block retry across accounts. Once a provider identifier is bound, use retrieval/reconciliation instead of resubmission. An unresolved UNKNOWN/DISPATCHING delivery prevents replacement approval for that recipient profile, including a different draft/workflow; recipient deletion does not erase the original logical delivery/key.

If local result persistence fails, a best-effort transaction stores uncertainty. If even that fails, the original committed key, lease and PENDING attempt survive. GET projects an expired DISPATCHING lease as UNKNOWN. A subsequent explicit eligible operation recovers the lease and completes its pending attempt as UNKNOWN before further work. Late accepted responses still associate provider evidence and never regress a delivered/terminal state. Exactly-once network delivery is not claimed.

## State and evidence contract

| State | Evidence and meaning |
| --- | --- |
| APPROVED | Immutable reviewed snapshot committed; no attempt yet |
| DISPATCHING | Committed attempt with a valid short lease; outcome pending |
| UNKNOWN | Submission may have occurred; no conclusive persisted evidence, or an abandoned lease |
| ACCEPTED | Persisted successful submission UUID, verified email.sent, or exact authenticated provider retrieval of sent/queued |
| DELIVERY_DELAYED | Verified provider delay event or matched authenticated retrieval |
| DELIVERED | Verified provider delivery event or matched authenticated retrieval: recipient mail server accepted it |
| BOUNCED | Verified permanent recipient-mail-server rejection evidence |
| SUPPRESSED | Verified provider suppression evidence |
| FAILED | Verified provider sending-failure evidence; distinct from network uncertainty |
| COMPLAINED | Verified provider spam-complaint evidence |
| REJECTED | Definitive first-submission HTTP rejection; retries after an ambiguous request remain UNKNOWN |
| CANCELLED | Explicit cancellation or edit invalidation of an unattempted approval |
| EXPIRED | Unattempted approval exceeded its server expiry |

ACCEPTED does not mean delivered. DELIVERED does not mean a person read it. Copies, exports and local drafts are unsent. The supported outbound event meanings come from [Resend’s event reference](https://resend.com/docs/webhooks/event-types); opened/clicked/tracking, scheduling, inbound, domain, marketing and contact events are outside this stage.

The pure reducer is idempotent and order-aware. Terminal evidence dominates accepted/delayed progress even when progress arrives later. Between terminal webhook events, actual provider event time decides; identical timestamps use a fixed tie order: COMPLAINED, BOUNCED, SUPPRESSED, FAILED, DELIVERED. Events older than the current equally strong event cannot regress it. All contradictory/late events remain stored. Authenticated retrieval supplies last_event without an occurrence timestamp, so it cannot overwrite existing terminal evidence; its observation remains in history. Review contradictions rather than treating the displayed terminal status as proof that no other event occurred.

## Verified webhook

`POST /api/webhooks/resend` is the only unauthenticated email endpoint. It accepts at most 64 KiB and verifies the original UTF-8 raw body before parsing application fields. Header syntax/lengths are checked for svix-id, svix-timestamp and svix-signature. Resend SDK 6.32.1 calls its maintained standardwebhooks 1.1.1 verifier with the documented header mapping and secret. Its signature verifier enforces a five-minute past/future tolerance. No custom production signature algorithm is implemented. [Official raw-body/SDK verification guidance](https://resend.com/docs/webhooks/verify-webhooks-requests).

Verified payloads then pass a strict allowlisted bounded schema for seven subscribed outbound event types and documented optional tags/bounce/suppression/failure fields. Future event timestamps beyond five minutes are refused. Full raw payload, from/to/subject, bounce messages and provider errors are discarded. Persisted evidence contains unique signed event ID, provider UUID, event type/source, occurrence and receipt timestamps, optional delivery UUID/tag and a body digest for replay-conflict detection.

A new valid event and its audit/state change commit before a 200 acknowledgement. Unmatched events commit with a null delivery and can be associated when a successful API response or exact authenticated retrieval binds the provider UUID. A delivery tag alone never binds an unknown provider message. Stored event IDs deduplicate; the same ID with changed signed evidence is rejected. Stored duplicates bypass the 1,000-fresh-verified-events/minute global budget and log a sanitized deduplication audit. Invalid signatures cannot exhaust that budget. Database/audit failure gives a generic error so the provider can retry; no detailed verifier/SQL/provider exception is returned. Resend supports [provider retries and manual replay](https://resend.com/docs/webhooks/retries-and-replays); retain the event-ID ledger and correct secret.

## Manual reconciliation

No scheduler, public cron endpoint, CRON_SECRET, unawaited background task or serverless survival assumption is added. The signed-in operator explicitly chooses Reconcile provider evidence. Only attempted deliveries without a valid operation lease qualify. The transaction claims the same short lease and audits the operation before the authenticated GET. Webhook transactions can retain new evidence while that lease is active; dispatch/other reconciliations cannot acquire it.

With a known provider UUID, retrieval uses that bound identifier. Without it, find the UUID in the provider dashboard by the delivery_id tag and submit it; the browser supplies no state. The server fetches the record itself and checks UUID, from, single exact recipient, subject, plain-text body, reply-to and delivery_id. Nonempty HTML, CC or BCC fail the official response boundary. Exact authenticated matches permit association with previously verified unmatched events. Recognized last_event evidence is retained and reduced; unavailable, mismatched or unsupported results leave the outcome unchanged. [Official authenticated email retrieval, including tags/last_event](https://resend.com/docs/api-reference/emails/retrieve-email).

Keep UNKNOWN if there is no authoritative evidence. After expiry or the safe retry ceiling, no send retry is permitted. Find/retrieve provider evidence, correct configuration/permissions, or keep the unresolved record for manual investigation. A disappeared/not-found provider record does not prove nonacceptance. There is no “mark delivered/failed” override or destructive reset to force a new send. An intentional new email needs fresh content/revision, current match authorization and new exact human approval after earlier uncertainty is resolved.

## Privacy, retention and key management

Private addresses are resolved only in the authorized email/private-contact context and audited. General profile/workflow/dashboard DTOs never receive addresses or message content. The server sends no draft free text to Gemini, writes no email values to browser storage and logs no full addresses, bodies, subjects, credentials, tokens, raw errors or webhook content. Only theme preference persists in browser storage.

The existing canonical 32-byte base64 contact key and key ID protect drafts and approved snapshots with separate AES-GCM bindings and fresh nonces. Writing a draft/approval decrypts existing draft/delivery/contact canaries first: an accidental key or key-ID replacement fails visibly, including a replacement under the same ID. Restoring the original key is required; rotation, multiple-key recovery and recovery of lost keys are not implemented. Protect the original key and ignored environment file; the app does not silently regenerate them.

Confirmed profile deletion/demo reset still remove applicable editable drafts with workflow dependencies. Approved encrypted delivery snapshots, attempt history, minimal provider evidence and original IDs are retained independently, with optional draft FK set null, so uncertainty and duplicate protection cannot disappear through a cascade. Retained deliveries are discoverable in the paginated Email ledger and can be reconciled after profile deletion, but never dispatched without the original current draft/workflow/contact authorization. The deletion UI explains this exception. There is no email-ledger deletion/purge API; encrypted content and dedupe history currently have indefinite retention. A future privacy/retention policy and controlled purge/key-rotation workflow need a separately reviewed design.

## Configuration and safe operator setup

The current local app has no Resend credentials. Do not copy them from the legacy project. `.env.example` contains placeholders for RESEND_API_KEY, bare RESEND_FROM_EMAIL, optional RESEND_REPLY_TO, RESEND_WEBHOOK_SECRET and APP_ORIGIN. No secret uses NEXT_PUBLIC. APP_ORIGIN must exactly match the validated BETTER_AUTH_URL origin; HTTPS is required outside loopback. Syntax-valid configuration is labeled “configured; live delivery unverified,” not “connected” or provider-verified.

After Stage 7 review, the operator can configure their own Resend account/API key with send and authenticated retrieval permissions, verify their own sending domain, choose from/reply-to identities, and register a public HTTPS webhook at APP_ORIGIN/api/webhooks/resend. Subscribe only to email.sent, email.delivery_delayed, email.delivered, email.bounced, email.suppressed, email.failed and email.complained, and privately save its signing secret. Loopback alone is not publicly reachable for webhooks. Service/domain/webhook provisioning and production deployment are not performed by this stage. [Official send API and sender requirements](https://resend.com/docs/api-reference/emails/send-email).

Start with the rebuild’s own `/setup` and create the actual operator credentials if not already initialized. Approve a current eligible REAL pair, save the intended private recipient contact before reviewing/approving the pair, open its email workflow, create/edit/save a local draft, review the exact payload, approve, then separately review and confirm send. Use only a synthetic address you control for a deliberate live acceptance test. Inspect persisted accepted/delivery/webhook evidence and manually reconcile uncertainty; a mock result does not verify live operation.

Tests use fresh owned OS temporary SQLite databases, synthetic records, provider fakes and SDK-signed webhook fixtures. Browser tests explicitly clear provider credentials and disable live transport; configured-dialog/status tests use labeled HTTP response fixtures. No automated test may call live Resend. See the [Stage 7 completion report](stage-7-report.md) for the exact observed checks and limitations.
