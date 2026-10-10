import { z } from "zod";
import { idSchema, revisionSchema } from "./validation";
import type { Assessment, CandidateSummary } from "./matching";

export const workflowSteps = ["Select Customer", "Review Matches", "Read Explanation", "Generate Email", "Choose Delivery"] as const;
export type DecisionType = "APPROVED" | "REJECTED" | "REOPENED";
export type WorkflowStatus = "IN_PROGRESS" | "MATCH_APPROVED" | "MATCH_REJECTED" | "REVIEW_REQUIRED" | "ARCHIVED";
export type WorkflowState = { currentStep:number; status:WorkflowStatus; snapshotId:string|null; reviewedAt:string|null; decision:DecisionType|null };
export type WorkflowDTO = WorkflowState & {
  id:string; revision:number; sourceRevision:number; source:CandidateSummary; candidate:CandidateSummary|null;
  snapshot:{id:string; assessment:Assessment; createdAt:string}|null; stale:boolean;
  createdAt:string; updatedAt:string; archivedAt:string|null; historyTruncated:boolean;
  history:{id:string; type:DecisionType; sequence:number; snapshotId:string; sourceId:string; candidateId:string; reviewedAt:string|null; createdAt:string}[];
};
export type WorkflowList = { workflows:{id:string; source:CandidateSummary; candidate:CandidateSummary|null; status:WorkflowStatus; currentStep:number; updatedAt:string}[]; nextPage:number|null };
export const createWorkflowSchema=z.strictObject({sourceId:idSchema,sourceRevision:revisionSchema});
const revision={revision:revisionSchema};
const exact={...revision,snapshotId:idSchema};
export const workflowCommandSchema=z.discriminatedUnion("action",[
  z.strictObject({...revision,action:z.literal("source"),sourceId:idSchema,sourceRevision:revisionSchema}),
  z.strictObject({...revision,action:z.literal("candidate"),candidateId:idSchema,assessmentStamp:z.string().regex(/^[a-f0-9]{64}$/)}),
  z.strictObject({...revision,action:z.literal("refresh")}),
  z.strictObject({...exact,action:z.literal("review"),confirmation:z.literal("REVIEWED")}),
  z.strictObject({...exact,action:z.literal("approve"),confirmation:z.literal("APPROVE MATCH")}),
  z.strictObject({...exact,action:z.literal("reject"),confirmation:z.literal("REJECT MATCH")}),
  z.strictObject({...revision,action:z.literal("reopen"),confirmation:z.literal("REOPEN MATCH")}),
  z.strictObject({...revision,action:z.literal("navigate"),step:z.number().int().min(1).max(5)}),
  z.strictObject({...revision,action:z.literal("archive"),confirmation:z.literal("ARCHIVE WORKFLOW")}),
]);
export type WorkflowCommand=z.infer<typeof workflowCommandSchema>;
export type Transition = {action:"source"|"reopen"|"stale"|"archive"}|{action:"candidate"|"refresh";snapshotId:string}|{action:"review";at:string}|{action:"approve"|"reject"}|{action:"navigate";step:number};
export class WorkflowRuleError extends Error {}
function need(condition:unknown,message:string):asserts condition {if(!condition)throw new WorkflowRuleError(message);}
export function activeDecision(state:WorkflowState){return state.decision==="APPROVED"||state.decision==="REJECTED";}
export function validateWorkflow(state:WorkflowState){
  need(Number.isInteger(state.currentStep)&&state.currentStep>=1&&state.currentStep<=5,"Invalid workflow step.");
  need(!state.reviewedAt||state.snapshotId,"Review requires an exact snapshot.");
  if(state.status==="ARCHIVED")return;
  need(state.currentStep<=3||state.status==="MATCH_APPROVED","Approval is required before draft or delivery previews.");
  if(state.status==="MATCH_APPROVED")need(state.decision==="APPROVED"&&state.snapshotId&&state.reviewedAt,"Approval requires a reviewed snapshot and human decision.");
  if(state.status==="MATCH_REJECTED")need(state.decision==="REJECTED"&&state.snapshotId,"Rejection requires a decision snapshot.");
  if(state.status==="IN_PROGRESS")need(!activeDecision(state),"Reopen the active decision first.");
  if(state.status==="REVIEW_REQUIRED")need(!state.reviewedAt&&state.currentStep<=3,"Stale evidence cannot advance.");
  need(state.currentStep<3||state.snapshotId,"Select a current assessment before reading its explanation.");
}
export function transition(state:WorkflowState,event:Transition):WorkflowState{
  validateWorkflow(state);need(state.status!=="ARCHIVED","Archived workflows are read-only.");
  let next={...state};
  switch(event.action){
    case "source": need(!activeDecision(state),"Reopen the active decision before changing the source.");next={...next,currentStep:1,status:"IN_PROGRESS",snapshotId:null,reviewedAt:null};break;
    case "candidate": case "refresh": need(!activeDecision(state),"Reopen the active decision before changing its assessment.");next={...next,currentStep:3,status:"IN_PROGRESS",snapshotId:event.snapshotId,reviewedAt:null};break;
    case "review": need(state.status==="IN_PROGRESS"&&state.snapshotId,"Refresh the assessment before recording review.");next={...next,currentStep:3,reviewedAt:event.at};break;
    case "approve": case "reject": need(state.status==="IN_PROGRESS"&&state.snapshotId&&state.reviewedAt&&!activeDecision(state),"Explicit review of the current assessment is required.");next={...next,currentStep:event.action==="approve"?4:3,status:event.action==="approve"?"MATCH_APPROVED":"MATCH_REJECTED",decision:event.action==="approve"?"APPROVED":"REJECTED"};break;
    case "reopen": need(activeDecision(state)&&state.snapshotId,"Only an existing decision can be reopened.");next={...next,currentStep:2,status:"IN_PROGRESS",snapshotId:null,reviewedAt:null,decision:"REOPENED"};break;
    case "stale": next={...next,currentStep:state.currentStep<=2?state.currentStep:state.snapshotId?3:1,status:"REVIEW_REQUIRED",reviewedAt:null};break;
    case "navigate": need(event.step>=1&&event.step<=5&&Number.isInteger(event.step),"Invalid workflow step.");need(event.step<3||state.snapshotId,"Select a current candidate first.");need(event.step<4||state.status==="MATCH_APPROVED","Only a current human approval unlocks previews.");next.currentStep=event.step;break;
    case "archive":next.status="ARCHIVED";break;
  }
  validateWorkflow(next);return next;
}
export function sameAssessment(reviewed:Assessment,current:Assessment){
  return current.eligibility.status==="ELIGIBLE"&&JSON.stringify(reviewed)===JSON.stringify(current);
}
