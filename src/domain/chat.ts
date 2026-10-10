import { z } from "zod";
import { idSchema, revisionSchema, profileSchema } from "./validation";
import { emailTextSchema, type DraftDTO } from "./email";

export const chatText = z.string().min(1).max(2000).refine(v => !!v.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(v), "Use bounded plain text.");
export const chatTitle = z.string().trim().min(1).max(100).refine(v => !/[\u0000-\u001f\u007f-\u009f]/u.test(v));
export const tasks = ["NOTE", "SEARCH", "PROFILE", "MATCHES", "COMPARE", "EXPLANATION"] as const;
export const messageRequestSchema = z.strictObject({ requestId: idSchema, revision: revisionSchema, text: chatText, task: z.enum(tasks), useGemini: z.boolean().default(false), query: z.string().trim().max(100).default("") });
export const createConversationSchema = z.strictObject({ title: chatTitle, kind: z.enum(["REAL", "DEMO"]), sourceId: idSchema.nullable().default(null), candidateId: idSchema.nullable().default(null), workflowId: idSchema.nullable().default(null), draftId: idSchema.nullable().default(null) });
export const conversationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("rename"), revision: revisionSchema, title: chatTitle }),
  z.strictObject({ action: z.enum(["archive", "reopen"]), revision: revisionSchema }),
  z.strictObject({ action: z.literal("delete"), revision: revisionSchema, confirmation: z.literal("DELETE CONVERSATION") }),
]);
export const proposalInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("PROFILE_EDIT"), target: z.enum(["SOURCE", "CANDIDATE"]), field: z.enum(["displayName", "occupation", "bio"]), value: z.string().max(1500) }),
  z.strictObject({ kind: z.literal("WORKFLOW_NAVIGATE"), step: z.number().int().min(1).max(5) }),
  z.strictObject({ kind: z.literal("DRAFT_CREATE"), recipient: z.enum(["SOURCE", "CANDIDATE"]) }),
  z.strictObject({ kind: z.literal("DRAFT_EDIT"), ...emailTextSchema.shape }),
]);
export type ProposalInput = z.infer<typeof proposalInputSchema>;
export const operationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("PROFILE_EDIT"), targetId: idSchema, targetName: z.string().max(80), revision: revisionSchema, field: z.enum(["displayName", "occupation", "bio"]), before: z.string().nullable(), after: z.string().nullable(), profile: profileSchema }),
  z.strictObject({ kind: z.literal("WORKFLOW_NAVIGATE"), targetId: idSchema, revision: revisionSchema, before: z.number().int().min(1).max(5), step: z.number().int().min(1).max(5) }),
  z.strictObject({ kind: z.literal("DRAFT_CREATE"), targetId: idSchema, revision: revisionSchema, decisionId: idSchema, snapshotId: idSchema, recipient: z.enum(["SOURCE", "CANDIDATE"]), recipientName: z.string().max(80), ...emailTextSchema.shape }),
  z.strictObject({ kind: z.literal("DRAFT_EDIT"), targetId: idSchema, workflowId: idSchema, revision: revisionSchema, before: emailTextSchema, ...emailTextSchema.shape }),
]);
export type ChatOperation = z.infer<typeof operationSchema>;
export const proposalStates = ["PROPOSED", "AWAITING_CONFIRMATION", "CONFIRMED", "EXECUTED", "REJECTED", "FAILED", "EXPIRED", "CANCELLED"] as const;
export const proposalCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("confirm"), revision: revisionSchema, digest: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal("CONFIRM CHAT ACTION") }),
  z.strictObject({ action: z.enum(["reject", "cancel"]), revision: revisionSchema }),
  z.strictObject({ action: z.literal("revise"), revision: revisionSchema, proposal: proposalInputSchema }),
]);
export const chatLinkSchema = z.strictObject({ kind: z.enum(["PROFILE", "WORKFLOW", "DRAFT"]), id: idSchema, label: z.string().max(120) });
export const contentSchema = z.strictObject({ text: z.string().max(10000), links: z.array(chatLinkSchema).max(12).default([]), request: messageRequestSchema.optional() });
export type ChatContent = z.infer<typeof contentSchema>;
export type ConversationDTO = { id: string; title: string; kind: "REAL" | "DEMO"; state: "ACTIVE" | "ARCHIVED"; revision: number; sourceId: string | null; candidateId: string | null; workflowId: string | null; draftId: string | null; updatedAt: string };
export type MessageDTO = { id: string; sequence: number; requestId: string; role: "USER" | "TOOL" | "ASSISTANT"; origin: "LOCAL" | "TOOL" | "GEMINI"; status: "PROCESSING" | "COMPLETED" | "FAILED" | "INTERRUPTED"; task: typeof tasks[number]; createdAt: string; content: ChatContent; canRetry: boolean };
export type ProposalDTO = { id: string; revision: number; state: typeof proposalStates[number]; digest: string; operation: ChatOperation; createdAt: string; expiresAt: string; confirmedAt: string | null; executedAt: string | null; confirmedRevision: number | null; result: { id: string; revision: number } | null; errorCode: string | null };
export type ChatDetail = { conversation: ConversationDTO; messages: MessageDTO[]; before: number | null; proposals: ProposalDTO[]; proposalPage: number; hasMoreProposals: boolean; geminiAvailable: boolean; draft: DraftDTO | null };
