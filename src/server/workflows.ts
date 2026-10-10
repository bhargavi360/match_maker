import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { assess, ageCurrent, matchingPersonSchema, type Assessment, type MatchingPerson } from "@/domain/matching";
import { idSchema, preferenceSchema, weightsSchema } from "@/domain/validation";
import { activeDecision, createWorkflowSchema, sameAssessment, transition, WorkflowRuleError, workflowCommandSchema, type DecisionType, type WorkflowDTO, type WorkflowList, type WorkflowState, type WorkflowStatus } from "@/domain/workflow";
import { requireMatchmaker } from "./auth";
import { db } from "./db";
import { AppError } from "./errors";
import { inTransaction } from "./transaction";
import { personSelect, rankedMatches, summary } from "./matching";
type Tx=Prisma.TransactionClient;
const include={source:{select:personSelect},candidate:{select:personSelect},selectedSnapshot:true,decisions:{orderBy:{sequence:"desc" as const},take:101}} satisfies Prisma.WorkflowInclude;
type Row=Prisma.WorkflowGetPayload<{include:typeof include}>;
const day=()=>new Date().toISOString().slice(0,10);
export function assessmentStamp(sourceId:string,candidateId:string,assessment:Assessment){return createHash("sha256").update(JSON.stringify({sourceId,candidateId,assessment})).digest("hex");}
function fail(code:string,message:string,status=409):never{throw new AppError(status,message,code);}
function state(row:Row):WorkflowState{return {currentStep:row.currentStep,status:row.status as WorkflowStatus,snapshotId:row.snapshotId,reviewedAt:row.reviewedAt?.toISOString()??null,decision:(row.decisions[0]?.type as DecisionType)??null};}
async function read(tx:Tx,id:string,ownerId:string){const row=await tx.workflow.findFirst({where:{id,source:{ownerId}},include});if(!row)fail("NOT_FOUND","Workflow not found.",404);return row;}
async function source(tx:Tx,id:string,revision:number,ownerId:string){
  const row=await tx.profile.findFirst({where:{id,ownerId},select:personSelect});
  if(!row)fail("NOT_FOUND","Source profile not found.",404);
  const parsed=matchingPersonSchema.safeParse(row);
  if(!parsed.success||row.status!=="ACTIVE"||row.reviewStatus!=="APPROVED"||!ageCurrent(parsed.data,day())||(row.preference&&!preferenceSchema.safeParse(row.preference.data).success))fail("INELIGIBLE","Select an active, approved profile with valid matching facts and a current confirmed adult age.",422);
  if(row.revision!==revision)fail("STALE_ASSESSMENT","The source changed. Reload before selecting it.");
  return row;
}
async function pair(tx:Tx,a:MatchingPerson,b:MatchingPerson,ownerId:string){
  const settings=await tx.appSettings.findUnique({where:{ownerId},select:{weights:true,version:true}});
  if(!settings||!weightsSchema.safeParse(settings.weights).success)fail("CONFIGURATION","Scoring settings need operator review.",503);
  return assess(a,b,settings.weights,settings.version,day());
}
async function isStale(tx:Tx,row:Row,ownerId:string){
  if(row.status==="ARCHIVED")return false;
  if(row.status==="REVIEW_REQUIRED"||row.source.status!=="ACTIVE")return true;
  if(!row.selectedSnapshot)return row.source.revision!==row.sourceRevision;
  if(!row.candidate)return true;
  const current=await pair(tx,row.source as MatchingPerson,row.candidate as MatchingPerson,ownerId);
  return !sameAssessment(row.selectedSnapshot.assessment as Assessment,current)||row.selectedSnapshot.stamp!==assessmentStamp(row.sourceId,row.candidateId!,current);
}
async function dto(tx:Tx,row:Row,ownerId:string):Promise<WorkflowDTO>{
  const stale=await isStale(tx,row,ownerId),current=stale?transition(state(row),{action:"stale"}):state(row);
  return {...current,reviewedAt:stale?null:current.reviewedAt,id:row.id,revision:row.revision,sourceRevision:row.sourceRevision,source:summary(row.source as MatchingPerson),candidate:row.candidate?summary(row.candidate as MatchingPerson):null,
    snapshot:row.selectedSnapshot?{id:row.selectedSnapshot.id,assessment:row.selectedSnapshot.assessment as Assessment,createdAt:row.selectedSnapshot.createdAt.toISOString()}:null,
    stale,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),archivedAt:row.archivedAt?.toISOString()??null,
    history:row.decisions.slice(0,100).reverse().map(d=>({id:d.id,type:d.type as DecisionType,sequence:d.sequence,snapshotId:d.snapshotId,sourceId:d.sourceId,candidateId:d.candidateId,reviewedAt:d.reviewedAt?.toISOString()??null,createdAt:d.createdAt.toISOString()})),historyTruncated:row.decisions.length>100,
  };
}
async function audit(tx:Tx,action:string,actorId:string,row:{id:string;revision:number;sourceId:string;candidateId:string|null},snapshotId:string|null=null){
  const saved=snapshotId?await tx.assessmentSnapshot.findUnique({where:{id:snapshotId},select:{assessment:true}}):null;
  const assessment=saved?.assessment as Assessment|undefined;
  const versions=assessment?{algorithmVersion:assessment.algorithmVersion,weightVersion:assessment.weightVersion,sourceRevision:assessment.sourceRevision,candidateRevision:assessment.candidateRevision,sourcePreferenceRevision:assessment.sourcePreferenceRevision,candidatePreferenceRevision:assessment.candidatePreferenceRevision}:{};
  await tx.auditEvent.create({data:{action,actorId,entityId:row.id,fields:{workflowRevision:row.revision,sourceId:row.sourceId,candidateId:row.candidateId,snapshotId,...versions,outcome:action==="WORKFLOW_STALE"?"REVIEW_REQUIRED":"PERSISTED"}}});
}
async function write(tx:Tx,row:Row,ownerId:string,next:WorkflowState,extra:Prisma.WorkflowUncheckedUpdateManyInput={}){
  const changed=await tx.workflow.updateMany({where:{id:row.id,revision:row.revision,source:{ownerId}},data:{...extra,currentStep:next.currentStep,status:next.status,snapshotId:next.snapshotId,reviewedAt:next.reviewedAt?new Date(next.reviewedAt):null,reviewedBy:next.reviewedAt?row.reviewedBy:null,revision:{increment:1}}});
  if(changed.count!==1)fail("CONFLICT","This workflow changed in another tab. Reload it.");
  return read(tx,row.id,ownerId);
}
async function transaction<T>(work:(tx:Tx)=>Promise<T>,existingTx?:Tx){
  try{return await inTransaction(work,existingTx);}
  catch(error){
    if(error instanceof WorkflowRuleError)fail("INVALID_TRANSITION",error.message);
    if(error&&typeof error==="object"&&"code" in error&&["P2002","P2034","P2028"].includes(String(error.code)))fail("CONFLICT","The workflow changed or this source already has an active workflow. Reload the workflow list.");
    throw error;
  }
}
export async function listWorkflows(headers:Headers,input:unknown={}):Promise<WorkflowList>{
  const actor=await requireMatchmaker(headers);
  const {page}=z.strictObject({page:z.coerce.number().int().min(1).max(10000).default(1)}).parse(input);
  const rows=await db().workflow.findMany({where:{source:{ownerId:actor.id}},take:21,skip:(page-1)*20,orderBy:[{updatedAt:"desc"},{id:"asc"}],select:{id:true,status:true,currentStep:true,updatedAt:true,source:{select:personSelect},candidate:{select:personSelect}}});
  return {workflows:rows.slice(0,20).map(w=>({id:w.id,source:summary(w.source as MatchingPerson),candidate:w.candidate?summary(w.candidate as MatchingPerson):null,status:w.status as WorkflowStatus,currentStep:w.currentStep,updatedAt:w.updatedAt.toISOString()})),nextPage:rows.length>20?page+1:null};
}
export async function getWorkflow(headers:Headers,id:string,existingTx?:Tx){const actor=await requireMatchmaker(headers);idSchema.parse(id);return transaction(async tx=>dto(tx,await read(tx,id,actor.id),actor.id),existingTx);}
export async function requireApprovedWorkflow(headers:Headers,tx:Tx,id:string){
  const actor=await requireMatchmaker(headers);idSchema.parse(id);
  const row=await read(tx,id,actor.id),decision=row.decisions[0];
  if(row.status!=="MATCH_APPROVED"||await isStale(tx,row,actor.id)||!row.candidate||!row.selectedSnapshot||!row.reviewedAt||!decision||decision.type!=="APPROVED"||decision.snapshotId!==row.snapshotId||decision.sourceId!==row.sourceId||decision.candidateId!==row.candidateId)fail("STALE_EMAIL_APPROVAL","A current reviewed, human-approved match is required. Reopen and review changed evidence.");
  return {id:row.id,sourceId:row.sourceId,candidateId:row.candidate.id,sourceName:row.source.displayName,candidateName:row.candidate.displayName,kind:row.source.kind,decisionId:decision.id,snapshotId:row.selectedSnapshot.id};
}
export async function createWorkflow(headers:Headers,input:unknown){
  const actor=await requireMatchmaker(headers),data=createWorkflowSchema.parse(input);
  return transaction(async tx=>{
    await source(tx,data.sourceId,data.sourceRevision,actor.id);
    const row=await tx.workflow.create({data:{sourceId:data.sourceId,sourceRevision:data.sourceRevision},include});
    await audit(tx,"WORKFLOW_CREATED",actor.id,row);
    return dto(tx,row,actor.id);
  });
}
export async function workflowCandidates(headers:Headers,id:string,input:unknown){
  await requireMatchmaker(headers);idSchema.parse(id);
  z.strictObject({}).parse(input);
  const workflow=await getWorkflow(headers,id);
  if(workflow.status==="ARCHIVED")fail("INVALID_TRANSITION","Archived workflows are read-only.");
  const page=await rankedMatches(headers,{sourceId:workflow.source.id});
  return {...page,results:page.results.map(r=>({...r,assessmentStamp:assessmentStamp(page.source.id,r.candidate.id,r.assessment)}))};
}
export async function mutateWorkflow(headers:Headers,id:string,input:unknown,existingTx?:Tx):Promise<WorkflowDTO>{
  const actor=await requireMatchmaker(headers);idSchema.parse(id);
  const command=workflowCommandSchema.parse(input);
  const result=await transaction(async tx=>{
    let row=await read(tx,id,actor.id);
    if(row.revision!==command.revision)fail("CONFLICT","This workflow changed in another tab. Reload it.");
    if(row.status==="ARCHIVED")fail("INVALID_TRANSITION","Archived workflows are read-only.");
    let current=state(row);
    // Explicit mutations may invalidate state. GET/rendering never writes reviews, decisions or audits.
    if(await isStale(tx,row,actor.id)&&!["archive","reopen","source","candidate","refresh"].includes(command.action)){
      if(command.action==="navigate"&&command.step<=2){
        const previousStatus=row.status;
        row=await write(tx,row,actor.id,transition(transition(current,{action:"stale"}),{action:"navigate",step:command.step}));
        if(previousStatus!=="REVIEW_REQUIRED")await audit(tx,"WORKFLOW_STALE",actor.id,row,row.snapshotId);
        await audit(tx,"WORKFLOW_STEP_CHANGED",actor.id,row,row.snapshotId);
        return {workflow:await dto(tx,row,actor.id)};
      }
      if(row.status!=="REVIEW_REQUIRED"){
        row=await write(tx,row,actor.id,transition(current,{action:"stale"}));
        await audit(tx,"WORKFLOW_STALE",actor.id,row,row.snapshotId);
      }
      return {stale:true as const}; // Commit invalidation before returning a safe conflict outside the transaction.
    }
    let next:WorkflowState,extra:Prisma.WorkflowUncheckedUpdateManyInput={},event:string;
    if(command.action==="source"){
      next=transition(current,{action:"source"});
      await source(tx,command.sourceId,command.sourceRevision,actor.id);
      extra={sourceId:command.sourceId,sourceRevision:command.sourceRevision,candidateId:null};event="WORKFLOW_SOURCE_SELECTED";
    }else if(command.action==="candidate"||command.action==="refresh"){
      if(activeDecision(current))fail("INVALID_TRANSITION","Reopen the active decision before refreshing or selecting a candidate.");
      const candidateId=command.action==="candidate"?command.candidateId:row.candidateId;
      if(!candidateId)fail("INVALID_TRANSITION","Choose a candidate before refreshing.");
      await source(tx,row.sourceId,row.source.revision,actor.id);
      const candidate=await tx.profile.findFirst({where:{id:candidateId,ownerId:actor.id},select:personSelect});
      if(!candidate)fail("INELIGIBLE","Candidate is unavailable.",422);
      const assessment=await pair(tx,row.source as MatchingPerson,candidate as MatchingPerson,actor.id);
      if(assessment.eligibility.status!=="ELIGIBLE")fail("INELIGIBLE","This pair is excluded or has unresolved eligibility. Review profiles and strict preferences.",422);
      const stamp=assessmentStamp(row.sourceId,candidateId,assessment);
      if(command.action==="candidate"&&stamp!==command.assessmentStamp)fail("STALE_ASSESSMENT","Candidate evidence changed. Load current candidates and review again.");
      const snapshot=await tx.assessmentSnapshot.create({data:{workflowId:id,sourceId:row.sourceId,candidateId,stamp,assessment:assessment as unknown as Prisma.InputJsonValue}});
      next=transition(current,{action:command.action,snapshotId:snapshot.id});
      extra={candidateId,sourceRevision:row.source.revision};event="WORKFLOW_CANDIDATE_SELECTED";
    }else if(command.action==="navigate"){
      next=transition(current,{action:"navigate",step:command.step});event="WORKFLOW_STEP_CHANGED";
    }else if(command.action==="archive"){
      next=transition(current,{action:"archive"});extra={archivedAt:new Date()};event="WORKFLOW_ARCHIVED";
    }else if(command.action==="reopen"){
      next=transition(current,{action:"reopen"});
      await tx.matchDecision.create({data:{workflowId:id,snapshotId:row.snapshotId!,sourceId:row.sourceId,candidateId:row.candidateId!,type:"REOPENED",actorId:actor.id,sequence:row.revision+1}});
      extra={sourceRevision:row.source.revision};event="MATCH_REOPENED";
    }else{
      if(command.snapshotId!==row.snapshotId||!row.selectedSnapshot||row.selectedSnapshot.workflowId!==id||row.selectedSnapshot.sourceId!==row.sourceId||row.selectedSnapshot.candidateId!==row.candidateId)fail("ASSESSMENT_MISMATCH","Select the assessment belonging to this workflow.");
      if(command.action==="review"){
        next=transition(current,{action:"review",at:new Date().toISOString()});
        row={...row,reviewedBy:actor.id};event="WORKFLOW_REVIEWED";
      }else{
        if(row.reviewedBy!==actor.id)fail("INVALID_TRANSITION","Explicit review by the authenticated matchmaker is required.");
        next=transition(current,{action:command.action});
        await tx.matchDecision.create({data:{workflowId:id,snapshotId:row.snapshotId!,sourceId:row.sourceId,candidateId:row.candidateId!,type:command.action==="approve"?"APPROVED":"REJECTED",actorId:actor.id,sequence:row.revision+1,reviewedAt:row.reviewedAt}});
        event=command.action==="approve"?"MATCH_APPROVED":"MATCH_REJECTED";
      }
    }
    current=next;
    const updated=await write(tx,row,actor.id,current,extra);
    await audit(tx,event,actor.id,updated,updated.snapshotId??row.snapshotId);
    return {workflow:await dto(tx,updated,actor.id)};
  },existingTx);
  if("stale" in result)fail("STALE_ASSESSMENT","Assessment changed. Reopen any existing decision, refresh the assessment and record a new review.");
  return result.workflow;
}
