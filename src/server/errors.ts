import "server-only";
import { ZodError } from "zod";
export class AppError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
export function safeResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message, ...(error.code ? {code:error.code}: error.status===401?{code:"UNAUTHORIZED"}:error.status===403?{code:"FORBIDDEN"}:{}) }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  if (error instanceof ZodError) return Response.json({ error: "Check the form values.", issues: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
  return Response.json({ error: "This operation could not complete. Retry or ask the operator to check configuration." }, { status: 503 });
}
