// Read-only local QA: metadata only for legacy; no customer rows or secrets printed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
import { databasePath } from "../src/server/config.ts";
nextEnv.loadEnvConfig(process.cwd());
const before = JSON.parse(fs.readFileSync("test-results/stage10-preservation-before.json", "utf8"));
const root = path.resolve("../matchmaker-dashboard"), records = [];
function walk(directory, visit, skip = () => false) {
  for (const name of fs.readdirSync(directory)) {
    if (skip(name)) continue;
    const file = path.join(directory, name), stat = fs.statSync(file);
    if (stat.isDirectory()) walk(file, visit, skip); else visit(file, stat);
  }
}
walk(root, (file, stat) => records.push({ path: path.relative(root, file).split(path.sep).join("/"), size: stat.size, mtime: stat.mtimeMs }), name => name === "node_modules" || name === ".git" || name.startsWith(".next"));
records.sort((a, b) => a.path.localeCompare(b.path));
const legacyMetadataSHA256 = crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
const lockStat = fs.statSync("../../package-lock.json"), rootLock = { size: lockStat.size, mtime: lockStat.mtimeMs };
const db = new DatabaseSync(databasePath(), { readOnly: true });
let mainTables, migrations, integrity, foreignKeys;
try {
  mainTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => ({ name, count: db.prepare('SELECT count(*) AS count FROM "' + name.replaceAll('"', '""') + '"').get().count }));
  migrations = db.prepare("SELECT migration_name, checksum, finished_at IS NOT NULL AS finished FROM _prisma_migrations ORDER BY migration_name").all().map(row => ({ ...row }));
  integrity = db.prepare("PRAGMA integrity_check").get(); foreignKeys = db.prepare("PRAGMA foreign_key_check").all().length;
} finally { db.close(); }
for (const migration of migrations) {
  const sql = fs.readFileSync(path.join("prisma/migrations/sqlite", migration.migration_name, "migration.sql"));
  assert.equal(crypto.createHash("sha256").update(sql).digest("hex"), migration.checksum);
}
const secrets = ["BETTER_AUTH_SECRET", "MATCHMAKER_SETUP_TOKEN", "CONTACT_ENCRYPTION_KEY", "GEMINI_API_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"].map(key => process.env[key]).filter(value => value && value.length >= 20 && !value.startsWith("replace-with"));
let clientChunks = 0, clientSourceMaps = 0, privateSecretHits = 0;
walk(".next/static", file => { if (/\.(js|map)$/.test(file)) { if (file.endsWith(".js")) clientChunks++; else clientSourceMaps++; const content = fs.readFileSync(file, "utf8"); privateSecretHits += secrets.filter(secret => content.includes(secret)).length; } });
let sourceFiles = 0, sourceSecretHits = 0;
walk(process.cwd(), file => { if (/\.(ts|tsx|mjs|json|md|prisma|sql|css)$/.test(file) || path.basename(file) === ".env.example") { sourceFiles++; const content = fs.readFileSync(file, "utf8"); sourceSecretHits += secrets.filter(secret => content.includes(secret)).length; } }, name => name === "node_modules" || name === "test-results" || name === "generated" || name === ".git" || name.startsWith(".next") || name === ".browser-specs-local" || name.startsWith(".env") && name !== ".env.example");
const result = { legacyFiles: records.length, legacyMetadataSHA256, rootLock, mainTables, migrations, integrity, foreignKeys, clientChunks, clientSourceMaps, privateSecretHits, sourceFiles, sourceSecretHits };
assert.equal(records.length, before.legacyFiles); assert.equal(legacyMetadataSHA256, before.legacyMetadataSHA256); assert.deepEqual(rootLock, before.rootLock);
assert.deepEqual(mainTables, before.mainTables); assert.deepEqual(migrations, before.migrations); assert.equal(integrity.integrity_check, "ok"); assert.equal(foreignKeys, 0); assert.equal(privateSecretHits, 0);
assert.equal(sourceSecretHits, 0);
fs.writeFileSync("test-results/stage10-preservation-after.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify({ legacyFiles: records.length, legacyUnchanged: true, rootLockUnchanged: true, mainCountsAndMigrationsUnchanged: true, migrationChecksumsMatch: true, integrity: integrity.integrity_check, foreignKeys, clientChunks, clientSourceMaps, privateSecretHits, sourceFiles, sourceSecretHits }));
