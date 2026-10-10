import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createBrowserEnvironment, assertBrowserEnvironment, ensureBrowserEnvironment } from "../scripts/browser-environment";

function fixture() { const env: NodeJS.ProcessEnv = { NODE_ENV: "test" }; const directory = createBrowserEnvironment(env); return { env, directory }; }
test("fresh browser fixtures replace inherited database, secrets and live providers", () => {
  const sentinel = fs.mkdtempSync(path.join(os.tmpdir(), "matchmaker-qa-sentinel-"));
  const file = path.join(sentinel, "matchmaker.sqlite"); fs.writeFileSync(file, "synthetic sentinel, never a database");
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", DATABASE_URL: "file:" + file, MATCHMAKER_BROWSER_DIRECTORY: sentinel, BETTER_AUTH_SECRET: "inherited", GEMINI_ENABLED: "true", GEMINI_API_KEY: "synthetic-provider-key", RESEND_API_KEY: "synthetic-provider-key" };
  createBrowserEnvironment(env);
  assert.notEqual(env.DATABASE_URL, "file:" + file); assert.notEqual(env.BETTER_AUTH_SECRET, "inherited");
  assert.equal(env.MATCHMAKER_TEST_MODE, "1"); assert.equal(env.GEMINI_ENABLED, "false"); assert.equal(env.GEMINI_API_KEY, ""); assert.equal(env.RESEND_API_KEY, "");
  assert.equal(fs.readFileSync(file, "utf8"), "synthetic sentinel, never a database");
});
test("workers reuse only their valid fixture and force providers off again", () => {
  const { env, directory } = fixture(); const secret = env.BETTER_AUTH_SECRET;
  env.GEMINI_ENABLED = "true"; env.RESEND_API_KEY = "synthetic";
  assert.equal(ensureBrowserEnvironment(env), directory); assert.equal(env.BETTER_AUTH_SECRET, secret); assert.equal(env.RESEND_API_KEY, ""); assert.equal(env.GEMINI_ENABLED, "false");
  const manifest = fs.readFileSync(path.join(directory, "browser-fixture.json"), "utf8");
  assert.ok(!manifest.includes(secret!)); assert.ok(!manifest.includes(env.CONTACT_ENCRYPTION_KEY!));
});
test("each runner allocation overrides even a previously valid inherited fixture", () => {
  const { env, directory } = fixture(); const secret = env.BETTER_AUTH_SECRET;
  assert.notEqual(createBrowserEnvironment(env), directory); assert.notEqual(env.BETTER_AUTH_SECRET, secret);
});
test("altered database, secrets, run identity and traversal fail the migration guard", () => {
  for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "MATCHMAKER_BROWSER_RUN_ID", "MATCHMAKER_BROWSER_DIRECTORY"]) {
    const { env } = fixture(); env[key] = key === "MATCHMAKER_BROWSER_DIRECTORY" ? path.join(env[key]!, "..") : "synthetic-tampering";
    assert.throws(() => assertBrowserEnvironment(env), /No migration was run/);
  }
});
test("missing or foreign manifest fails closed and config safely creates a fresh fixture", () => {
  const { env, directory } = fixture(); fs.writeFileSync(path.join(directory, "browser-fixture.json"), '{"owner":"other-application"}');
  assert.throws(() => assertBrowserEnvironment(env)); assert.notEqual(ensureBrowserEnvironment(env), directory);
  const next = env.MATCHMAKER_BROWSER_DIRECTORY!; fs.unlinkSync(path.join(next, "browser-fixture.json"));
  assert.throws(() => assertBrowserEnvironment(env));
});
test("directory junction cannot redirect a browser fixture to another data directory", () => {
  const { env, directory } = fixture(); const linked = directory + "junction";
  fs.symlinkSync(directory, linked, "junction"); env.MATCHMAKER_BROWSER_DIRECTORY = linked; env.DATABASE_URL = "file:" + path.join(linked, "matchmaker.sqlite");
  assert.throws(() => assertBrowserEnvironment(env), /No migration was run/);
});
test("browser preparation rejects an inherited foreign database before any initialization", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "matchmaker-qa-sentinel-")); const file = path.join(directory, "matchmaker.sqlite");
  const bytes = Buffer.from("synthetic preserved fixture"); fs.writeFileSync(file, bytes);
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/browser-prepare.ts"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "file:" + file, MATCHMAKER_BROWSER_DIRECTORY: directory, MATCHMAKER_BROWSER_RUN_ID: "foreign" } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /No migration was run/); assert.ok(!result.stdout.includes("Migrating"));
  assert.deepEqual(fs.readFileSync(file), bytes); assert.deepEqual(fs.readdirSync(directory), ["matchmaker.sqlite"]);
});

test("replayed migration history matches the Prisma schema without table-rebuild drift", () => {
  const { env } = fixture(); const childEnv = { ...process.env, ...env };
  const prepared = spawnSync(process.execPath, ["--import", "tsx", "scripts/browser-prepare.ts"], { encoding: "utf8", env: childEnv });
  assert.equal(prepared.status, 0, prepared.stderr);
  const diff = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code", "--config", "prisma7.config.ts"], { encoding: "utf8", env: childEnv });
  assert.equal(diff.status, 0, diff.stdout + diff.stderr); assert.ok(!diff.stdout.includes("Redefined table"));
});
