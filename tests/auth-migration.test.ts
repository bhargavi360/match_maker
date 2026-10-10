import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("multi-user migration preserves existing user credentials, sessions, and chat ownership", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "slot" INTEGER NOT NULL DEFAULT 1 CHECK ("slot" = 1),
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        "image" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE UNIQUE INDEX "User_slot_key" ON "User"("slot");
      CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
      CREATE TABLE "Account" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id"));
      CREATE TABLE "Session" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id"));
      CREATE TABLE "ChatConversation" ("id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "User"("id"));
      INSERT INTO "User" ("id", "slot", "name", "email", "emailVerified", "createdAt", "updatedAt")
        VALUES ('existing-user', 1, 'Existing Matchmaker', 'existing@example.invalid', 0, '2026-01-01', '2026-01-01');
      INSERT INTO "Account" VALUES ('existing-credential', 'existing-user');
      INSERT INTO "Session" VALUES ('existing-session', 'existing-user');
      INSERT INTO "ChatConversation" VALUES ('existing-chat', 'existing-user');
    `);

    const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/sqlite/202610100005_multi_user_accounts/migration.sql"), "utf8");
    sqlite.exec(migration);

    assert.deepEqual({ ...sqlite.prepare("SELECT id, slot, name, email FROM User WHERE id = ?").get("existing-user") }, {
      id: "existing-user", slot: 1, name: "Existing Matchmaker", email: "existing@example.invalid",
    });
    assert.equal(sqlite.prepare("SELECT id FROM Account WHERE id = ?").get("existing-credential")?.id, "existing-credential");
    assert.equal(sqlite.prepare("SELECT id FROM Session WHERE id = ?").get("existing-session")?.id, "existing-session");
    assert.equal(sqlite.prepare("SELECT id FROM ChatConversation WHERE id = ?").get("existing-chat")?.id, "existing-chat");
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    sqlite.prepare("INSERT INTO User (id, slot, name, email, updatedAt) VALUES (?, ?, ?, ?, ?)")
      .run("new-user", 2, "New Matchmaker", "new@example.invalid", "2026-01-02");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM User").get()?.count, 2);
  } finally {
    sqlite.close();
  }
});
