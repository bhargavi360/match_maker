import { randomUUID } from "node:crypto";
import { AppError } from "./errors";

export type AuthFailureCategory = "credentials" | "session" | "verification" | "configuration" | "database" | "internal" | "auth_rejected";
export type AuthFailureDiagnostic = { category: AuthFailureCategory; code: string };

const knownAuthCodes: Record<string, AuthFailureDiagnostic> = {
  INVALID_EMAIL_OR_PASSWORD: { category: "credentials", code: "INVALID_EMAIL_OR_PASSWORD" },
  FAILED_TO_CREATE_SESSION: { category: "session", code: "FAILED_TO_CREATE_SESSION" },
  EMAIL_NOT_VERIFIED: { category: "verification", code: "EMAIL_NOT_VERIFIED" },
  EMAIL_PASSWORD_DISABLED: { category: "configuration", code: "EMAIL_PASSWORD_DISABLED" },
  INTERNAL_SERVER_ERROR: { category: "internal", code: "AUTH_INTERNAL_SERVER_ERROR" },
};

const sqliteErrorCodes = new Set([
  "SQLITE_BUSY",
  "SQLITE_CANTOPEN",
  "SQLITE_CONSTRAINT",
  "SQLITE_CONSTRAINT_TRIGGER",
  "SQLITE_CORRUPT",
  "SQLITE_ERROR",
  "SQLITE_LOCKED",
  "SQLITE_READONLY",
]);

function readErrorCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("code" in value)) return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function createAuthCorrelationId() {
  return randomUUID();
}

export async function classifyAuthResponse(response: Response): Promise<AuthFailureDiagnostic> {
  let code: string | undefined;
  try {
    const body: unknown = await response.clone().json();
    if (typeof body === "object" && body !== null && "code" in body) {
      const candidate = (body as { code?: unknown }).code;
      if (typeof candidate === "string") code = candidate;
    }
  } catch {
    // Keep malformed or non-JSON provider responses out of logs.
  }

  if (code && knownAuthCodes[code]) return knownAuthCodes[code];
  return response.status >= 500
    ? { category: "internal", code: `AUTH_HTTP_${response.status}` }
    : { category: "auth_rejected", code: `AUTH_HTTP_${response.status}` };
}

export function classifyAuthException(error: unknown): AuthFailureDiagnostic {
  if (error instanceof AppError && error.status >= 500) {
    return { category: "configuration", code: "AUTH_CONFIGURATION" };
  }

  const code = readErrorCode(error);
  if (code && knownAuthCodes[code]) return knownAuthCodes[code];
  if (code && /^P\d{4}$/.test(code)) return { category: "database", code: `PRISMA_${code}` };
  if (code && sqliteErrorCodes.has(code)) return { category: "database", code };
  return { category: "internal", code: "AUTH_SIGNIN_EXCEPTION" };
}

export function logAuthFailure(diagnostic: AuthFailureDiagnostic, correlationId = createAuthCorrelationId()) {
  console.error(JSON.stringify({ correlationId, category: diagnostic.category, code: diagnostic.code }));
}
