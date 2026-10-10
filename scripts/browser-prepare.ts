import { spawnSync } from "node:child_process";
import { assertBrowserEnvironment } from "./browser-environment";
assertBrowserEnvironment();
const result = spawnSync(process.execPath, ["--import","tsx","scripts/database.ts"], { env: process.env, stdio: "inherit" });
if (result.status !== 0) throw new Error("Disposable browser database initialization failed.");
