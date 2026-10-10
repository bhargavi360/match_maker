-- Add the minimum role/profile state needed by later reviewed features.
-- Existing accounts remain ordinary users and existing profiles remain approved.
BEGIN IMMEDIATE;

ALTER TABLE "User"
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER'
CHECK ("role" IN ('USER', 'ADMIN'));

ALTER TABLE "Profile"
ADD COLUMN "gender" TEXT
CHECK ("gender" IS NULL OR (length(trim("gender")) BETWEEN 1 AND 80 AND length("gender") <= 80));

ALTER TABLE "Profile"
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'APPROVED'
CHECK ("reviewStatus" IN ('PENDING', 'APPROVED', 'REJECTED'));

CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "Profile_ownerId_kind_reviewStatus_status_createdAt_idx"
ON "Profile"("ownerId", "kind", "reviewStatus", "status", "createdAt");

-- Pending/rejected profiles stay ARCHIVED, keeping them out of existing
-- active-only matching until an explicit review flow approves them.
CREATE TRIGGER "profile_review_inactive_insert"
BEFORE INSERT ON "Profile"
WHEN NEW."reviewStatus" <> 'APPROVED' AND NEW."status" <> 'ARCHIVED'
BEGIN
  SELECT RAISE(ABORT, 'Unapproved profiles must remain archived');
END;

CREATE TRIGGER "profile_review_inactive_update"
BEFORE UPDATE OF "reviewStatus", "status" ON "Profile"
WHEN NEW."reviewStatus" <> 'APPROVED' AND NEW."status" <> 'ARCHIVED'
BEGIN
  SELECT RAISE(ABORT, 'Unapproved profiles must remain archived');
END;

COMMIT;
