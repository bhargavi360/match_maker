import { bootstrap } from "@/server/bootstrap";
import { bootstrapSchema } from "@/domain/validation";
import { jsonBody, sameOrigin, rateLimit } from "@/server/security";
import { safeResponse } from "@/server/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit("bootstrap", 5);
    await bootstrap(await jsonBody(request, bootstrapSchema));
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
