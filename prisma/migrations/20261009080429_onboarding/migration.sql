-- CreateTable
CREATE TABLE "OnboardingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "roleTitle" TEXT NOT NULL DEFAULT '',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "communities" TEXT NOT NULL DEFAULT '[]',
    "ageGroups" TEXT NOT NULL DEFAULT '[]',
    "relationshipGoals" TEXT NOT NULL DEFAULT '[]',
    "defaultEmailTone" TEXT NOT NULL DEFAULT 'Warm',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "notifyNewMessages" BOOLEAN NOT NULL DEFAULT true,
    "notifyMatchUpdates" BOOLEAN NOT NULL DEFAULT true,
    "consentCustomerData" BOOLEAN NOT NULL DEFAULT false,
    "consentAIProcessing" BOOLEAN NOT NULL DEFAULT false,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "aiModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "notificationsOn" BOOLEAN NOT NULL DEFAULT true,
    "defaultEmailTone" TEXT NOT NULL DEFAULT 'Warm',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "notifyNewMessages" BOOLEAN NOT NULL DEFAULT true,
    "notifyMatchUpdates" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSetting" ("aiModel", "createdAt", "id", "notificationsOn", "theme", "updatedAt", "userId") SELECT "aiModel", "createdAt", "id", "notificationsOn", "theme", "updatedAt", "userId" FROM "UserSetting";
DROP TABLE "UserSetting";
ALTER TABLE "new_UserSetting" RENAME TO "UserSetting";
CREATE UNIQUE INDEX "UserSetting_userId_key" ON "UserSetting"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProfile_userId_key" ON "OnboardingProfile"("userId");
