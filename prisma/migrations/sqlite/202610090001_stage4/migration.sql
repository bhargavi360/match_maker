-- CreateTable
CREATE TABLE "SystemState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "bootstrapCompleted" BOOLEAN NOT NULL DEFAULT false,
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ("id" = 1)
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CHECK ("slot" = 1)
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    CHECK ("count" > 0)
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "weights" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CHECK ("id" = 1 AND "version" > 0)
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CHECK ("kind" IN ('REAL', 'DEMO')), CHECK ("status" IN ('ACTIVE', 'ARCHIVED')), CHECK ("revision" > 0), CHECK ("reportedAge" IS NULL OR "reportedAge" BETWEEN 18 AND 120), CHECK (("reportedAge" IS NULL) = ("ageConfirmedOn" IS NULL)), CHECK (("kind" = 'REAL' AND "demoKey" IS NULL) OR ("kind" = 'DEMO' AND "demoKey" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "ProfileContact" (
    "profileId" TEXT NOT NULL PRIMARY KEY,
    "ciphertext" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileContact_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartnerPreference" (
    "profileId" TEXT NOT NULL PRIMARY KEY,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerPreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfileConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileConsent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK ("scope" IN ('SEARCH','MATCHING','EXPLANATION','EMAIL_DRAFT','CHAT')), CHECK ("status" IN ('GRANTED','WITHDRAWN')), CHECK ("revision" > 0)
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "entityId" TEXT,
    "fields" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_slot_key" ON "User"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_demoKey_key" ON "Profile"("demoKey");

-- CreateIndex
CREATE INDEX "Profile_kind_status_createdAt_idx" ON "Profile"("kind", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileConsent_profileId_scope_key" ON "ProfileConsent"("profileId", "scope");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");


INSERT INTO "SystemState" ("id", "bootstrapCompleted", "maintenance") VALUES (1, 0, 0);
CREATE TRIGGER bootstrap_never_reopens BEFORE UPDATE OF bootstrapCompleted ON SystemState WHEN OLD.bootstrapCompleted = 1 AND NEW.bootstrapCompleted <> 1 BEGIN SELECT RAISE(ABORT, 'Bootstrap cannot reopen'); END;
CREATE TRIGGER bootstrap_latch_never_deleted BEFORE DELETE ON SystemState BEGIN SELECT RAISE(ABORT, 'Bootstrap latch is permanent'); END;
CREATE TRIGGER profile_kind_immutable BEFORE UPDATE OF kind, demoKey ON Profile WHEN OLD.kind <> NEW.kind OR OLD.demoKey IS NOT NEW.demoKey BEGIN SELECT RAISE(ABORT, 'Profile classification is immutable'); END;
CREATE TRIGGER consent_kind_insert BEFORE INSERT ON ProfileConsent WHEN NEW.synthetic <> ((SELECT kind FROM Profile WHERE id = NEW.profileId) = 'DEMO') BEGIN SELECT RAISE(ABORT, 'Consent classification mismatch'); END;
CREATE TRIGGER consent_kind_update BEFORE UPDATE ON ProfileConsent WHEN NEW.synthetic <> ((SELECT kind FROM Profile WHERE id = NEW.profileId) = 'DEMO') BEGIN SELECT RAISE(ABORT, 'Consent classification mismatch'); END;
CREATE TRIGGER session_audit_insert AFTER INSERT ON Session BEGIN INSERT INTO AuditEvent(id, action, actorId, fields, createdAt) VALUES (lower(hex(randomblob(16))), 'LOGIN_SUCCEEDED', NEW.userId, '[]', strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
CREATE TRIGGER session_audit_delete AFTER DELETE ON Session BEGIN INSERT INTO AuditEvent(id, action, actorId, fields, createdAt) VALUES (lower(hex(randomblob(16))), 'SESSION_REVOKED', OLD.userId, '[]', strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
