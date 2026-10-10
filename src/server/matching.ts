import "server-only";
import { createHash,createHmac,timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { assess,rank,matchingPersonSchema,ageCurrent,ALGORITHM_VERSION,type MatchingPerson,type CandidateSummary,type RankedMatch } from "@/domain/matching";
import { allocateMaximumWeight,MAX_ALLOCATION_COUPLES,MAX_ALLOCATION_PROFILES,type AllocationEdge } from "@/domain/allocation";
import { checkAllocationProfile } from "@/domain/allocation-eligibility";
import { searchFiltersSchema,interpretLocal,matchesFilters,type Interpretation,type SearchFilters } from "@/domain/search";
import { weightsSchema,idSchema,revisionSchema,preferenceSchema } from "@/domain/validation";
import { db } from "./db";
import { requireMatchmaker } from "./auth";
import { AppError } from "./errors";

export const personSelect={
  id:true,displayName:true,gender:true,kind:true,status:true,reviewStatus:true,demoKey:true,revision:true,reportedAge:true,ageConfirmedOn:true,
  city:true,region:true,country:true,education:true,communicationStyle:true,interests:true,values:true,relationshipGoals:true,lifestyle:true,
  preference:{select:{data:true,revision:true}},
} satisfies Prisma.ProfileSelect;
export const matchRequestSchema=z.strictObject({
  sourceId:idSchema,filters:searchFiltersSchema.default({goals:[],interests:[],lifestyle:[]}),
  query:z.string().trim().max(300).default(""),limit:z.number().int().min(5).max(10).default(10),
});
export const profileSearchSchema=z.strictObject({
  kind:z.enum(["REAL","DEMO"]),filters:searchFiltersSchema.default({goals:[],interests:[],lifestyle:[]}),
  query:z.string().trim().max(300).default(""),cursor:z.string().max(512).optional(),
});
export const allocationRequestSchema=z.strictObject({kind:z.enum(["REAL","DEMO"])});
export const GLOBAL_ALLOCATOR_VERSION="general-weighted-blossom-v1";
export type MatchRequest=z.input<typeof matchRequestSchema>;
export type MatchPage={results:RankedMatch[];nextCursor:string|null;total:number;snapshot:string;algorithmVersion:string;weightVersion:number;filters:SearchFilters;interpretation:Omit<Interpretation,"safeQuery">|null;excluded:{ineligible:number;unresolved:number;reasons:Record<string,number>};source:CandidateSummary};
export type GlobalAllocation={kind:"REAL"|"DEMO";pairs:{left:CandidateSummary;right:CandidateSummary;score:number;assessment:ReturnType<typeof assess>}[];unmatched:{profile:CandidateSummary;reason:"NO_FEASIBLE_PAIR"|"INSUFFICIENT_SCORING_EVIDENCE"|"NOT_SELECTED_BY_OPTIMUM";message:string}[];eligibleProfileCount:number;excludedProfiles:Record<string,number>;pairCounts:{feasible:number;scored:number;unscored:number;ineligible:number;unresolved:number;reasons:Record<string,number>};totalScore:number;snapshot:string;algorithmVersion:string;allocatorVersion:string;weightVersion:number;maxCouples:number};
export function summary(p:MatchingPerson):CandidateSummary{return {id:p.id,displayName:p.displayName,reportedAge:p.reportedAge,city:p.city,kind:p.kind,demoKey:p.demoKey};}
function digest(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function sign(payload:string){const secret=process.env.BETTER_AUTH_SECRET;if(!secret||secret.length<32)throw new AppError(503,"Cursor configuration is unavailable.");return createHmac("sha256",secret).update("stage5:"+payload).digest("hex");}
function cursor(snapshot:string,offset:number){const payload=Buffer.from(JSON.stringify({snapshot,offset})).toString("base64url");return payload+"."+sign(payload);}
function offset(token:string|undefined,snapshot:string){
  if(!token)return 0;
  try{
    const [payload,signature,...extra]=token.split(".");
    if(extra.length||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw new Error();
    const parsed=z.strictObject({snapshot:z.string().length(64),offset:z.number().int().min(10).max(1000).multipleOf(10)}).parse(JSON.parse(Buffer.from(payload,"base64url").toString("utf8")));
    if(parsed.snapshot!==snapshot)throw new Error();
    return parsed.offset;
  }catch{throw new AppError(409,"These results changed or the page token is invalid. Run the search again.");}
}
export function mergeFilters(structured:SearchFilters,interpreted:SearchFilters):SearchFilters{
  const combined={...structured};
  for(const key of ["city","region","country","education","communicationStyle","sameLocation"] as const){
    if(interpreted[key]){if(combined[key]&&combined[key]!==interpreted[key])throw new AppError(400,"The query conflicts with a structured filter.");Object.assign(combined,{[key]:interpreted[key]});}
  }
  if(interpreted.minAge!==undefined)combined.minAge=Math.max(structured.minAge??18,interpreted.minAge);
  if(interpreted.maxAge!==undefined)combined.maxAge=Math.min(structured.maxAge??120,interpreted.maxAge);
  if(interpreted.minSharedInterests!==undefined)combined.minSharedInterests=Math.max(structured.minSharedInterests??1,interpreted.minSharedInterests);
  combined.interests=[...new Set([...structured.interests,...interpreted.interests])];combined.lifestyle=[...new Set([...structured.lifestyle,...interpreted.lifestyle])];
  if(interpreted.goals.length){combined.goals=structured.goals.length?structured.goals.filter(g=>interpreted.goals.includes(g)):interpreted.goals;if(!combined.goals.length)throw new AppError(400,"The relationship-goal filters conflict.");}
  return searchFiltersSchema.parse(combined);
}
function interpretation(raw:string){if(!raw)return null;const {safeQuery:_,...result}=interpretLocal(raw);void _;return result;}
export async function getScoringSettings(headers:Headers){
  const actor=await requireMatchmaker(headers);
  const row=await db().appSettings.findUnique({where:{ownerId:actor.id},select:{version:true,weights:true}});
  if(!row||!weightsSchema.safeParse(row.weights).success)throw new AppError(503,"Scoring settings need operator review.");
  return {version:row.version,weights:weightsSchema.parse(row.weights)};
}
export async function saveScoringSettings(headers:Headers,input:unknown){
  const actor=await requireMatchmaker(headers);
  const data=z.strictObject({weights:weightsSchema,version:revisionSchema,confirmation:z.literal("SAVE WEIGHTS")}).parse(input);
  return db().$transaction(async tx=>{
    const old=await tx.appSettings.findUnique({where:{ownerId:actor.id}});
    if(!old||old.version!==data.version)throw new AppError(409,"Scoring settings changed. Reload before saving.");
    const fields=Object.keys(data.weights).filter(key=>(old.weights as Record<string,number>)[key]!==data.weights[key as keyof typeof data.weights]);
    if(!fields.length)return {version:old.version,weights:data.weights};
    const changed=await tx.appSettings.updateMany({where:{ownerId:actor.id,version:data.version},data:{weights:data.weights,version:{increment:1}}});
    if(changed.count!==1)throw new AppError(409,"Scoring settings changed. Reload before saving.");
    await tx.auditEvent.create({data:{action:"SCORING_WEIGHTS_UPDATED",actorId:actor.id,fields}});
    return {version:data.version+1,weights:data.weights};
  });
}
async function dataset(headers:Headers,sourceId:string|null,kind?:"REAL"|"DEMO"){
  const actor=await requireMatchmaker(headers);
  return db().$transaction(async tx=>{
    const source=sourceId?await tx.profile.findFirst({where:{id:sourceId,ownerId:actor.id},select:personSelect}):null;
    if(sourceId&&!source)throw new AppError(404,"Source profile not found.");
    const rows=await tx.profile.findMany({where:{ownerId:actor.id,kind:source?.kind??kind},select:personSelect,take:1001,orderBy:{id:"asc"}});
    if(rows.length>1000)throw new AppError(422,"This local matching mode supports at most 1,000 profiles per classification. Narrow the dataset before continuing.");
    const settings=await tx.appSettings.findUnique({where:{ownerId:actor.id},select:{weights:true,version:true}});
    if(!settings||!weightsSchema.safeParse(settings.weights).success)throw new AppError(503,"Scoring settings need operator review.");
    return {source:source as MatchingPerson|null,rows:rows as MatchingPerson[],settings:{weights:weightsSchema.parse(settings.weights),version:settings.version}};
  });
}
function fingerprint(rows:MatchingPerson[],weights:unknown,version:number,context:unknown,today:string){
  return digest({rows:rows.map(p=>[p.id,p.revision,p.preference?.revision??null]),weights,version,context,today,algorithm:ALGORITHM_VERSION});
}
function assertReadySource(source:MatchingPerson,today:string){
  const parsed=matchingPersonSchema.safeParse(source);
  if(!parsed.success)throw new AppError(422,"The source matching facts need review.");
  if(parsed.data.status!=="ACTIVE"||parsed.data.reviewStatus!=="APPROVED"||!ageCurrent(parsed.data,today))throw new AppError(422,"Choose an active, approved profile with a current confirmed adult age.");
  if(parsed.data.preference&&!preferenceSchema.safeParse(parsed.data.preference.data).success)throw new AppError(422,"The source matching preferences need review.");
}
export async function matchingSources(headers:Headers){
  const actor=await requireMatchmaker(headers);
  const rows=await db().profile.findMany({where:{ownerId:actor.id,status:"ACTIVE",reviewStatus:"APPROVED"},take:1001,orderBy:[{displayName:"asc"},{id:"asc"}],select:personSelect});
  const today=new Date().toISOString().slice(0,10),ready=rows.filter(row=>{const parsed=matchingPersonSchema.safeParse(row);return parsed.success&&ageCurrent(parsed.data,today)&&(!parsed.data.preference||preferenceSchema.safeParse(parsed.data.preference.data).success);});
  return {sources:ready.slice(0,200).map(row=>summary(row as MatchingPerson)),truncated:ready.length>200};
}
export async function rankedMatches(headers:Headers,input:unknown):Promise<MatchPage>{
  await requireMatchmaker(headers);
  const request=matchRequestSchema.parse(input),data=await dataset(headers,request.sourceId),source=data.source!;
  const interpreted=interpretation(request.query),filters=interpreted?.recognized?mergeFilters(request.filters,interpreted.filters):request.filters;
  const today=new Date().toISOString().slice(0,10);
  assertReadySource(source,today);
  const snapshot=fingerprint(data.rows,data.settings.weights,data.settings.version,{source:source.id,filters,query:request.query,limit:request.limit},today);
  const excluded:MatchPage["excluded"]={ineligible:0,unresolved:0,reasons:{}};
  const results:RankedMatch[]=[];
  if(!request.query||interpreted?.recognized){
    for(const candidate of data.rows){
      if(candidate.id===source.id)continue;
      const assessment=assess(source,candidate,data.settings.weights,data.settings.version,today);
      if(assessment.eligibility.status!=="ELIGIBLE"){
        excluded[assessment.eligibility.status==="INELIGIBLE"?"ineligible":"unresolved"]++;
        for(const reason of assessment.eligibility.reasons)excluded.reasons[reason.code]=(excluded.reasons[reason.code]??0)+1;
        continue;
      }
      if(matchesFilters(candidate,filters,source))results.push({candidate:summary(candidate),assessment});
    }
  }
  const sorted=rank(results);
  return {results:sorted.slice(0,request.limit),nextCursor:null,total:sorted.length,snapshot,algorithmVersion:ALGORITHM_VERSION,weightVersion:data.settings.version,filters,interpretation:interpreted,excluded,source:summary(source)};
}
export async function allocateMatches(headers:Headers,input:unknown):Promise<GlobalAllocation>{
  await requireMatchmaker(headers);
  const request=allocationRequestSchema.parse(input),data=await dataset(headers,null,request.kind),today=new Date().toISOString().slice(0,10);
  const excludedProfiles:Record<string,number>={INACTIVE:0,REVIEW_PENDING:0,REVIEW_REJECTED:0,REVIEW_INVALID:0,UNDERAGE:0,UNDERAGE_OR_INVALID_FACTS:0,AGE_UNCONFIRMED:0,INVALID_PREFERENCES:0};
  const people:MatchingPerson[]=[];
  for(const row of data.rows){
    const checked=checkAllocationProfile(row,today);
    if(checked.person)people.push(checked.person);
    for(const reason of checked.reasons)excludedProfiles[reason]=(excludedProfiles[reason]??0)+1;
  }
  if(people.length>MAX_ALLOCATION_PROFILES)throw new AppError(422,"Global allocation supports at most "+MAX_ALLOCATION_PROFILES+" eligible profiles in one classification. Narrow the profile pool; no profiles were omitted.");
  const pairCounts:GlobalAllocation["pairCounts"]={feasible:0,scored:0,unscored:0,ineligible:0,unresolved:0,reasons:{}};
  const scoredEdges:AllocationEdge[]=[];
  const feasiblePartners=new Map(people.map(person=>[person.id,0]));
  const scoredPartners=new Map(people.map(person=>[person.id,0]));
  for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
    const left=people[i],right=people[j],assessment=assess(left,right,data.settings.weights,data.settings.version,today);
    if(assessment.eligibility.status!=="ELIGIBLE"){
      pairCounts[assessment.eligibility.status==="INELIGIBLE"?"ineligible":"unresolved"]++;
      for(const reason of assessment.eligibility.reasons)pairCounts.reasons[reason.code]=(pairCounts.reasons[reason.code]??0)+1;
      continue;
    }
    pairCounts.feasible++;
    feasiblePartners.set(left.id,(feasiblePartners.get(left.id)??0)+1);feasiblePartners.set(right.id,(feasiblePartners.get(right.id)??0)+1);
    if(assessment.overallScore===null){pairCounts.unscored++;continue;}
    pairCounts.scored++;
    scoredPartners.set(left.id,(scoredPartners.get(left.id)??0)+1);scoredPartners.set(right.id,(scoredPartners.get(right.id)??0)+1);
    scoredEdges.push({left:left.id,right:right.id,score:assessment.overallScore});
  }
  const allocation=allocateMaximumWeight(people.map(person=>person.id),scoredEdges,MAX_ALLOCATION_COUPLES);
  const byId=new Map(people.map(person=>[person.id,person]));
  const pairs=allocation.pairs.map(pair=>{
    const left=byId.get(pair.left)!,right=byId.get(pair.right)!;
    return {left:summary(left),right:summary(right),score:pair.score,assessment:assess(left,right,data.settings.weights,data.settings.version,today)};
  });
  const paired=new Set(allocation.pairs.flatMap(pair=>[pair.left,pair.right]));
  const unmatched=people.filter(person=>!paired.has(person.id)).map(person=>{
    if(!feasiblePartners.get(person.id))return {profile:summary(person),reason:"NO_FEASIBLE_PAIR" as const,message:"No pair for this profile passed the current mutual eligibility rules."};
    if(!scoredPartners.get(person.id))return {profile:summary(person),reason:"INSUFFICIENT_SCORING_EVIDENCE" as const,message:"Eligible pairings had insufficient mutual evidence for a numeric score; this is not an incompatibility finding."};
    return {profile:summary(person),reason:"NOT_SELECTED_BY_OPTIMUM" as const,message:"This profile was not included in the score-maximizing allocation; the result does not declare the profile incompatible."};
  });
  const snapshot=fingerprint(data.rows,data.settings.weights,data.settings.version,{kind:request.kind,maxCouples:MAX_ALLOCATION_COUPLES,allocator:GLOBAL_ALLOCATOR_VERSION},today);
  return {kind:request.kind,pairs,unmatched,eligibleProfileCount:people.length,excludedProfiles,pairCounts,totalScore:allocation.totalScore,snapshot,algorithmVersion:ALGORITHM_VERSION,allocatorVersion:GLOBAL_ALLOCATOR_VERSION,weightVersion:data.settings.version,maxCouples:MAX_ALLOCATION_COUPLES};
}
export async function assessPair(headers:Headers,sourceId:string,candidateId:string){
  await requireMatchmaker(headers);idSchema.parse(sourceId);idSchema.parse(candidateId);
  const data=await dataset(headers,sourceId),source=data.source!,today=new Date().toISOString().slice(0,10),candidate=data.rows.find(p=>p.id===candidateId);
  assertReadySource(source,today);
  if(!candidate)throw new AppError(404,"Eligible candidate not found in this classification.");
  const result=assess(source,candidate,data.settings.weights,data.settings.version,today);
  if(result.eligibility.status!=="ELIGIBLE")throw new AppError(422,"This pair is excluded or needs eligibility review.");
  return {assessment:result,stamp:digest(result),sourceId:source.id,candidateId:candidate.id};
}
export async function searchProfiles(headers:Headers,input:unknown){
  await requireMatchmaker(headers);
  const request=profileSearchSchema.parse(input),data=await dataset(headers,null,request.kind),interpreted=interpretation(request.query);
  const filters=interpreted?.recognized?mergeFilters(request.filters,interpreted.filters):request.filters;
  const relative=!!filters.sameLocation||!!filters.minSharedInterests;
  const snapshot=fingerprint(data.rows,data.settings.weights,data.settings.version,{kind:request.kind,filters,query:request.query},new Date().toISOString().slice(0,10)),start=offset(request.cursor,snapshot);
  const found=relative||request.query&&!interpreted?.recognized?[]:data.rows.filter(p=>p.status==="ACTIVE"&&p.reviewStatus==="APPROVED"&&matchingPersonSchema.safeParse(p).success&&matchesFilters(p,filters)).map(summary);
  return {profiles:found.slice(start,start+10),total:found.length,nextCursor:start+10<found.length?cursor(snapshot,start+10):null,interpretation:relative?{...interpreted,message:"Relative filters need a source profile. Use Matches.",recognized:false}:interpreted};
}
