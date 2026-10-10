import "server-only";
import { z } from "zod";
import { db } from "./db";
import { appOrigin } from "./config";
import { AppError } from "./errors";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = appOrigin();
  const localAlias = process.env.NODE_ENV !== "production" && isLoopbackAlias(origin, expected);
  if ((origin !== expected && !localAlias) || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "This request must come from the workspace.");
}
function isLoopbackAlias(origin: string | null, expected: string) {
  if (!origin) return false;
  try {
    const actualUrl = new URL(origin);
    const expectedUrl = new URL(expected);
    const localHosts = new Set(["localhost", "127.0.0.1"]);
    return actualUrl.protocol === "http:" && expectedUrl.protocol === "http:" &&
      localHosts.has(actualUrl.hostname) && localHosts.has(expectedUrl.hostname) &&
      actualUrl.port === expectedUrl.port;
  } catch {
    return false;
  }
}
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new AppError(415, "Use a JSON request.");
  const max = 32768;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > max)) throw new AppError(413, "The request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "The request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > max) { await reader.cancel(); throw new AppError(413, "The request is too large."); }
    chunks.push(value);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError(400, "Invalid JSON."); }
  return schema.parse(value);
}
export async function rateLimit(key: "bootstrap" | "login" | "registration" | "ai" | "email" | "email-webhook" | "chat", maximum: number, windowMs = 900000) {
  const now = BigInt(Date.now());
  const end = now + BigInt(windowMs);
  const result = await db().$queryRaw<{ count: number }[]>
    `INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${end})
    ON CONFLICT("key") DO UPDATE SET
      "count" = CASE WHEN "expiresAt" <= ${now} THEN 1 ELSE "count" + 1 END,
      "expiresAt" = CASE WHEN "expiresAt" <= ${now} THEN ${end} ELSE "expiresAt" END
    RETURNING "count"`;
  if (result[0].count > maximum) throw new AppError(429, "Too many attempts. Wait 15 minutes before trying again.");
}
