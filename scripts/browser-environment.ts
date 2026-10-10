import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const markerName = "browser-fixture.json";
const boundKeys = ["MATCHMAKER_BROWSER_DIRECTORY", "MATCHMAKER_BROWSER_RUN_ID", "DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "MATCHMAKER_SETUP_TOKEN", "CONTACT_ENCRYPTION_KEY", "CONTACT_KEY_ID"];
function fingerprint(env: NodeJS.ProcessEnv) {
  return createHash("sha256").update(JSON.stringify(boundKeys.map(key => env[key]))).digest("hex");
}
function disableProviders(env: NodeJS.ProcessEnv) {
  Object.assign(env, { MATCHMAKER_TEST_MODE: "1", GEMINI_ENABLED: "false", GEMINI_API_KEY: "", GEMINI_MODEL: "", RESEND_API_KEY: "", RESEND_FROM_EMAIL: "", RESEND_REPLY_TO: "", RESEND_WEBHOOK_SECRET: "", APP_ORIGIN: "http://127.0.0.1:3100" });
}
/** Allocate afresh at the runner boundary; never adopt the caller's database. */
export function createBrowserEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "matchmaker-browser-"));
  Object.assign(env, { MATCHMAKER_BROWSER_DIRECTORY: directory, MATCHMAKER_BROWSER_RUN_ID: randomUUID(), DATABASE_URL: "file:" + path.join(directory, "matchmaker.sqlite"), BETTER_AUTH_URL: "http://127.0.0.1:3100", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), MATCHMAKER_SETUP_TOKEN: randomBytes(32).toString("hex"), CONTACT_ENCRYPTION_KEY: randomBytes(32).toString("base64"), CONTACT_KEY_ID: "browser-test-v1" });
  fs.writeFileSync(path.join(directory, markerName), JSON.stringify({ owner: "matchmaker-browser-test", runId: env.MATCHMAKER_BROWSER_RUN_ID, fingerprint: fingerprint(env) }), { flag: "wx", mode: 0o600 });
  disableProviders(env);
  return directory;
}
/** Validate the run-bound fixture before any migration, bootstrap or worker reuse. */
export function assertBrowserEnvironment(env: NodeJS.ProcessEnv = process.env) {
  try {
    const directory = env.MATCHMAKER_BROWSER_DIRECTORY!;
    const root = fs.realpathSync(os.tmpdir());
    if (!directory || path.dirname(directory) !== root || !/^matchmaker-browser-[a-zA-Z0-9]+$/.test(path.basename(directory))) throw new Error();
    if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) throw new Error();
    const file = path.join(directory, "matchmaker.sqlite"), marker = path.join(directory, markerName);
    if (env.DATABASE_URL !== "file:" + file || fs.lstatSync(marker).isSymbolicLink()) throw new Error();
    if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) throw new Error();
    const saved = JSON.parse(fs.readFileSync(marker, "utf8"));
    if (saved.owner !== "matchmaker-browser-test" || !env.MATCHMAKER_BROWSER_RUN_ID || saved.runId !== env.MATCHMAKER_BROWSER_RUN_ID || saved.fingerprint !== fingerprint(env)) throw new Error();
    if (env.BETTER_AUTH_URL !== "http://127.0.0.1:3100" || !/^[a-f0-9]{64}$/.test(env.BETTER_AUTH_SECRET ?? "") || !/^[a-f0-9]{64}$/.test(env.MATCHMAKER_SETUP_TOKEN ?? "") || Buffer.from(env.CONTACT_ENCRYPTION_KEY ?? "", "base64").length !== 32) throw new Error();
    disableProviders(env);
    return directory;
  } catch {
    throw new Error("Browser fixture ownership or environment is invalid. No migration was run.");
  }
}

export function ensureBrowserEnvironment(env: NodeJS.ProcessEnv = process.env) {
  // A valid child worker shares the runner's fixture; a foreign override gets a new one.
  try { return assertBrowserEnvironment(env); } catch { return createBrowserEnvironment(env); }
}
