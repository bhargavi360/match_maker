-- Additive Stage 6 only. No existing table/data/environment is replaced.
CREATE TABLE "Workflow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceRevision" INTEGER NOT NULL CHECK ("sourceRevision" > 0),
  "candidateId" TEXT REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "snapshotId" TEXT REFERENCES "AssessmentSnapshot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  "currentStep" INTEGER NOT NULL DEFAULT 1 CHECK ("currentStep" BETWEEN 1 AND 5),
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK ("status" IN ('IN_PROGRESS','MATCH_APPROVED','MATCH_REJECTED','REVIEW_REQUIRED','ARCHIVED')),
  "reviewedAt" DATETIME, "reviewedBy" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "archivedAt" DATETIME,
  CHECK ("sourceId" IS NOT "candidateId"),
  CHECK (("reviewedAt" IS NULL) = ("reviewedBy" IS NULL)),
  CHECK ("reviewedAt" IS NULL OR "snapshotId" IS NOT NULL),
  CHECK ("currentStep" < 4 OR "status" IN ('MATCH_APPROVED','ARCHIVED')),
  CHECK ("status" <> 'MATCH_APPROVED' OR ("snapshotId" IS NOT NULL AND "reviewedAt" IS NOT NULL)),
  CHECK ("status" <> 'REVIEW_REQUIRED' OR "reviewedAt" IS NULL),
  CHECK (("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL))
);
CREATE TABLE "AssessmentSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workflowId" TEXT NOT NULL REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceId" TEXT NOT NULL, "candidateId" TEXT NOT NULL,
  "stamp" TEXT NOT NULL CHECK (length("stamp") = 64),
  "assessment" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("sourceId" <> "candidateId")
);
CREATE TABLE "MatchDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workflowId" TEXT NOT NULL REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "snapshotId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL, "candidateId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('APPROVED','REJECTED','REOPENED')),
  "actorId" TEXT NOT NULL, "sequence" INTEGER NOT NULL CHECK ("sequence" > 0),
  "reviewedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("workflowId","snapshotId") REFERENCES "AssessmentSnapshot"("workflowId","id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CHECK ("sourceId" <> "candidateId"),
  CHECK ("type" = 'REOPENED' OR "reviewedAt" IS NOT NULL)
);
CREATE INDEX "Workflow_status_updatedAt_idx" ON "Workflow"("status","updatedAt");
CREATE INDEX "Workflow_sourceId_candidateId_idx" ON "Workflow"("sourceId","candidateId");
CREATE INDEX "Workflow_candidateId_idx" ON "Workflow"("candidateId");
CREATE UNIQUE INDEX "Workflow_active_source_key" ON "Workflow"("sourceId") WHERE "status" <> 'ARCHIVED';
CREATE UNIQUE INDEX "AssessmentSnapshot_workflowId_id_key" ON "AssessmentSnapshot"("workflowId","id");
CREATE INDEX "AssessmentSnapshot_sourceId_candidateId_idx" ON "AssessmentSnapshot"("sourceId","candidateId");
CREATE UNIQUE INDEX "MatchDecision_workflowId_sequence_key" ON "MatchDecision"("workflowId","sequence");
CREATE INDEX "MatchDecision_sourceId_candidateId_createdAt_idx" ON "MatchDecision"("sourceId","candidateId","createdAt");

CREATE TRIGGER workflow_pair_insert BEFORE INSERT ON Workflow WHEN NEW.candidateId IS NOT NULL AND (SELECT kind FROM Profile WHERE id=NEW.sourceId) IS NOT (SELECT kind FROM Profile WHERE id=NEW.candidateId) BEGIN SELECT RAISE(ABORT,'Workflow classification mismatch'); END;
CREATE TRIGGER workflow_snapshot_insert BEFORE INSERT ON Workflow WHEN NEW.snapshotId IS NOT NULL BEGIN SELECT RAISE(ABORT,'Create a workflow before selecting a snapshot'); END;
CREATE TRIGGER workflow_pair_update BEFORE UPDATE ON Workflow WHEN NEW.candidateId IS NOT NULL AND (SELECT kind FROM Profile WHERE id=NEW.sourceId) IS NOT (SELECT kind FROM Profile WHERE id=NEW.candidateId) BEGIN SELECT RAISE(ABORT,'Workflow classification mismatch'); END;
CREATE TRIGGER workflow_snapshot_binding BEFORE UPDATE ON Workflow WHEN NEW.snapshotId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM AssessmentSnapshot s WHERE s.id=NEW.snapshotId AND s.workflowId=NEW.id AND s.sourceId=NEW.sourceId AND s.candidateId=NEW.candidateId) BEGIN SELECT RAISE(ABORT,'Workflow snapshot mismatch'); END;
CREATE TRIGGER snapshot_pair_insert BEFORE INSERT ON AssessmentSnapshot WHEN NOT EXISTS (SELECT 1 FROM Workflow w JOIN Profile a ON a.id=w.sourceId JOIN Profile b ON b.id=NEW.candidateId WHERE w.id=NEW.workflowId AND w.sourceId=NEW.sourceId AND a.kind=b.kind AND a.id<>b.id) BEGIN SELECT RAISE(ABORT,'Snapshot pair mismatch'); END;
CREATE TRIGGER snapshot_immutable BEFORE UPDATE ON AssessmentSnapshot BEGIN SELECT RAISE(ABORT,'Snapshots are immutable'); END;
CREATE TRIGGER snapshot_no_direct_delete BEFORE DELETE ON AssessmentSnapshot WHEN EXISTS (SELECT 1 FROM Workflow WHERE id=OLD.workflowId) BEGIN SELECT RAISE(ABORT,'Snapshots belong to workflow history'); END;
CREATE TRIGGER decision_immutable BEFORE UPDATE ON MatchDecision BEGIN SELECT RAISE(ABORT,'Decisions are append-only'); END;
CREATE TRIGGER decision_no_direct_delete BEFORE DELETE ON MatchDecision WHEN EXISTS (SELECT 1 FROM Workflow WHERE id=OLD.workflowId) BEGIN SELECT RAISE(ABORT,'Decisions belong to workflow history'); END;
CREATE TRIGGER decision_binding BEFORE INSERT ON MatchDecision WHEN NOT EXISTS (
  SELECT 1 FROM Workflow w JOIN AssessmentSnapshot s ON s.id=w.snapshotId AND s.workflowId=w.id
  WHERE w.id=NEW.workflowId AND s.id=NEW.snapshotId AND s.sourceId=NEW.sourceId AND s.candidateId=NEW.candidateId
  AND w.sourceId=NEW.sourceId AND w.candidateId=NEW.candidateId
  AND (NEW.type='REOPENED' OR (w.reviewedAt=NEW.reviewedAt AND w.reviewedBy=NEW.actorId AND w.reviewedAt IS NOT NULL))
) BEGIN SELECT RAISE(ABORT,'Decision review mismatch'); END;
