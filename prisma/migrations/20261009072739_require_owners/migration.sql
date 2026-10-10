/*
  Warnings:

  - Made the column `userId` on table `ActivityLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `ownerId` on table `Conversation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `ownerId` on table `Profile` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "userId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ActivityLog" ("createdAt", "entityId", "entityType", "id", "message", "metadata", "type", "updatedAt", "userId") SELECT "createdAt", "entityId", "entityType", "id", "message", "metadata", "type", "updatedAt", "userId" FROM "ActivityLog";
DROP TABLE "ActivityLog";
ALTER TABLE "new_ActivityLog" RENAME TO "ActivityLog";
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "profileId" TEXT,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "lastMessagePreview" TEXT NOT NULL DEFAULT '',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("createdAt", "id", "lastMessagePreview", "metadata", "ownerId", "profileId", "summary", "title", "type", "unreadCount", "updatedAt") SELECT "createdAt", "id", "lastMessagePreview", "metadata", "ownerId", "profileId", "summary", "title", "type", "unreadCount", "updatedAt" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_profileId_idx" ON "Conversation"("profileId");
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "education" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "community" TEXT NOT NULL DEFAULT '',
    "height" TEXT NOT NULL DEFAULT '',
    "interests" JSONB NOT NULL,
    "diet" TEXT NOT NULL DEFAULT '',
    "smoking" TEXT NOT NULL DEFAULT '',
    "drinking" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "relationshipGoal" TEXT NOT NULL DEFAULT '',
    "preferredAgeMin" INTEGER,
    "preferredAgeMax" INTEGER,
    "preferredGender" TEXT NOT NULL DEFAULT 'Any',
    "preferredLocation" TEXT NOT NULL DEFAULT '',
    "preferredEducation" TEXT NOT NULL DEFAULT '',
    "preferredOccupation" TEXT NOT NULL DEFAULT '',
    "dealBreakers" TEXT NOT NULL DEFAULT '',
    "mustHaves" TEXT NOT NULL DEFAULT '',
    "introductionConsent" BOOLEAN NOT NULL DEFAULT false,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("about", "age", "archived", "community", "completenessScore", "createdAt", "dealBreakers", "diet", "drinking", "education", "fullName", "gender", "height", "id", "interests", "introductionConsent", "location", "mustHaves", "occupation", "ownerId", "preferredAgeMax", "preferredAgeMin", "preferredEducation", "preferredGender", "preferredLocation", "preferredOccupation", "relationshipGoal", "smoking", "updatedAt") SELECT "about", "age", "archived", "community", "completenessScore", "createdAt", "dealBreakers", "diet", "drinking", "education", "fullName", "gender", "height", "id", "interests", "introductionConsent", "location", "mustHaves", "occupation", "ownerId", "preferredAgeMax", "preferredAgeMin", "preferredEducation", "preferredGender", "preferredLocation", "preferredOccupation", "relationshipGoal", "smoking", "updatedAt" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE INDEX "Profile_gender_location_age_idx" ON "Profile"("gender", "location", "age");
CREATE INDEX "Profile_ownerId_idx" ON "Profile"("ownerId");
CREATE INDEX "Profile_ownerId_gender_location_age_idx" ON "Profile"("ownerId", "gender", "location", "age");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
