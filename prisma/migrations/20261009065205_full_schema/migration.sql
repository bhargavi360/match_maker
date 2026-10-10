-- AlterTable
ALTER TABLE "Email" ADD COLUMN "sentAt" DATETIME;

-- CreateTable
CREATE TABLE "PortalLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "aiModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "notificationsOn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "profileId" TEXT,
    "ownerId" TEXT,
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
INSERT INTO "new_Conversation" ("createdAt", "id", "lastMessagePreview", "metadata", "profileId", "summary", "title", "type", "unreadCount", "updatedAt") SELECT "createdAt", "id", "lastMessagePreview", "metadata", "profileId", "summary", "title", "type", "unreadCount", "updatedAt" FROM "Conversation";
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
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("about", "age", "community", "createdAt", "dealBreakers", "diet", "drinking", "education", "fullName", "gender", "height", "id", "interests", "introductionConsent", "location", "mustHaves", "occupation", "ownerId", "preferredAgeMax", "preferredAgeMin", "preferredEducation", "preferredGender", "preferredLocation", "preferredOccupation", "relationshipGoal", "smoking", "updatedAt") SELECT "about", "age", "community", "createdAt", "dealBreakers", "diet", "drinking", "education", "fullName", "gender", "height", "id", "interests", "introductionConsent", "location", "mustHaves", "occupation", "ownerId", "preferredAgeMax", "preferredAgeMin", "preferredEducation", "preferredGender", "preferredLocation", "preferredOccupation", "relationshipGoal", "smoking", "updatedAt" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE INDEX "Profile_gender_location_age_idx" ON "Profile"("gender", "location", "age");
CREATE INDEX "Profile_ownerId_idx" ON "Profile"("ownerId");
CREATE INDEX "Profile_ownerId_gender_location_age_idx" ON "Profile"("ownerId", "gender", "location", "age");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PortalLink_tokenHash_key" ON "PortalLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalLink_profileId_idx" ON "PortalLink"("profileId");

-- CreateIndex
CREATE INDEX "PortalLink_expiresAt_idx" ON "PortalLink"("expiresAt");

-- CreateIndex
CREATE INDEX "SavedSearch_userId_idx" ON "SavedSearch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key" ON "UserSetting"("userId");
