-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sourceId" TEXT,
    "candidateId" TEXT,
    "workflowId" TEXT,
    "draftId" TEXT,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('REAL','DEMO')),
    "titleCiphertext" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("state" IN ('ACTIVE','ARCHIVED')),
    "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
    "nextSequence" INTEGER NOT NULL DEFAULT 1 CHECK ("nextSequence" > 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatConversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatConversation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatConversation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
    "requestId" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "role" TEXT NOT NULL CHECK ("role" IN ('USER','TOOL','ASSISTANT')),
    "origin" TEXT NOT NULL DEFAULT 'LOCAL' CHECK ("origin" IN ('LOCAL','TOOL','GEMINI')),
    "status" TEXT NOT NULL DEFAULT 'PROCESSING' CHECK ("status" IN ('PROCESSING','COMPLETED','FAILED')),
    "task" TEXT NOT NULL CHECK ("task" IN ('NOTE','SEARCH','PROFILE','MATCHES','COMPARE','EXPLANATION')),
    "ciphertext" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "leaseUntil" DATETIME,
    "leaseToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('PROFILE_EDIT','WORKFLOW_NAVIGATE','DRAFT_CREATE','DRAFT_EDIT')),
    "ciphertext" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED' CHECK ("state" IN ('PROPOSED','AWAITING_CONFIRMATION','CONFIRMED','EXECUTED','REJECTED','FAILED','EXPIRED','CANCELLED')),
    "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
    "expiresAt" DATETIME NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" DATETIME,
    "confirmedRevision" INTEGER,
    "executedAt" DATETIME,
    "result" JSONB,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChatConversation_ownerId_state_updatedAt_id_idx" ON "ChatConversation"("ownerId", "state", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "ChatConversation_sourceId_idx" ON "ChatConversation"("sourceId");

-- CreateIndex
CREATE INDEX "ChatConversation_candidateId_idx" ON "ChatConversation"("candidateId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_sequence_idx" ON "ChatMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_sequence_key" ON "ChatMessage"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_requestId_role_key" ON "ChatMessage"("conversationId", "requestId", "role");

-- CreateIndex
CREATE INDEX "ChatProposal_conversationId_createdAt_id_idx" ON "ChatProposal"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatProposal_state_expiresAt_idx" ON "ChatProposal"("state", "expiresAt");

CREATE TRIGGER "chat_context_binding" BEFORE INSERT ON "ChatConversation"
WHEN (NEW."candidateId" IS NOT NULL AND (NEW."sourceId" IS NULL OR NEW."candidateId" = NEW."sourceId"))
 OR (NEW."sourceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" WHERE "id"=NEW."sourceId" AND "kind"=NEW."kind"))
 OR (NEW."candidateId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" WHERE "id"=NEW."candidateId" AND "kind"=NEW."kind"))
 OR (NEW."workflowId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Workflow" WHERE "id"=NEW."workflowId" AND "sourceId"=NEW."sourceId" AND "candidateId" IS NEW."candidateId"))
 OR (NEW."draftId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "EmailDraft" WHERE "id"=NEW."draftId" AND "workflowId"=NEW."workflowId"))
BEGIN SELECT RAISE(ABORT,'Invalid chat context'); END;

CREATE TRIGGER "chat_context_immutable" BEFORE UPDATE ON "ChatConversation"
WHEN NEW."ownerId"<>OLD."ownerId" OR NEW."sourceId" IS NOT OLD."sourceId" OR NEW."candidateId" IS NOT OLD."candidateId"
 OR NEW."workflowId" IS NOT OLD."workflowId" OR NEW."draftId" IS NOT OLD."draftId" OR NEW."kind"<>OLD."kind" OR NEW."keyId"<>OLD."keyId"
 OR NEW."revision"<>OLD."revision"+1 OR NEW."nextSequence"<OLD."nextSequence"
BEGIN SELECT RAISE(ABORT,'Immutable chat context or invalid revision'); END;

CREATE TRIGGER "chat_message_identity" BEFORE UPDATE ON "ChatMessage"
WHEN NEW."conversationId"<>OLD."conversationId" OR NEW."sequence"<>OLD."sequence" OR NEW."requestId"<>OLD."requestId"
 OR NEW."requestDigest"<>OLD."requestDigest" OR NEW."role"<>OLD."role" OR NEW."task"<>OLD."task" OR NEW."keyId"<>OLD."keyId"
 OR OLD."status" IN ('COMPLETED','FAILED')
BEGIN SELECT RAISE(ABORT,'Immutable completed chat evidence'); END;

CREATE TRIGGER "chat_message_delete" BEFORE DELETE ON "ChatMessage"
WHEN EXISTS (SELECT 1 FROM "ChatConversation" WHERE "id"=OLD."conversationId")
BEGIN SELECT RAISE(ABORT,'Delete the owned conversation, not individual evidence'); END;

CREATE TRIGGER "chat_proposal_transition" BEFORE UPDATE ON "ChatProposal"
WHEN NEW."conversationId"<>OLD."conversationId" OR NEW."revision"<>OLD."revision"+1 OR NEW."keyId"<>OLD."keyId" OR NEW."requestDigest"<>OLD."requestDigest"
 OR NOT ((OLD."state"='PROPOSED' AND NEW."state"='AWAITING_CONFIRMATION')
  OR (OLD."state"='AWAITING_CONFIRMATION' AND NEW."state" IN ('PROPOSED','CONFIRMED','REJECTED','FAILED','EXPIRED','CANCELLED'))
  OR (OLD."state"='CONFIRMED' AND NEW."state" IN ('EXECUTED','FAILED')))
 OR (OLD."state"<>'AWAITING_CONFIRMATION' AND (NEW."ciphertext"<>OLD."ciphertext" OR NEW."digest"<>OLD."digest" OR NEW."kind"<>OLD."kind"))
 OR (NEW."state"<>'PROPOSED' AND (NEW."ciphertext"<>OLD."ciphertext" OR NEW."digest"<>OLD."digest" OR NEW."kind"<>OLD."kind"))
 OR (NEW."state" IN ('CONFIRMED','EXECUTED') AND (NEW."confirmedAt" IS NULL OR NEW."confirmedRevision" IS NULL OR NEW."confirmedBy" IS NOT (SELECT "ownerId" FROM "ChatConversation" WHERE "id"=NEW."conversationId") OR NEW."confirmedAt">=NEW."expiresAt"))
 OR (NEW."state"='EXECUTED' AND (NEW."executedAt" IS NULL OR NEW."result" IS NULL))
 OR (OLD."state"='CONFIRMED' AND (NEW."confirmedBy" IS NOT OLD."confirmedBy" OR NEW."confirmedAt" IS NOT OLD."confirmedAt" OR NEW."confirmedRevision" IS NOT OLD."confirmedRevision"))
BEGIN SELECT RAISE(ABORT,'Invalid chat proposal transition'); END;

CREATE TRIGGER "chat_proposal_delete" BEFORE DELETE ON "ChatProposal"
WHEN EXISTS (SELECT 1 FROM "ChatConversation" WHERE "id"=OLD."conversationId")
BEGIN SELECT RAISE(ABORT,'Delete the owned conversation, not individual evidence'); END;

