-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MATCHMAKER',
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "welcomeCompletedAt" DATETIME,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Profile" (
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
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "compatibilityScore" INTEGER NOT NULL,
    "aiScore" INTEGER,
    "ruleScore" INTEGER,
    "strengths" JSONB NOT NULL,
    "concerns" JSONB NOT NULL,
    "explanation" JSONB,
    "icebreakers" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Email_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Email_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "profileId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "lastMessagePreview" TEXT NOT NULL DEFAULT '',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Profile_gender_location_age_idx" ON "Profile"("gender", "location", "age");

-- CreateIndex
CREATE INDEX "Profile_ownerId_idx" ON "Profile"("ownerId");

-- CreateIndex
CREATE INDEX "Match_profileId_status_idx" ON "Match"("profileId", "status");

-- CreateIndex
CREATE INDEX "Match_candidateId_idx" ON "Match"("candidateId");

-- CreateIndex
CREATE INDEX "Email_profileId_idx" ON "Email"("profileId");

-- CreateIndex
CREATE INDEX "Email_matchId_idx" ON "Email"("matchId");

-- CreateIndex
CREATE INDEX "Conversation_profileId_idx" ON "Conversation"("profileId");

-- CreateIndex
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");
