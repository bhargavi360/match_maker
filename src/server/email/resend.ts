import "server-only";
import { Resend } from "resend";
import { z } from "zod";
import { emailAddressSchema, eventTypes, type EmailEventType, type FrozenEmail, type ProviderStatus } from "@/domain/email";
import { appOrigin } from "../config";
import { AppError } from "../errors";

export const PROVIDER_TIMEOUT_MS = 8000;
export function providerConfiguration(allowFake = false) {
  const from = emailAddressSchema.safeParse(process.env.RESEND_FROM_EMAIL ?? "");
  const replyTo = process.env.RESEND_REPLY_TO ? emailAddressSchema.safeParse(process.env.RESEND_REPLY_TO) : null;
  const key = process.env.RESEND_API_KEY ?? "", secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  const webhookReady = /^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret) && Buffer.from(secret.slice(6), "base64").length >= 24;
  let originReady = false;
  try { const origin = new URL(process.env.APP_ORIGIN ?? ""); originReady = origin.href === origin.origin + "/" && origin.origin === appOrigin(); } catch { /* safe configuration category only */ }
  const testMode = process.env.MATCHMAKER_TEST_MODE === "1";
  const issues = [...(!from.success || replyTo && !replyTo.success ? ["Valid bare sender/reply-to addresses required"] : []), ...(!/^re_[A-Za-z0-9_-]{8,200}$/.test(key) ? ["API key missing or invalid"] : []), ...(!webhookReady ? ["Webhook signing secret missing or invalid"] : []), ...(!originReady ? ["APP_ORIGIN must match the workspace origin"] : []), ...(testMode && !allowFake ? ["Live transport disabled in test mode"] : [])];
  const status: ProviderStatus = { ready: issues.length === 0, senderReady: from.success && (!replyTo || replyTo.success) && originReady, webhookReady, testMode, issues };
  return { status, from: from.success ? from.data : null, replyTo: replyTo?.success ? replyTo.data : null, key, secret };
}
export type SendResult = { outcome: "ACCEPTED"; providerMessageId: string; errorCode?: never; retryBlocked?: never } | { outcome: "REJECTED" | "UNKNOWN"; errorCode: string; retryBlocked?: boolean; providerMessageId?: never };
export type RetrievedEmail = { id: string; from: string; to: string[]; subject: string; text: string | null; reply_to: string[]; tags: { name: string; value: string }[]; last_event: string };
export type EmailProvider = { send(payload: FrozenEmail, key: string): Promise<SendResult>; get(id: string): Promise<RetrievedEmail | null> };
export async function boundedRawBody(message: Request | Response, maximum = 65536) {
  const length = message.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new AppError(413, "Request too large.");
  const reader = message.body?.getReader(); if (!reader) throw new AppError(400, "Body required.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maximum) throw new AppError(413, "Request too large."); chunks.push(value); } return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
  catch (error) { await reader.cancel().catch(() => {}); throw error; }
}
const safeErrors = new Set(["validation_error", "missing_api_key", "invalid_api_key", "restricted_api_key", "suspended_api_key", "invalid_permission", "invalid_parameter", "missing_required_field", "missing_required_parameter", "invalid_idempotency_key", "daily_quota_exceeded", "monthly_quota_exceeded", "rate_limit_exceeded", "concurrent_idempotent_requests", "invalid_idempotent_request"]);
const retrievedSchema = z.object({ id: z.uuid(), from: z.string().max(350), to: z.array(emailAddressSchema).length(1), cc: z.array(emailAddressSchema).length(0).default([]), bcc: z.array(emailAddressSchema).length(0).default([]), html: z.union([z.null(), z.literal("")]).optional(), subject: z.string().max(200), text: z.string().max(12000).nullable(), reply_to: z.array(emailAddressSchema).max(1), tags: z.array(z.strictObject({ name: z.string().max(256), value: z.string().max(256) })).max(20).default([]), last_event: z.string().max(80) });
// Official REST endpoints let us abort the entire response within eight seconds and
// guarantee a single request with no SDK/environment-directed base URL or hidden retries.
export const resendProvider: EmailProvider = {
  async send(payload, idempotencyKey) {
    if (process.env.MATCHMAKER_TEST_MODE === "1") throw new AppError(503, "Live transport is disabled in tests.");
    const config = providerConfiguration(); if (!config.status.ready) throw new AppError(503, "Email transport needs operator configuration.");
    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), headers: { Authorization: "Bearer " + config.key, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ from: payload.from, to: [payload.recipient], ...(payload.replyTo ? { reply_to: payload.replyTo } : {}), subject: payload.subject, text: payload.body, tags: [{ name: "delivery_id", value: payload.deliveryId }] }) });
      const raw: unknown = JSON.parse(await boundedRawBody(response));
      if (response.ok) { const parsed = z.strictObject({ id: z.uuid() }).safeParse(raw); return parsed.success ? { outcome: "ACCEPTED", providerMessageId: parsed.data.id } : { outcome: "UNKNOWN", errorCode: "INVALID_PROVIDER_EVIDENCE" }; }
      const parsed = z.object({ name: z.string() }).safeParse(raw), name = parsed.success && safeErrors.has(parsed.data.name) ? parsed.data.name : "PROVIDER_ERROR";
      // A rejection of a retry cannot disprove acceptance of the original request;
      // that distinction is enforced again by the durable service.
      if (response.status >= 400 && response.status < 500 && ![408,409].includes(response.status)) return { outcome: "REJECTED", errorCode: name };
      return { outcome: "UNKNOWN", errorCode: name, retryBlocked: name === "invalid_idempotent_request" };
    } catch { return { outcome: "UNKNOWN", errorCode: "NETWORK_UNCERTAIN" }; }
  },
  async get(id) {
    if (process.env.MATCHMAKER_TEST_MODE === "1") throw new AppError(503, "Live transport is disabled in tests.");
    const config = providerConfiguration(); if (!config.status.ready) throw new AppError(503, "Email transport needs operator configuration.");
    try { const response = await fetch("https://api.resend.com/emails/" + z.uuid().parse(id), { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), headers: { Authorization: "Bearer " + config.key } }); if (!response.ok) return null; const parsed = retrievedSchema.safeParse(JSON.parse(await boundedRawBody(response))); return parsed.success ? parsed.data : null; } catch { return null; }
  },
};
const date = z.string().datetime({ offset: true });
const boundedText = z.string().max(2000);
const webhookSchema = z.strictObject({ type: z.enum(eventTypes), created_at: date, data: z.strictObject({
  email_id: z.uuid(), created_at: date, from: z.string().max(350), to: z.array(emailAddressSchema).min(1).max(50), subject: z.string().max(998),
  message_id: z.string().max(998).optional(), broadcast_id: z.uuid().nullable().optional(), template_id: z.uuid().nullable().optional(),
  tags: z.record(z.string().max(256), z.string().max(256)).refine(v => Object.keys(v).length <= 20).optional(),
  bounce: z.strictObject({ message: boundedText, subType: z.string().max(100), type: z.string().max(100) }).optional(),
  suppressed: z.strictObject({ message: boundedText, type: z.string().max(100) }).optional(),
  failed: z.strictObject({ reason: boundedText }).optional(),
}) });
export function verifyProviderWebhook(raw: string, headers: Headers) {
  const config = providerConfiguration(); if (!config.status.webhookReady) throw new AppError(503, "Webhook unavailable.");
  const id = headers.get("svix-id") ?? "", timestamp = headers.get("svix-timestamp") ?? "", signature = headers.get("svix-signature") ?? "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{10}$/.test(timestamp) || signature.length < 10 || signature.length > 1024) throw new AppError(400, "Invalid webhook.");
  try {
    const verified: unknown = new Resend("re_verification_only").webhooks.verify({ payload: raw, headers: { id, timestamp, signature }, webhookSecret: config.secret });
    const event = webhookSchema.parse(verified);
    if (Date.parse(event.created_at) > Date.now() + 300000) throw new Error("Future event");
    const tag = event.data.tags?.delivery_id;
    return { id, providerMessageId: event.data.email_id, type: event.type as EmailEventType, occurredAt: new Date(event.created_at), deliveryTag: tag && z.uuid().safeParse(tag).success ? tag : null };
  } catch { throw new AppError(400, "Invalid webhook."); }
}
