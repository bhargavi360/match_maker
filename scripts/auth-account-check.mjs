import fs from "node:fs";
import fsPath from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
import { queryAccountCredentialStatus } from "../src/server/account-diagnostic.ts";
import { databasePath } from "../src/server/config.ts";

function readHiddenInput(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this diagnostic in an interactive terminal.");
  }

  const originalRawMode = process.stdin.isRaw;
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(Boolean(originalRawMode));
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") return finish(new Error("Cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " " && value.length < 254) {
          value += character;
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const projectRoot = fsPath.resolve(fsPath.dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(projectRoot);
  const { loadEnvConfig } = nextEnv;
  loadEnvConfig(projectRoot);

  const email = (await readHiddenInput("Account email (hidden; Enter to check, Ctrl+C to cancel): ")).toLowerCase();
  if (!email) throw new Error("An account address is required.");

  const file = databasePath();
  const ownerMarkerPath = fsPath.join(fsPath.dirname(file), "matchmaker-owner.json");
  if (!fs.existsSync(ownerMarkerPath) || JSON.parse(fs.readFileSync(ownerMarkerPath, "utf8")).owner !== "matchmaker-ai-rebuild-stage4") {
    throw new Error("The selected database is not marked as the owned rebuild database.");
  }
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    console.log(JSON.stringify({ databasePath: file, ...queryAccountCredentialStatus(database, email) }));
  } finally {
    database.close();
  }
}

main().catch(() => {
  console.error("Account diagnostic could not complete; no data was changed.");
  process.exitCode = 1;
});
