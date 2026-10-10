import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createBrowserEnvironment } from "./browser-environment.ts";
createBrowserEnvironment();
// Node 24 reports hydrated OneDrive files as links; Playwright's discovery skips
// them. Copy specs to a new owned ignored directory, preserving original sources.
const directory = path.resolve("test-results", "specs-" + randomUUID());
fs.mkdirSync(directory, { recursive: true });
for (const name of fs.readdirSync("tests")) if (name.endsWith(".spec.ts")) fs.writeFileSync(path.join(directory, name), fs.readFileSync(path.join("tests", name), "utf8").replaceAll('from "../', 'from "../../'));
const result = spawnSync(process.execPath, ["node_modules/playwright/cli.js", "test", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, MATCHMAKER_BROWSER_SPECS: directory } });
process.exitCode = result.status ?? 1;
