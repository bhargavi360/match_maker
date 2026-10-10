import { z } from "zod";
import { goals, lifestyles, preferenceSchema, profileReviewStatusSchema, weightsSchema } from "./validation";

export const ALGORITHM_VERSION = "mutual-coverage-v2";
export const AGE_FRESHNESS_DAYS = 365;
export const factorKeys = ["values","goals","interests","lifestyle","communication","location","age","education"] as const;
export type FactorKey = typeof factorKeys[number];
export type Weights = z.infer<typeof weightsSchema>;
export const factorLabels: Record<FactorKey,string> = { values:"Values", goals:"Relationship goals", interests:"Interests", lifestyle:"Lifestyle", communication:"Communication style", location:"Location", age:"Age preferences", education:"Education" };
const text = z.string().trim().min(1).max(160).nullable();
const items = z.array(z.string().trim().min(1).max(40)).max(12);
export const matchingPersonSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(["REAL","DEMO"]), status: z.enum(["ACTIVE","ARCHIVED"]), reviewStatus: profileReviewStatusSchema,
  displayName: z.string().min(1).max(80), gender: z.string().trim().min(1).max(80).nullable(), demoKey: z.string().nullable(), revision: z.number().int().positive(),
  reportedAge: z.number().int().min(18).max(120).nullable(), ageConfirmedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  city: text, region: text, country: text, education: text, communicationStyle: text,
  interests: items, values: items, relationshipGoals: z.array(z.enum(goals)).max(4), lifestyle: z.array(z.enum(lifestyles)).max(9),
  preference: z.strictObject({ data: z.unknown(), revision: z.number().int().positive() }).nullable(),
});
export type MatchingPerson = z.infer<typeof matchingPersonSchema>;
type Preference = z.infer<typeof preferenceSchema>;
export type Eligibility = { status:"ELIGIBLE"|"INELIGIBLE"|"UNRESOLVED"; reasons: { code:string; direction:"A"|"B"|"PAIR"; message:string }[] };
export type Factor = { key:FactorKey; scoreAB:number|null; scoreBA:number|null; mutualScore:number|null; evidenceCoverage:number; missing:string[] };
export type MatchReason = { code:string; factor:FactorKey|null; message:string };
export type Assessment = {
  eligibility: Eligibility; status:"SCORED"|"INSUFFICIENT_DATA"|"NOT_SCORED"; overallScore:number|null;
  weightedCompleteness:number; evidenceLabel:string; factors:Factor[]; algorithmVersion:string; weightVersion:number;
  matchingReasons:MatchReason[]; conflicts:MatchReason[]; warnings:string[];
  sourceRevision:number; candidateRevision:number; sourcePreferenceRevision:number|null; candidatePreferenceRevision:number|null;
};
export function normalize(value:string) { return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g," "); }
export function normalizedSet(values:string[]) { return [...new Set(values.map(normalize))].sort(); }
function overlap(a:string[],b:string[]) { const aa=normalizedSet(a),bb=normalizedSet(b); return aa.filter(item=>bb.includes(item)).length; }
function jaccard(a:string[],b:string[]) { return a.length && b.length ? 100*overlap(a,b)/new Set([...normalizedSet(a),...normalizedSet(b)]).size : null; }
function satisfaction(wanted:string[],actual:string[]) { return wanted.length && actual.length ? 100*overlap(wanted,actual)/normalizedSet(wanted).length : null; }
function preference(person:MatchingPerson):Preference|null { return person.preference ? preferenceSchema.parse(person.preference.data) : null; }
export function ageCurrent(person:MatchingPerson,today:string) {
  if(person.reportedAge===null || !person.ageConfirmedOn) return false;
  const stamp=Date.parse(person.ageConfirmedOn+"T00:00:00Z"),now=Date.parse(today+"T00:00:00Z");
  return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===person.ageConfirmedOn&&stamp<=now&&now-stamp<=AGE_FRESHNESS_DAYS*86400000;
}
function locationMatch(wanted:string[],other:MatchingPerson):boolean|null {
  if(!wanted.length) return null;
  const facts=[other.city,other.region,other.country].filter((v):v is string=>!!v).map(normalize);
  if(!facts.length) return null;
  if(wanted.map(normalize).some(v=>facts.includes(v))) return true;
  // A missing granularity could still contain an accepted place.
  return other.city&&other.region&&other.country ? false : null;
}
export function eligibility(a:MatchingPerson,b:MatchingPerson,today:string):Eligibility {
  const reasons:Eligibility["reasons"]=[];
  let violated=false;
  function add(code:string,direction:"A"|"B"|"PAIR",message:string,hard=false){ reasons.push({code,direction,message}); violated ||= hard; }
  if(a.id===b.id) add("SELF","PAIR","A profile cannot match itself.",true);
  if(a.status!=="ACTIVE"||b.status!=="ACTIVE") add("INACTIVE","PAIR","Both profiles must be active.",true);
  if(a.reviewStatus!=="APPROVED"||b.reviewStatus!=="APPROVED") add("REVIEW_NOT_APPROVED","PAIR","Both profiles must be approved.",true);
  if(a.kind!==b.kind) add("CLASSIFICATION","PAIR","Real and demo records cannot be paired.",true);
  if((a.reportedAge!==null&&a.reportedAge<18)||(b.reportedAge!==null&&b.reportedAge<18)) add("ADULT_ONLY","PAIR","Matching requires confirmed adult profiles.",true);
  const checkedA=matchingPersonSchema.safeParse(a),checkedB=matchingPersonSchema.safeParse(b);
  if(!checkedA.success||!checkedB.success) { add("INVALID_FACTS","PAIR","Stored matching facts need review."); return {status:violated?"INELIGIBLE":"UNRESOLVED",reasons}; }
  for(const [owner,other,direction] of [[a,b,"A"],[b,a,"B"]] as const){
    if(!ageCurrent(owner,today)) add("AGE_UNCONFIRMED",direction,"Confirm an adult age within the last 365 days.");
    const parsed=owner.preference ? preferenceSchema.safeParse(owner.preference.data) : null;
    if(parsed&&!parsed.success){add("INVALID_PREFERENCES",direction,"Stored preferences need review.");continue;}
    const pref=parsed?.data;
    if(owner.lifestyle.includes("SMOKER")&&owner.lifestyle.includes("NON_SMOKER")) add("CONFLICTING_LIFESTYLE",direction,"Recorded smoking facts conflict.");
    if(!pref) continue; // No hard-rule preferences are asserted; factor fallbacks remain explicit.
    for(const rule of pref.dealBreakers){
      let outcome:boolean|null=null;
      if(rule==="AGE_RANGE" && pref.minAge!==null && pref.maxAge!==null && ageCurrent(other,today)) outcome=other.reportedAge!>=pref.minAge&&other.reportedAge!<=pref.maxAge;
      if(rule==="LOCATION") outcome=locationMatch(pref.locations,other);
      if(rule==="RELATIONSHIP_GOALS"&&pref.goals.length&&other.relationshipGoals.length) outcome=overlap(pref.goals,other.relationshipGoals)>0;
      if(rule==="SMOKING"){
        const desired=pref.lifestyle.filter(v=>v==="NON_SMOKER"||v==="SMOKER");
        const actual=other.lifestyle.filter(v=>v==="NON_SMOKER"||v==="SMOKER");
        if(desired.length===1&&actual.length===1) outcome=desired[0]===actual[0];
      }
      if(outcome===false) add("DEAL_BREAKER_"+rule,direction,"A strict "+rule.toLowerCase().replaceAll("_"," ")+" rule is violated.",true);
      else if(outcome===null) add("UNRESOLVED_"+rule,direction,"A strict "+rule.toLowerCase().replaceAll("_"," ")+" rule lacks usable evidence.");
    }
  }
  return {status:violated?"INELIGIBLE":reasons.length?"UNRESOLVED":"ELIGIBLE",reasons};
}
type Direction = { score:number|null; coverage:number };
const known=(score:number|null):Direction=>({score,coverage:score===null?0:1});
function lifestyleScore(wanted:string[],actual:string[]):Direction{
  if(!wanted.length||!actual.length) return known(null);
  const requested=normalizedSet(wanted),facts=normalizedSet(actual);
  const opposites:Record<string,string>={early_riser:"night_owl",night_owl:"early_riser",non_smoker:"smoker",smoker:"non_smoker"};
  let usable=0,total=0;
  for(const value of requested){if(facts.includes(value)){usable++;total+=100;}else if(opposites[value]&&facts.includes(opposites[value]))usable++;}
  return {score:usable?total/usable:null,coverage:usable/requested.length};
}
function direction(key:FactorKey,a:MatchingPerson,b:MatchingPerson):Direction{
  const pref=preference(a);
  if(key==="interests") return known(jaccard(a.interests,b.interests));
  if(key==="values") return known(pref?.sharedValues.length?satisfaction(pref.sharedValues,b.values):jaccard(a.values,b.values));
  if(key==="goals") return known(pref?.goals.length?satisfaction(pref.goals,b.relationshipGoals):jaccard(a.relationshipGoals,b.relationshipGoals));
  if(key==="lifestyle") return lifestyleScore(pref?.lifestyle.length?pref.lifestyle:a.lifestyle,b.lifestyle);
  if(key==="communication") return known(!b.communicationStyle?null:pref?.communicationStyles.length?(pref.communicationStyles.map(normalize).includes(normalize(b.communicationStyle))?100:0):a.communicationStyle?(normalize(a.communicationStyle)===normalize(b.communicationStyle)?100:0):null);
  if(key==="education") return known(pref?.educationLevels.length&&b.education?(pref.educationLevels.map(normalize).includes(normalize(b.education))?100:0):null);
  if(key==="age"){
    if(pref?.minAge===null||pref?.maxAge===null||!pref||b.reportedAge===null) return known(null);
    return known(Math.max(0,100-10*Math.max(pref.minAge-b.reportedAge,b.reportedAge-pref.maxAge,0)));
  }
  if(pref?.locations.length){const accepted=locationMatch(pref.locations,b);return known(accepted===null?null:accepted?100:0);}
  if(!a.country||!b.country) return known(null);
  if(normalize(a.country)!==normalize(b.country)) return known(0);
  const coverage=(1+Number(!!a.region&&!!b.region)+Number(!!a.city&&!!b.city))/3;
  if(a.city&&b.city&&normalize(a.city)===normalize(b.city)&&(!a.region||!b.region||normalize(a.region)===normalize(b.region)))return {score:100,coverage};
  if(a.region&&b.region&&normalize(a.region)===normalize(b.region))return {score:70,coverage};
  return {score:40,coverage};
}
export function assess(a:MatchingPerson,b:MatchingPerson,rawWeights:unknown,weightVersion:number,today:string):Assessment{
  const weights=weightsSchema.parse(rawWeights),eligible=eligibility(a,b,today);
  const base={eligibility:eligible,algorithmVersion:ALGORITHM_VERSION,weightVersion,sourceRevision:a.revision,candidateRevision:b.revision,sourcePreferenceRevision:a.preference?.revision??null,candidatePreferenceRevision:b.preference?.revision??null};
  if(eligible.status!=="ELIGIBLE")return {...base,status:"NOT_SCORED",overallScore:null,weightedCompleteness:0,evidenceLabel:"Eligibility needs review",factors:[],matchingReasons:[],conflicts:eligible.reasons.filter(r=>r.code.startsWith("DEAL_BREAKER_")).map(r=>({code:r.code,factor:r.code.endsWith("AGE_RANGE")?"age":r.code.endsWith("LOCATION")?"location":r.code.endsWith("RELATIONSHIP_GOALS")?"goals":r.code.endsWith("SMOKING")?"lifestyle":null,message:r.message})),warnings:eligible.reasons.filter(r=>r.code.startsWith("UNRESOLVED_")||r.code==="AGE_UNCONFIRMED"||r.code==="INVALID_FACTS"||r.code==="INVALID_PREFERENCES").map(r=>r.message)};
  let numerator=0,covered=0;
  const factors=factorKeys.map(key=>{
    const ab=direction(key,a,b),ba=direction(key,b,a),coverage=Math.min(ab.coverage,ba.coverage);
    const mutual=ab.score===null||ba.score===null?null:Math.min(ab.score,ba.score);
    const evidenceCoverage=mutual===null?0:coverage;
    numerator+=weights[key]*evidenceCoverage*(mutual??0);covered+=weights[key]*evidenceCoverage;
    return {key,scoreAB:ab.score===null?null:Math.round(ab.score),scoreBA:ba.score===null?null:Math.round(ba.score),mutualScore:mutual===null?null:Math.round(mutual),evidenceCoverage,missing:[...(ab.coverage<1?["A's preference evidence is missing or partial."]:[]),...(ba.coverage<1?["B's preference evidence is missing or partial."]:[])]};
  });
  const completeness=Math.round(100*covered/Object.values(weights).reduce((sum,v)=>sum+v,0));
  const matchingReasons=factors.filter(f=>f.mutualScore!==null&&f.mutualScore>0).sort((a,b)=>(b.mutualScore??-1)-(a.mutualScore??-1)).slice(0,3).map(f=>({code:"MUTUAL_EVIDENCE_"+f.key.toUpperCase(),factor:f.key,message:"Recorded mutual "+factorLabels[f.key].toLowerCase()+" evidence: "+f.mutualScore+"/100."}));
  const conflicts=factors.filter(f=>f.mutualScore===0).map(f=>({code:"NO_MUTUAL_OVERLAP_"+f.key.toUpperCase(),factor:f.key,message:"No mutual recorded agreement for "+factorLabels[f.key].toLowerCase()+" (A: "+f.scoreAB+"/100; B: "+f.scoreBA+"/100). This is not a strict exclusion rule."}));
  const warnings=factors.flatMap(f=>f.missing.map(m=>factorLabels[f.key]+": "+m));
  return {...base,status:covered?"SCORED":"INSUFFICIENT_DATA",overallScore:covered?Math.round(numerator/covered):null,weightedCompleteness:completeness,evidenceLabel:completeness<50?"Limited evidence":completeness<80?"Partial evidence":"More complete evidence",factors,matchingReasons,conflicts,warnings};
}
export type CandidateSummary=Pick<MatchingPerson,"id"|"displayName"|"reportedAge"|"city"|"kind"|"demoKey">;
export type RankedMatch={candidate:CandidateSummary;assessment:Assessment};
export function rank(results:RankedMatch[]){
  return results.filter(r=>r.assessment.eligibility.status==="ELIGIBLE").sort((a,b)=>(b.assessment.overallScore??-1)-(a.assessment.overallScore??-1)||b.assessment.weightedCompleteness-a.assessment.weightedCompleteness||(a.candidate.id<b.candidate.id?-1:a.candidate.id>b.candidate.id?1:0));
}
export function localExplanation(result:Assessment){
  if(result.status==="INSUFFICIENT_DATA") return "There is insufficient mutual evidence for a numeric score. Record preferences and comparable facts before interpreting compatibility.";
  const strongest=(result.matchingReasons??[]).slice(0,2).map(reason=>reason.message).join(" ");
  const unknown=[...new Set((result.warnings??[]).map(warning=>warning.split(":",1)[0]))].join(", ");
  return "Conservative mutual indicators: "+(strongest||"none recorded")+". "+result.evidenceLabel+" ("+result.weightedCompleteness+"%). "+(unknown?"Missing or partial evidence: "+unknown+". ":"")+"Heuristic only; human review is required.";
}
