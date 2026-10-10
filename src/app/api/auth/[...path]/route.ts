import { auth } from "@/server/auth";
import { loginSchema, registrationSchema } from "@/domain/validation";
import { jsonBody, sameOrigin, rateLimit } from "@/server/security";
import { AppError, safeResponse } from "@/server/errors";
import { db } from "@/server/db";
import { registerAccount } from "@/server/registration";
import { classifyAuthException, classifyAuthResponse, createAuthCorrelationId, logAuthFailure } from "@/server/auth-diagnostics";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = (await context.params).path.join("/");
  if (!["sign-in/email","sign-up/email","sign-out"].includes(path)) return Response.json({ error: "Not found." }, { status: 404 });
  try {
    sameOrigin(request);
    let response: Response;
    if (path === "sign-up/email") {
      await rateLimit("registration", 8);
      await registerAccount(await jsonBody(request, registrationSchema));
      return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (path === "sign-in/email") {
      await rateLimit("login", 10);
      const body = await jsonBody(request, loginSchema);
      const correlationId = createAuthCorrelationId();
      try {
        response = await auth().api.signInEmail({ body: { ...body, rememberMe: false }, headers: request.headers, asResponse: true });
      } catch (error) {
        logAuthFailure(classifyAuthException(error), correlationId);
        await db().auditEvent.create({ data: { action: "LOGIN_FAILED", fields: [] } });
        throw new AppError(401, "Unable to sign in with those credentials.");
      }
      if (!response.ok) {
        logAuthFailure(await classifyAuthResponse(response), correlationId);
        await db().auditEvent.create({ data: { action: "LOGIN_FAILED", fields: [] } });
        throw new AppError(401, "Unable to sign in with those credentials.");
      }
    } else {
      await jsonBody(request, loginSchema.pick({}).strict());
      response = await auth().api.signOut({ headers: request.headers, asResponse: true });
      if (!response.ok) throw new AppError(401, "Please sign in to continue.");
    }
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    return Response.json({ ok: true }, { headers });
  } catch (error) { return safeResponse(error); }
}
