# Tenant Isolation Ownership Matrix

**Decision:** A private workspace is anchored directly by the authenticated `User.id`. This is a one-user-per-workspace model; no client-supplied owner identifier is accepted. Roots store an owner foreign key, and dependent rows derive ownership through their parent instead of copying owner IDs.

**Legacy mapping evidence (read-only inspection, 2026-10-10):** The configured database has one `BOOTSTRAP_COMPLETED` audit event whose actor exists in `User`; that user is the initial bootstrap account. The latest read-only inventory has two users and three profiles. Each profile has exactly one `PROFILE_CREATED` audit by a distinct existing account actor (the current profiles include records attributable to both accounts). This per-profile audit is the backfill source; ownership is not assigned globally to bootstrap. The singleton settings initialization event belongs to the bootstrap account, so the existing settings row maps to that owner; other existing accounts receive default private settings. Existing workflows, snapshots, decisions, email drafts/deliveries/attempts/provider events, and chat records are zero. A consistent SQLite backup of the current pre-migration database was created and verified; see `PROJECT_WORKFLOW_AUDIT.md`.

| Model | Current relation | Intended owner | Read/mutation enforcement |
|---|---|---|---|
| `User` | Identity root | Self | Authentication resolves only the current session user; no owner supplied by client. |
| `Account`, `Session` | `userId -> User` | Related user | Better Auth credential/session APIs; retain existing account/session IDs and hashes. |
| `Verification` | Identifier string; verification-email flow not implemented | Identity system; future verification must bind to account email | Not exposed through workspace API. Do not use as workspace data. |
| `SystemState` | Singleton | Global operator/system | Setup and maintenance only; never expose as tenant data. |
| `RateLimitBucket` | Global bucket key | Global security control | Deliberately shared atomic limits; does not contain profile/workspace content. |
| `AppSettings` | `ownerId -> User`, unique | Same row owner | Resolve/update by authenticated owner and settings revision. One defaults row per account. |
| `Profile` | `ownerId -> User`; tenant migration adds this FK | `ownerId -> User` | Scope every list, source, search, lookup, write, archive, delete, seed, and reset by actor ID. |
| `ProfileContact` | `profileId -> Profile` | Parent profile | Resolve parent with owner filter before decrypt/read/write; child ownership derives from profile. |
| `PartnerPreference` | `profileId -> Profile` | Parent profile | Query through owned profile; write only after owner-filtered profile revision claim. |
| `ProfileConsent` | `profileId -> Profile` | Parent profile | Query through owned profile; consent checks must be actor-scoped. |
| `AuditEvent` | `actorId` scalar, optional `entityId` | `actorId -> User` for user events; provider evidence derives through delivery | Dashboard/audit visibility filters by actor. System/provider events with no actor are not user-readable. |
| `Workflow` | `sourceId/candidateId -> Profile` | Source profile owner | Filter via `source.ownerId`; candidate and source must have the same owner. Child assessments/decisions derive through workflow. |
| `AssessmentSnapshot` | `workflowId -> Workflow`; profile IDs stored | Parent workflow | Always fetch through an owned workflow; validate candidate/source against owned workflow before creation/use. |
| `MatchDecision` | `workflowId/snapshotId -> Workflow/Snapshot`; actor ID | Parent workflow | Owned workflow required for all history and transitions; actor must be current authenticated user. |
| `EmailDraft` | `workflowId`, recipient profile | Parent workflow | Owned workflow and same-owner recipient required for list/read/edit/preview/approval. |
| `EmailDelivery` | Workflow/draft/recipient references | Parent workflow | Owned workflow required for preview, approval, dispatch, cancellation and reconciliation. |
| `EmailSendAttempt` | `deliveryId -> EmailDelivery` | Parent delivery | Never exposed except in an owner-authorized delivery view. |
| `EmailProviderEvent` | Optional `deliveryId`, provider ID/tag | Linked delivery; unmatched events remain unowned | Webhook signature remains provider auth; lookup/update must bind exact delivery using verified provider evidence, never client owner input. User reads go through owned delivery. |
| `ChatConversation` | Existing `ownerId -> User`; profile/workflow/draft context IDs | Existing owner | Keep owner-filtered list/get/mutate and also validate every linked context belongs to the same owner. |
| `ChatMessage` | `conversationId -> ChatConversation` | Parent conversation | Conversation owner check before list, retry, or mutation. |
| `ChatProposal` | `conversationId -> ChatConversation` | Parent conversation | Conversation owner check and revalidate target record ownership at execution. |

## Migration and rollback plan

1. Preserve the pre-migration SQLite backup and verify its `integrity_check`, foreign keys, migration ledger, and per-table row counts. Do not overwrite or delete it.
2. The additive SQLite migration must fail closed unless exactly one valid bootstrap actor exists, every current profile has exactly one `PROFILE_CREATED` audit by a valid user, settings initialization is attributed to bootstrap, and pre-existing workflow/snapshot/email/chat links do not cross the owners derived from profile creation audits. Backfill each profile to its recorded creator and singleton settings to bootstrap. Child profile data stays attached by existing profile foreign keys. Every newly registered account starts with empty owned profile data and its own settings row.
3. Rebuild only tables required to add the owner foreign keys and remove singleton constraints, copying IDs and all existing columns unchanged. Recreate every affected index and handwritten trigger. Keep account, credential, session, encrypted values, timestamps, audits, email evidence, and chat rows intact.
4. Before making the new application available, run migration deploy against the configured owned DB, then verify row counts/IDs, old account/session/password rows, ownership assignment counts, `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and migration checksums.
5. Rollback is restore-from-backup only: stop application writes, preserve the post-migration DB separately for investigation, restore the verified pre-migration SQLite backup as the configured DB, and restart the previous code version. Do not attempt reverse SQL after tenant-scoped writes have started, because new user-owned records cannot be represented safely by the old singleton schema. Preserve the existing contact encryption key and key ID throughout.
