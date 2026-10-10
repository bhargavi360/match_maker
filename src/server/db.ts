import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { databasePath } from "./config";
const globalDb = globalThis as unknown as { matchmakerDb?: PrismaClient };
export function db() {
  if (globalDb.matchmakerDb) return globalDb.matchmakerDb;
  const file = databasePath();
  const marker = path.join(path.dirname(file), "matchmaker-owner.json");
  if (!fs.existsSync(file) || !fs.existsSync(marker) || JSON.parse(fs.readFileSync(marker, "utf8")).owner !== "matchmaker-ai-rebuild-stage4") throw new Error("Initialize the owned rebuild database first.");
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:" + file }) });
  globalDb.matchmakerDb = client;
  return client;
}
