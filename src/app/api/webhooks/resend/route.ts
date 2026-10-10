import { emailService } from "@/server/email/service";
import { safeResponse } from "@/server/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return Response.json(await emailService.webhook(request), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return safeResponse(error); }
}
