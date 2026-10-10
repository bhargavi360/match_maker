-- Additive email intent ledger. No existing table or data is replaced.
CREATE TABLE "EmailDraft" (
 "id" TEXT NOT NULL PRIMARY KEY, "workflowId" TEXT NOT NULL, "recipientProfileId" TEXT NOT NULL,
 "decisionId" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1 CHECK("revision">0),
 "ciphertext" TEXT NOT NULL, "keyId" TEXT NOT NULL, "provenance" TEXT NOT NULL DEFAULT 'LOCAL_TEMPLATE' CHECK("provenance" IN ('LOCAL_TEMPLATE','MANUAL')),
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY("recipientProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmailDraft_workflowId_updatedAt_idx" ON "EmailDraft"("workflowId","updatedAt");
CREATE TABLE "EmailDelivery" (
 "id" TEXT NOT NULL PRIMARY KEY, "draftId" TEXT, "originalDraftId" TEXT NOT NULL, "draftRevision" INTEGER NOT NULL CHECK("draftRevision">0),
 "workflowId" TEXT NOT NULL, "recipientProfileId" TEXT NOT NULL, "decisionId" TEXT NOT NULL, "snapshotId" TEXT NOT NULL,
 "payloadCiphertext" TEXT NOT NULL, "keyId" TEXT NOT NULL, "payloadDigest" TEXT NOT NULL CHECK(length("payloadDigest")=64),
 "approvedBy" TEXT NOT NULL, "approvedAt" DATETIME NOT NULL, "expiresAt" DATETIME NOT NULL CHECK("expiresAt">"approvedAt"),
 "state" TEXT NOT NULL DEFAULT 'APPROVED' CHECK("state" IN ('APPROVED','DISPATCHING','UNKNOWN','ACCEPTED','DELIVERY_DELAYED','DELIVERED','BOUNCED','SUPPRESSED','FAILED','COMPLAINED','REJECTED','CANCELLED','EXPIRED')),
 "revision" INTEGER NOT NULL DEFAULT 1 CHECK("revision">0), "providerMessageId" TEXT, "idempotencyKey" TEXT NOT NULL,
 "attemptCount" INTEGER NOT NULL DEFAULT 0 CHECK("attemptCount">=0), "firstAttemptAt" DATETIME, "retryUntil" DATETIME,
 "retryBlocked" BOOLEAN NOT NULL DEFAULT false, "transportKeyDigest" TEXT, "leaseToken" TEXT, "leaseUntil" DATETIME, "evidenceAt" DATETIME, "evidenceType" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY("draftId") REFERENCES "EmailDraft"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
 CHECK(("leaseToken" IS NULL)=("leaseUntil" IS NULL)),
 CHECK(("firstAttemptAt" IS NULL)=("retryUntil" IS NULL)),
 CHECK("idempotencyKey"='matchmaker-email/'||"id")
);
CREATE UNIQUE INDEX "EmailDelivery_providerMessageId_key" ON "EmailDelivery"("providerMessageId");
CREATE UNIQUE INDEX "EmailDelivery_idempotencyKey_key" ON "EmailDelivery"("idempotencyKey");
CREATE INDEX "EmailDelivery_workflowId_createdAt_idx" ON "EmailDelivery"("workflowId","createdAt");
CREATE INDEX "EmailDelivery_originalDraftId_draftRevision_idx" ON "EmailDelivery"("originalDraftId","draftRevision");
-- A consumed revision can never become a second email. Expired/cancelled approvals with no attempt can be reviewed again.
CREATE UNIQUE INDEX "EmailDelivery_live_revision" ON "EmailDelivery"("originalDraftId","draftRevision") WHERE "state" NOT IN ('CANCELLED','EXPIRED');
CREATE TABLE "EmailSendAttempt" (
 "id" TEXT NOT NULL PRIMARY KEY, "deliveryId" TEXT NOT NULL, "number" INTEGER NOT NULL CHECK("number">0),
 "operationId" TEXT NOT NULL, "startedAt" DATETIME NOT NULL, "finishedAt" DATETIME,
 "outcome" TEXT NOT NULL DEFAULT 'PENDING' CHECK("outcome" IN ('PENDING','ACCEPTED','REJECTED','UNKNOWN')),
 "providerMessageId" TEXT, "errorCode" TEXT,
 FOREIGN KEY("deliveryId") REFERENCES "EmailDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailSendAttempt_operationId_key" ON "EmailSendAttempt"("operationId");
CREATE UNIQUE INDEX "EmailSendAttempt_deliveryId_number_key" ON "EmailSendAttempt"("deliveryId","number");
CREATE TABLE "EmailProviderEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "providerMessageId" TEXT NOT NULL, "type" TEXT NOT NULL,
 "source" TEXT NOT NULL CHECK("source" IN ('WEBHOOK','RECONCILIATION')),
 "occurredAt" DATETIME NOT NULL, "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deliveryId" TEXT, "deliveryTag" TEXT, "evidenceDigest" TEXT NOT NULL,
 FOREIGN KEY("deliveryId") REFERENCES "EmailDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EmailProviderEvent_providerMessageId_occurredAt_idx" ON "EmailProviderEvent"("providerMessageId","occurredAt");
CREATE INDEX "EmailProviderEvent_deliveryTag_idx" ON "EmailProviderEvent"("deliveryTag");
CREATE TRIGGER "EmailDraft_pair_insert" BEFORE INSERT ON "EmailDraft" BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM "Workflow" w JOIN "MatchDecision" m ON m."workflowId"=w."id"
 WHERE w."id"=NEW."workflowId" AND w."status"='MATCH_APPROVED' AND m."id"=NEW."decisionId" AND m."type"='APPROVED'
 AND w."snapshotId"=NEW."snapshotId" AND m."snapshotId"=NEW."snapshotId"
 AND NEW."recipientProfileId" IN (w."sourceId",w."candidateId")
 AND m."sequence"=(SELECT MAX("sequence") FROM "MatchDecision" WHERE "workflowId"=w."id"))
 THEN RAISE(ABORT,'email draft requires the current approved pair') END;
END;
CREATE TRIGGER "EmailDraft_binding_immutable" BEFORE UPDATE ON "EmailDraft" WHEN
 NEW."id" IS NOT OLD."id" OR NEW."workflowId" IS NOT OLD."workflowId" OR NEW."recipientProfileId" IS NOT OLD."recipientProfileId"
 OR NEW."decisionId" IS NOT OLD."decisionId" OR NEW."snapshotId" IS NOT OLD."snapshotId" OR NEW."createdAt" IS NOT OLD."createdAt"
 BEGIN SELECT RAISE(ABORT,'email draft binding is immutable'); END;
CREATE TRIGGER "EmailDelivery_binding_insert" BEFORE INSERT ON "EmailDelivery" BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM "EmailDraft" d WHERE d."id"=NEW."draftId" AND d."id"=NEW."originalDraftId"
 AND d."workflowId"=NEW."workflowId" AND d."revision"=NEW."draftRevision" AND d."recipientProfileId"=NEW."recipientProfileId"
 AND d."decisionId"=NEW."decisionId" AND d."snapshotId"=NEW."snapshotId") THEN RAISE(ABORT,'email delivery requires its exact draft') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM "EmailDelivery" WHERE "recipientProfileId"=NEW."recipientProfileId" AND "state" IN ('UNKNOWN','DISPATCHING'))
 THEN RAISE(ABORT,'unresolved delivery blocks a replacement') END;
END;
CREATE TRIGGER "EmailDelivery_snapshot_immutable" BEFORE UPDATE ON "EmailDelivery" WHEN
 NEW."id" IS NOT OLD."id" OR NEW."originalDraftId" IS NOT OLD."originalDraftId" OR NEW."draftRevision" IS NOT OLD."draftRevision"
 OR NEW."workflowId" IS NOT OLD."workflowId" OR NEW."recipientProfileId" IS NOT OLD."recipientProfileId" OR NEW."decisionId" IS NOT OLD."decisionId"
 OR NEW."snapshotId" IS NOT OLD."snapshotId" OR NEW."payloadCiphertext" IS NOT OLD."payloadCiphertext" OR NEW."keyId" IS NOT OLD."keyId"
 OR NEW."payloadDigest" IS NOT OLD."payloadDigest" OR NEW."approvedBy" IS NOT OLD."approvedBy" OR NEW."approvedAt" IS NOT OLD."approvedAt"
 OR NEW."expiresAt" IS NOT OLD."expiresAt" OR NEW."idempotencyKey" IS NOT OLD."idempotencyKey" OR NEW."createdAt" IS NOT OLD."createdAt"
 OR (NEW."draftId" IS NOT OLD."draftId" AND NEW."draftId" IS NOT NULL)
 OR (OLD."providerMessageId" IS NOT NULL AND NEW."providerMessageId" IS NOT OLD."providerMessageId")
 OR (OLD."firstAttemptAt" IS NOT NULL AND (NEW."firstAttemptAt" IS NOT OLD."firstAttemptAt" OR NEW."retryUntil" IS NOT OLD."retryUntil"))
 OR NEW."attemptCount"<OLD."attemptCount"
 OR (OLD."transportKeyDigest" IS NOT NULL AND NEW."transportKeyDigest" IS NOT OLD."transportKeyDigest")
 BEGIN SELECT RAISE(ABORT,'approved email snapshot and idempotency identity are immutable'); END;
CREATE TRIGGER "EmailDelivery_no_delete" BEFORE DELETE ON "EmailDelivery" BEGIN SELECT RAISE(ABORT,'retain email delivery ledger'); END;
CREATE TRIGGER "EmailAttempt_no_delete" BEFORE DELETE ON "EmailSendAttempt" BEGIN SELECT RAISE(ABORT,'retain email attempt evidence'); END;
CREATE TRIGGER "EmailAttempt_identity_immutable" BEFORE UPDATE ON "EmailSendAttempt" WHEN
 NEW."id" IS NOT OLD."id" OR NEW."deliveryId" IS NOT OLD."deliveryId" OR NEW."number" IS NOT OLD."number" OR NEW."operationId" IS NOT OLD."operationId" OR NEW."startedAt" IS NOT OLD."startedAt"
 OR OLD."finishedAt" IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'retain immutable completed email attempt'); END;
CREATE TRIGGER "EmailEvent_no_delete" BEFORE DELETE ON "EmailProviderEvent" BEGIN SELECT RAISE(ABORT,'retain verified email evidence'); END;
CREATE TRIGGER "EmailEvent_evidence_immutable" BEFORE UPDATE ON "EmailProviderEvent" WHEN
 NEW."id" IS NOT OLD."id" OR NEW."providerMessageId" IS NOT OLD."providerMessageId" OR NEW."type" IS NOT OLD."type" OR NEW."source" IS NOT OLD."source"
 OR NEW."occurredAt" IS NOT OLD."occurredAt" OR NEW."receivedAt" IS NOT OLD."receivedAt" OR NEW."deliveryTag" IS NOT OLD."deliveryTag" OR NEW."evidenceDigest" IS NOT OLD."evidenceDigest"
 OR (OLD."deliveryId" IS NOT NULL AND NEW."deliveryId" IS NOT OLD."deliveryId")
 BEGIN SELECT RAISE(ABORT,'verified email evidence is immutable'); END;
