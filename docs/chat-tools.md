# Persistent internal chat

Stage 8 uses the existing authenticated workspace, SQLite, contact encryption key, Gemini gateway, matching engine, workflow rules and email draft service. It adds no provider, scheduler or customer portal.

Open `/chat`, create a titled REAL or DEMO conversation and optionally bind an active source, candidate, workflow and saved draft. Context cannot be reassigned later. Local notes and literal profile search work without a selected source. Saved conversations can be renamed, archived, reopened or permanently deleted with `DELETE CONVERSATION`.

| Explicit task | Authoritative behavior |
| --- | --- |
| Local note | Saves text; invokes no application lookup or mutation |
| Find profiles | Existing literal search, active profiles in the conversation classification, up to ten links |
| Summarize source | Stored profile facts/preferences, separate optional Gemini interpretation |
| Find eligible matches | Existing matching engine and strict rules; ten results, heuristic scores and completeness |
| Compare pair | Existing fresh pair assessment; no workflow or decision created |
| Explain assessment | Recorded workflow evidence when bound, otherwise fresh pair evidence; separate optional interpretation; stale recorded evidence disables Gemini |

Message text is an untrusted local note. The selected typed task determines the service call. Gemini cannot select tools or targets. Unsupported requests are not interpreted as success. HTML is displayed as plain text.

## Reviewable changes

The only operations are editing a selected profile's display name, occupation or biography; navigating the exact saved workflow to an existing step; creating a local introduction draft for its human-approved pair; and revising the selected draft or latest draft created through this conversation. The server derives target IDs and captures current revisions and exact before/after content. Full profile replacement data is derived from the existing profile schema, never supplied by the browser.

Creation records `PROPOSED → AWAITING_CONFIRMATION`. Review shows the operation, target, expected domain revision and exact changes. The checkbox and Confirm reviewed change button submit the exact proposal revision, SHA-256 payload digest and explicit confirmation literal. Conversational agreement has no effect. Revision changes require fresh review. Proposals expire after fifteen minutes; rejection, cancellation, failure and expiry are terminal. Archiving cancels pending proposals.

Execution authenticates again and rechecks ownership, active conversation, immutable context, current target revision and existing business gates. It runs the existing profile/workflow/email service inside the same transaction as CONFIRMED/EXECUTED audits, domain mutation and minimal receipt. A completion failure rolls all of those back and records a separate sanitized FAILED result when possible. Repeated exact confirmations return the original receipt. Match approval, email approval and dispatch are absent from this allowlist. Email remains subject to Stage 7's frozen approval, separate dispatch, current authorization and delivery idempotency. Editing a draft cancels unsent approval through the existing service; accepted evidence remains immutable.

## Privacy and model boundary

Titles, messages, tool results and complete proposals use existing AES-256-GCM with separate `chat-title:`, `chat-message:` and `chat-proposal:` record bindings and the existing key identifier. Audits contain action, actor, IDs, task, revisions and outcome, never transcript or proposed values. Request digests support deduplication; they are not substitutes for encryption.

Optional source summaries require current CHAT permission. Pair interpretation requires CHAT and EXPLANATION for both customers. Checks occur before and after provider access and again before persistence; saved Gemini text is hidden when current permission is withdrawn. Local authorized access does not imply permission to send data externally.

The sole gateway receives temporary aliases, canonical age/goal/lifestyle/preference enums and interest/value counts for summaries; pair explanations use its existing numeric assessment contract. It never receives names, IDs, contacts, biographies, arbitrary profile strings, the user message, query transcript, other conversations or secrets. Structured output is validated; generated code, SQL and tool calls are never executed. Existing eight-second deadline, response bounds and AI request budget apply. Missing configuration, permission, invalid output, timeout and provider errors give a labeled local fallback. Configuration is optional and unchanged; live Gemini is unverified.

## Persistence, recovery and retention

Each turn reserves ordered USER/TOOL/ASSISTANT entries before the read-only task. A request UUID is bound to its exact input. Completed duplicates return stored evidence. A thirty-second lease and unique lease token prevent simultaneous processing and late-response replacement. Interrupted responses preserve the user message and expose explicit retry after the lease; failed tasks can be retried as new read-only requests. There is no automatic retry or background worker. Rate limiting can leave a saved processing request until the lease expires; reload and explicitly retry. After a transport error, reload saved state before sending again to resolve an ambiguous outcome.

Retrieval is bounded: twenty conversations, thirty messages and twenty proposals per page; maximum two hundred conversations per operator, one thousand turns and two hundred proposals per conversation. Individual evidence rows are immutable or lifecycle constrained by SQLite triggers. Whole conversation deletion cascades only its messages and proposals, never profiles, workflows or email evidence.

Deleting a bound source/candidate deletes linked conversations through one-way foreign keys. Demo reset counts and removes profile-linked DEMO chat while preserving REAL chat. Context-free DEMO notes have no profile dependency and require manual deletion. Archival preserves encrypted history. Other historical profile lookup results remain encrypted until conversation deletion; missing profile links cause the old tool result to be withheld. Existing facts are historical snapshots rather than automatic live updates. There is no scheduled retention policy, encrypted key rotation, lost-key recovery, arbitrary natural-language agent, automatic pagination through all matches, or new contact-edit tool. Retain the original encryption key and identifier.
