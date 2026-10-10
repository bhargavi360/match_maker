import path from "node:path";
import os from "node:os";
export function databasePath() {
  const fallback = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share"), "MatchmakerAIRebuild", "matchmaker.sqlite");
  const url = process.env.DATABASE_URL;
  const file = url ? url.slice(5) : fallback;
  if ((url && !url.startsWith("file:")) || !path.isAbsolute(file) || path.basename(file) !== "matchmaker.sqlite") throw new Error("Use an absolute, owned matchmaker.sqlite database path.");
  const resolved = path.resolve(file);
  if (resolved.toLowerCase().includes("matchmaker-dashboard") || resolved.toLowerCase().includes("onedrive")) throw new Error("Database must be outside legacy and synchronized source directories.");
  return resolved;
}
export function appOrigin() {
  const url = new URL(process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3100");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("HTTPS is required outside loopback development.");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("Configure a bare application origin.");
  return url.origin;
}
