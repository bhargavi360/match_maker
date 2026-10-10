PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- Fail closed unless the verified bootstrap actor uniquely owns all existing
-- profiles and the singleton settings row. This prevents arbitrary backfills.
CREATE TEMP TABLE "_tenant_ownership_guard" ("valid" INTEGER NOT NULL CHECK ("valid" = 1));
INSERT INTO "_tenant_ownership_guard" ("valid")
SELECT CASE WHEN
  ((SELECT COUNT(*) FROM "Profile") = 0 AND (SELECT COUNT(*) FROM "AppSettings") = 0)
  OR (
  (SELECT COUNT(*) FROM "AuditEvent" WHERE "action" = 'BOOTSTRAP_COMPLETED') = 1
  AND EXISTS (
    SELECT 1 FROM "User" u WHERE u."id" = (
      SELECT "actorId" FROM "AuditEvent" WHERE "action" = 'BOOTSTRAP_COMPLETED' LIMIT 1
    )
  )
  AND (SELECT COUNT(*) FROM "AppSettings") = 1
  AND EXISTS (
    SELECT 1 FROM "AuditEvent" a
    WHERE a."action" = 'SETTINGS_INITIALIZED'
      AND a."actorId" = (SELECT "actorId" FROM "AuditEvent" WHERE "action" = 'BOOTSTRAP_COMPLETED' LIMIT 1)
  )
  AND (SELECT COUNT(*) FROM "Profile") = (
    SELECT COUNT(DISTINCT a."entityId") FROM "AuditEvent" a
    JOIN "User" u ON u."id" = a."actorId"
    WHERE a."action" = 'PROFILE_CREATED' AND a."entityId" IN (SELECT "id" FROM "Profile")
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Profile" p WHERE (
      SELECT COUNT(*) FROM "AuditEvent" a JOIN "User" u ON u."id" = a."actorId"
      WHERE a."action" = 'PROFILE_CREATED' AND a."entityId" = p."id"
    ) <> 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "AuditEvent" a
    WHERE a."action" = 'PROFILE_CREATED'
      AND a."entityId" IN (SELECT "id" FROM "Profile")
      AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = a."actorId")
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Workflow" w JOIN "Profile" s ON s."id" = w."sourceId"
    JOIN "Profile" c ON c."id" = w."candidateId"
    WHERE w."candidateId" IS NOT NULL
      AND (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=s."id" LIMIT 1)
          <> (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=c."id" LIMIT 1)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "AssessmentSnapshot" s JOIN "Workflow" w ON w."id"=s."workflowId"
    WHERE s."sourceId"<>w."sourceId" OR (w."candidateId" IS NOT NULL AND s."candidateId"<>w."candidateId")
      OR (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=s."sourceId" LIMIT 1)
         <> (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=s."candidateId" LIMIT 1)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "EmailDraft" d JOIN "Workflow" w ON w."id"=d."workflowId"
    WHERE (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=w."sourceId" LIMIT 1)
       <> (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=d."recipientProfileId" LIMIT 1)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "EmailDelivery" d JOIN "Workflow" w ON w."id"=d."workflowId"
    WHERE (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=w."sourceId" LIMIT 1)
       <> (SELECT a."actorId" FROM "AuditEvent" a WHERE a."action"='PROFILE_CREATED' AND a."entityId"=d."recipientProfileId" LIMIT 1)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ChatConversation" c
    WHERE (c."sourceId" IS NOT NULL AND c."ownerId" <> (
      SELECT a."actorId" FROM "AuditEvent" a WHERE a."action" = 'PROFILE_CREATED' AND a."entityId" = c."sourceId" LIMIT 1
    )) OR (c."candidateId" IS NOT NULL AND c."ownerId" <> (
      SELECT a."actorId" FROM "AuditEvent" a WHERE a."action" = 'PROFILE_CREATED' AND a."entityId" = c."candidateId" LIMIT 1
    ))
  )
  )
THEN 1 ELSE 0 END;

DROP TRIGGER IF EXISTS "profile_kind_immutable";
DROP TRIGGER IF EXISTS "consent_kind_insert";
DROP TRIGGER IF EXISTS "consent_kind_update";
DROP TRIGGER IF EXISTS "workflow_pair_insert";
DROP TRIGGER IF EXISTS "workflow_pair_update";
DROP TRIGGER IF EXISTS "snapshot_pair_insert";
DROP TRIGGER IF EXISTS "chat_context_binding";

CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REAL',
    "demoKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "reportedAge" INTEGER,
    "ageConfirmedOn" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "education" TEXT,
    "occupation" TEXT,
    "interests" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "relationshipGoals" JSONB NOT NULL,
    "lifestyle" JSONB NOT NULL,
    "communicationStyle" TEXT,
    "bio" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("kind" IN ('REAL', 'DEMO')),
    CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CHECK ("revision" > 0),
    CHECK ("reportedAge" IS NULL OR "reportedAge" BETWEEN 18 AND 120),
    CHECK (("reportedAge" IS NULL) = ("ageConfirmedOn" IS NULL)),
    CHECK (("kind" = 'REAL' AND "demoKey" IS NULL) OR ("kind" = 'DEMO' AND "demoKey" IS NOT NULL))
);
INSERT INTO "new_Profile" (
    "id", "ownerId", "kind", "demoKey", "status", "displayName", "reportedAge", "ageConfirmedOn", "city", "region", "country", "education", "occupation", "interests", "values", "relationshipGoals", "lifestyle", "communicationStyle", "bio", "revision", "createdAt", "updatedAt"
)
SELECT p."id", a."actorId", p."kind", p."demoKey", p."status", p."displayName", p."reportedAge", p."ageConfirmedOn", p."city", p."region", p."country", p."education", p."occupation", p."interests", p."values", p."relationshipGoals", p."lifestyle", p."communicationStyle", p."bio", p."revision", p."createdAt", p."updatedAt"
FROM "Profile" p JOIN "AuditEvent" a ON a."action" = 'PROFILE_CREATED' AND a."entityId" = p."id";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_ownerId_demoKey_key" ON "Profile"("ownerId", "demoKey");
CREATE INDEX "Profile_ownerId_kind_status_createdAt_idx" ON "Profile"("ownerId", "kind", "status", "createdAt");

CREATE TABLE "new_AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "weights" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("version" > 0)
);
INSERT INTO "new_AppSettings" ("id", "ownerId", "version", "weights", "createdAt", "updatedAt")
SELECT s."id", (SELECT "actorId" FROM "AuditEvent" WHERE "action" = 'BOOTSTRAP_COMPLETED' LIMIT 1), s."version", s."weights", s."createdAt", s."updatedAt" FROM "AppSettings" s;
INSERT INTO "new_AppSettings" ("ownerId", "version", "weights", "createdAt", "updatedAt")
SELECT u."id", 1, '{"values":20,"goals":20,"interests":15,"lifestyle":15,"communication":10,"location":10,"age":5,"education":5}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u WHERE NOT EXISTS (SELECT 1 FROM "new_AppSettings" s WHERE s."ownerId" = u."id");
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
CREATE UNIQUE INDEX "AppSettings_ownerId_key" ON "AppSettings"("ownerId");

CREATE TRIGGER "profile_kind_immutable" BEFORE UPDATE OF "kind", "demoKey" ON "Profile"
WHEN OLD."kind" <> NEW."kind" OR OLD."demoKey" IS NOT NEW."demoKey"
BEGIN SELECT RAISE(ABORT, 'Profile classification is immutable'); END;
CREATE TRIGGER "profile_owner_immutable" BEFORE UPDATE OF "ownerId" ON "Profile"
WHEN OLD."ownerId" <> NEW."ownerId"
BEGIN SELECT RAISE(ABORT, 'Profile owner is immutable'); END;
CREATE TRIGGER "workflow_pair_insert" BEFORE INSERT ON "Workflow" WHEN NEW."candidateId" IS NOT NULL AND ((SELECT "kind" FROM "Profile" WHERE "id"=NEW."sourceId") IS NOT (SELECT "kind" FROM "Profile" WHERE "id"=NEW."candidateId")) BEGIN SELECT RAISE(ABORT,'Workflow classification mismatch'); END;
CREATE TRIGGER "workflow_pair_update" BEFORE UPDATE ON "Workflow" WHEN NEW."candidateId" IS NOT NULL AND ((SELECT "kind" FROM "Profile" WHERE "id"=NEW."sourceId") IS NOT (SELECT "kind" FROM "Profile" WHERE "id"=NEW."candidateId")) BEGIN SELECT RAISE(ABORT,'Workflow classification mismatch'); END;
CREATE TRIGGER "snapshot_pair_insert" BEFORE INSERT ON "AssessmentSnapshot" WHEN NOT EXISTS (SELECT 1 FROM "Workflow" w JOIN "Profile" a ON a."id"=w."sourceId" JOIN "Profile" b ON b."id"=NEW."candidateId" WHERE w."id"=NEW."workflowId" AND w."sourceId"=NEW."sourceId" AND a."kind"=b."kind" AND a."id"<>b."id" AND a."ownerId"=b."ownerId") BEGIN SELECT RAISE(ABORT,'Snapshot pair mismatch'); END;
CREATE TRIGGER "chat_context_binding" BEFORE INSERT ON "ChatConversation"
WHEN (NEW."candidateId" IS NOT NULL AND (NEW."sourceId" IS NULL OR NEW."candidateId" = NEW."sourceId"))
 OR (NEW."sourceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" WHERE "id"=NEW."sourceId" AND "kind"=NEW."kind" AND "ownerId"=NEW."ownerId"))
 OR (NEW."candidateId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" WHERE "id"=NEW."candidateId" AND "kind"=NEW."kind" AND "ownerId"=NEW."ownerId"))
 OR (NEW."workflowId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Workflow" WHERE "id"=NEW."workflowId" AND "sourceId"=NEW."sourceId" AND "candidateId" IS NEW."candidateId"))
 OR (NEW."draftId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "EmailDraft" WHERE "id"=NEW."draftId" AND "workflowId"=NEW."workflowId"))
BEGIN SELECT RAISE(ABORT,'Invalid chat context'); END;
CREATE TRIGGER "consent_kind_insert" BEFORE INSERT ON "ProfileConsent"
WHEN NEW."synthetic" <> ((SELECT "kind" FROM "Profile" WHERE "id" = NEW."profileId") = 'DEMO')
BEGIN SELECT RAISE(ABORT, 'Consent classification mismatch'); END;
CREATE TRIGGER "consent_kind_update" BEFORE UPDATE ON "ProfileConsent"
WHEN NEW."synthetic" <> ((SELECT "kind" FROM "Profile" WHERE "id" = NEW."profileId") = 'DEMO')
BEGIN SELECT RAISE(ABORT, 'Consent classification mismatch'); END;

CREATE TRIGGER "workflow_same_owner_insert" BEFORE INSERT ON "Workflow"
WHEN NOT EXISTS (
  SELECT 1 FROM "Profile" source
  WHERE source."id" = NEW."sourceId"
    AND (NEW."candidateId" IS NULL OR EXISTS (
      SELECT 1 FROM "Profile" candidate WHERE candidate."id" = NEW."candidateId" AND candidate."ownerId" = source."ownerId"
    ))
)
BEGIN SELECT RAISE(ABORT, 'Workflow profile owner mismatch'); END;
CREATE TRIGGER "workflow_same_owner_update" BEFORE UPDATE OF "sourceId", "candidateId" ON "Workflow"
WHEN NOT EXISTS (
  SELECT 1 FROM "Profile" source
  WHERE source."id" = NEW."sourceId"
    AND (NEW."candidateId" IS NULL OR EXISTS (
      SELECT 1 FROM "Profile" candidate WHERE candidate."id" = NEW."candidateId" AND candidate."ownerId" = source."ownerId"
    ))
)
BEGIN SELECT RAISE(ABORT, 'Workflow profile owner mismatch'); END;
CREATE TRIGGER "snapshot_same_owner_insert" BEFORE INSERT ON "AssessmentSnapshot"
WHEN NOT EXISTS (
  SELECT 1 FROM "Workflow" w
  JOIN "Profile" source ON source."id" = w."sourceId"
  JOIN "Profile" candidate ON candidate."id" = NEW."candidateId"
  WHERE w."id" = NEW."workflowId" AND w."sourceId" = NEW."sourceId"
    AND source."ownerId" = candidate."ownerId"
)
BEGIN SELECT RAISE(ABORT, 'Snapshot crosses workspace owners'); END;
CREATE TRIGGER "email_draft_same_owner_insert" BEFORE INSERT ON "EmailDraft"
WHEN NOT EXISTS (
  SELECT 1 FROM "Workflow" w JOIN "Profile" recipient ON recipient."id" = NEW."recipientProfileId"
  JOIN "Profile" source ON source."id" = w."sourceId"
  WHERE w."id" = NEW."workflowId" AND recipient."ownerId" = source."ownerId"
)
BEGIN SELECT RAISE(ABORT, 'Email draft crosses workspace owners'); END;
CREATE TRIGGER "email_draft_same_owner_update" BEFORE UPDATE OF "workflowId", "recipientProfileId" ON "EmailDraft"
WHEN NOT EXISTS (
  SELECT 1 FROM "Workflow" w JOIN "Profile" recipient ON recipient."id" = NEW."recipientProfileId"
  JOIN "Profile" source ON source."id" = w."sourceId"
  WHERE w."id" = NEW."workflowId" AND recipient."ownerId" = source."ownerId"
)
BEGIN SELECT RAISE(ABORT, 'Email draft crosses workspace owners'); END;
CREATE TRIGGER "chat_same_owner_insert" BEFORE INSERT ON "ChatConversation"
WHEN (NEW."sourceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" p WHERE p."id" = NEW."sourceId" AND p."ownerId" = NEW."ownerId"))
  OR (NEW."candidateId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" p WHERE p."id" = NEW."candidateId" AND p."ownerId" = NEW."ownerId"))
  OR (NEW."workflowId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Workflow" w JOIN "Profile" p ON p."id" = w."sourceId" WHERE w."id" = NEW."workflowId" AND p."ownerId" = NEW."ownerId"))
  OR (NEW."draftId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "EmailDraft" d JOIN "Workflow" w ON w."id" = d."workflowId" JOIN "Profile" p ON p."id" = w."sourceId" WHERE d."id" = NEW."draftId" AND p."ownerId" = NEW."ownerId"))
BEGIN SELECT RAISE(ABORT, 'Chat context crosses workspace owners'); END;
CREATE TRIGGER "chat_same_owner_update" BEFORE UPDATE OF "ownerId", "sourceId", "candidateId", "workflowId", "draftId" ON "ChatConversation"
WHEN (NEW."sourceId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" p WHERE p."id" = NEW."sourceId" AND p."ownerId" = NEW."ownerId"))
  OR (NEW."candidateId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Profile" p WHERE p."id" = NEW."candidateId" AND p."ownerId" = NEW."ownerId"))
  OR (NEW."workflowId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Workflow" w JOIN "Profile" p ON p."id" = w."sourceId" WHERE w."id" = NEW."workflowId" AND p."ownerId" = NEW."ownerId"))
  OR (NEW."draftId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "EmailDraft" d JOIN "Workflow" w ON w."id" = d."workflowId" JOIN "Profile" p ON p."id" = w."sourceId" WHERE d."id" = NEW."draftId" AND p."ownerId" = NEW."ownerId"))
BEGIN SELECT RAISE(ABORT, 'Chat context crosses workspace owners'); END;

DROP TABLE "_tenant_ownership_guard";
COMMIT;
PRAGMA foreign_keys=ON;
