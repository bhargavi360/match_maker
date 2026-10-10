import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("tenant migration assigns legacy records to audited owners and preserves ciphertext and credentials", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const folder of ["202610090001_stage4", "202610090002_stage6", "202610090003_stage7", "202610100004_stage8", "202610100005_multi_user_accounts"]) {
      sqlite.exec(fs.readFileSync(path.join(process.cwd(), "prisma/migrations/sqlite", folder, "migration.sql"), "utf8"));
    }
    sqlite.exec(`
      PRAGMA foreign_keys=ON;
      INSERT INTO User(id,slot,name,email,updatedAt) VALUES
        ('bootstrap-owner',1,'Synthetic owner','owner@example.invalid','2026-01-01'),
        ('second-user',2,'Synthetic second','second@example.invalid','2026-01-01');
      INSERT INTO Account(id,accountId,providerId,userId,password,createdAt,updatedAt)
        VALUES ('credential-id','bootstrap-owner','credential','bootstrap-owner','scrypt-hash-fixture','2026-01-01','2026-01-01');
      INSERT INTO Session(id,token,userId,expiresAt,createdAt,updatedAt)
        VALUES ('session-id','opaque-session-fixture','bootstrap-owner','2030-01-01','2026-01-01','2026-01-01');
      INSERT INTO AuditEvent(id,action,actorId,entityId,fields,createdAt) VALUES
        ('bootstrap-event','BOOTSTRAP_COMPLETED','bootstrap-owner',NULL,'[]','2026-01-01'),
        ('settings-event','SETTINGS_INITIALIZED','bootstrap-owner',NULL,'[]','2026-01-01'),
        ('profile-event','PROFILE_CREATED','bootstrap-owner','legacy-profile','[]','2026-01-01'),
        ('second-profile-event','PROFILE_CREATED','second-user','second-profile','[]','2026-01-01');
      INSERT INTO AppSettings(id,version,weights,createdAt,updatedAt)
        VALUES (1,7,'{"values":20,"goals":20,"interests":15,"lifestyle":15,"communication":10,"location":10,"age":5,"education":5}','2026-01-01','2026-01-01');
      INSERT INTO Profile(id,kind,demoKey,status,displayName,interests,"values",relationshipGoals,lifestyle,createdAt,updatedAt)
        VALUES ('legacy-profile','REAL',NULL,'ACTIVE','Synthetic legacy profile','[]','[]','[]','[]','2026-01-01','2026-01-01');
      INSERT INTO Profile(id,kind,demoKey,status,displayName,interests,"values",relationshipGoals,lifestyle,createdAt,updatedAt)
        VALUES ('second-profile','REAL',NULL,'ACTIVE','Synthetic second profile','[]','[]','[]','[]','2026-01-01','2026-01-01');
      INSERT INTO ProfileContact(profileId,ciphertext,keyId,updatedAt)
        VALUES ('legacy-profile','preserved-ciphertext-fixture','fixture-key-id','2026-01-01');
    `);

    sqlite.exec(fs.readFileSync(path.join(process.cwd(), "prisma/migrations/sqlite/202610100006_user_workspace_ownership/migration.sql"), "utf8"));
    assert.equal(sqlite.prepare("SELECT ownerId FROM Profile WHERE id='legacy-profile'").get()?.ownerId, "bootstrap-owner");
    assert.equal(sqlite.prepare("SELECT ownerId FROM Profile WHERE id='second-profile'").get()?.ownerId, "second-user");
    assert.equal(sqlite.prepare("SELECT ciphertext FROM ProfileContact WHERE profileId='legacy-profile'").get()?.ciphertext, "preserved-ciphertext-fixture");
    assert.equal(sqlite.prepare("SELECT id,version FROM AppSettings WHERE ownerId='bootstrap-owner'").get()?.id, 1);
    assert.equal(sqlite.prepare("SELECT version FROM AppSettings WHERE ownerId='bootstrap-owner'").get()?.version, 7);
    assert.ok(sqlite.prepare("SELECT id FROM AppSettings WHERE ownerId='second-user'").get());
    assert.equal(sqlite.prepare("SELECT password FROM Account WHERE id='credential-id'").get()?.password, "scrypt-hash-fixture");
    assert.equal(sqlite.prepare("SELECT token FROM Session WHERE id='session-id'").get()?.token, "opaque-session-fixture");
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(sqlite.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  } finally { sqlite.close(); }
});
