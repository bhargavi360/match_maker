import { z } from "zod";
import { requireMatchmaker } from "@/server/auth";
import * as profiles from "@/server/profiles";
import { getDashboard, getSettings } from "@/server/dashboard";
import { sameOrigin, jsonBody } from "@/server/security";
import { AppError, safeResponse } from "@/server/errors";
import * as matching from "@/server/matching";
import * as workflows from "@/server/workflows";
import { aiGateway } from "@/server/ai-gateway";
import { emailService } from "@/server/email/service";
import { chatService } from "@/server/chat";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function dispatch(request: Request, context: Context) {
  try {
    await requireMatchmaker(request.headers);
    if (request.method !== "GET") sameOrigin(request);
    const parts = (await context.params).path;
    const path = parts.join("/");
    const body = request.method === "GET" ? undefined : await jsonBody(request, z.unknown());
    let result: unknown;
    if (request.method === "GET") {
      if (path === "chat") result = await chatService.list(request.headers, Object.fromEntries(new URL(request.url).searchParams));
      else if (parts.length === 2 && parts[0] === "chat") result = await chatService.get(request.headers, parts[1], Object.fromEntries(new URL(request.url).searchParams));
      else if (path === "profiles") result = await profiles.listProfiles(request.headers, Object.fromEntries(new URL(request.url).searchParams));
      else if (path === "email") result = await emailService.workspace(request.headers, Object.fromEntries(new URL(request.url).searchParams));
      else if (parts.length === 3 && parts[0] === "email" && parts[1] === "deliveries") result = await emailService.getDelivery(request.headers, parts[2]);
      else if (path === "dashboard") result = await getDashboard(request.headers);
      else if (path === "settings") result = await getSettings(request.headers);
      else if (path === "matches/sources") result = await matching.matchingSources(request.headers);
      else if (path === "workflows") result = await workflows.listWorkflows(request.headers, Object.fromEntries(new URL(request.url).searchParams));
      else if (parts.length === 2 && parts[0] === "workflows") result = await workflows.getWorkflow(request.headers, parts[1]);
      else if (path === "demo/reset") result = await profiles.previewDemoReset(request.headers);
      else if (parts.length === 2 && parts[0] === "profiles") result = await profiles.getProfile(request.headers, parts[1]);
      else if (parts.length === 3 && parts[0] === "profiles" && parts[2] === "contact") result = await profiles.getContact(request.headers, parts[1]);
      else throw new AppError(404, "Not found.");
    } else if (request.method === "POST" && path === "chat") result = await chatService.create(request.headers, body);
    else if (request.method === "POST" && parts.length === 3 && parts[0] === "chat" && parts[2] === "messages") result = await chatService.message(request.headers, parts[1], body);
    else if (request.method === "POST" && parts.length === 3 && parts[0] === "chat" && parts[2] === "proposals") result = await chatService.propose(request.headers, parts[1], body);
    else if (request.method === "POST" && parts.length === 4 && parts[0] === "chat" && parts[2] === "retry") result = await chatService.retry(request.headers, parts[1], parts[3], body);
    else if (request.method === "PATCH" && parts.length === 4 && parts[0] === "chat" && parts[2] === "proposals") result = await chatService.proposal(request.headers, parts[1], parts[3], body);
    else if (request.method === "PATCH" && parts.length === 2 && parts[0] === "chat") result = await chatService.change(request.headers, parts[1], body);
    else if (request.method === "DELETE" && parts.length === 2 && parts[0] === "chat") { z.strictObject({action:z.literal("delete"),revision:z.number().int().positive(),confirmation:z.literal("DELETE CONVERSATION")}).parse(body); result = await chatService.change(request.headers, parts[1], body); }
    else if (request.method === "POST" && path === "email/drafts") result = await emailService.createDraft(request.headers, body);
    else if (request.method === "PATCH" && parts.length === 3 && parts[0] === "email" && parts[1] === "drafts") result = await emailService.editDraft(request.headers, parts[2], body);
    else if (request.method === "POST" && parts.length === 4 && parts[0] === "email") {
      if (parts[1] === "drafts" && parts[3] === "preview") result = await emailService.previewApproval(request.headers, parts[2], body);
      else if (parts[1] === "drafts" && parts[3] === "approve") result = await emailService.approve(request.headers, parts[2], body);
      else if (parts[1] === "deliveries" && parts[3] === "preview") { z.strictObject({}).parse(body); result = await emailService.previewDelivery(request.headers, parts[2]); }
      else if (parts[1] === "deliveries" && parts[3] === "dispatch") result = await emailService.dispatch(request.headers, parts[2], body);
      else if (parts[1] === "deliveries" && parts[3] === "reconcile") result = await emailService.reconcile(request.headers, parts[2], body);
      else if (parts[1] === "deliveries" && parts[3] === "cancel") result = await emailService.cancel(request.headers, parts[2], body);
      else throw new AppError(404, "Not found.");
    }
    else if (request.method === "POST" && path === "workflows") result = await workflows.createWorkflow(request.headers, body);
    else if (request.method === "POST" && parts.length === 3 && parts[0] === "workflows" && parts[2] === "candidates") result = await workflows.workflowCandidates(request.headers, parts[1], body);
    else if (request.method === "PATCH" && parts.length === 2 && parts[0] === "workflows") result = await workflows.mutateWorkflow(request.headers, parts[1], body);
    else if (request.method === "POST" && path === "matches") result = await matching.rankedMatches(request.headers, body);
    else if (request.method === "POST" && path === "matches/allocate") result = await matching.allocateMatches(request.headers, body);
    else if (request.method === "POST" && path === "matches/explain") result = await aiGateway.explain(request.headers, body);
    else if (request.method === "POST" && path === "search/interpret") result = await aiGateway.interpret(request.headers, body);
    else if (request.method === "POST" && path === "search/profiles") result = await matching.searchProfiles(request.headers, body);
    else if (request.method === "PATCH" && path === "settings/weights") result = await matching.saveScoringSettings(request.headers, body);
    else if (request.method === "POST" && path === "profiles") result = await profiles.createProfile(request.headers, body);
    else if (request.method === "POST" && path === "demo/seed") { z.strictObject({ confirmation: z.literal("SEED DEMO") }).parse(body); result = await profiles.seedDemo(request.headers); }
    else if (request.method === "POST" && path === "demo/reset") result = await profiles.resetDemo(request.headers, body);
    else if (parts[0] === "profiles" && parts.length === 2 && request.method === "PATCH") result = await profiles.updateProfile(request.headers, parts[1], body);
    else if (parts[0] === "profiles" && parts.length === 2 && request.method === "DELETE") result = await profiles.deleteProfile(request.headers, parts[1], body);
    else if (parts[0] === "profiles" && parts.length === 3 && request.method === "PATCH") {
      if (parts[2] === "status") result = await profiles.changeStatus(request.headers, parts[1], body);
      else if (parts[2] === "contact") result = await profiles.saveContact(request.headers, parts[1], body);
      else if (parts[2] === "preference") result = await profiles.savePreference(request.headers, parts[1], body);
      else if (parts[2] === "consent") result = await profiles.saveConsent(request.headers, parts[1], body);
      else throw new AppError(404, "Not found.");
    } else throw new AppError(404, "Not found.");
    return Response.json(result, { status: request.method === "POST" && path === "profiles" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return safeResponse(error); }
}
export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
