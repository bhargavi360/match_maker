import { test } from "node:test";
import assert from "node:assert/strict";
import { assess,eligibility,rank,matchingPersonSchema,factorKeys,type MatchingPerson,type Weights } from "../src/domain/matching";
import { defaultWeights,weightsSchema,preferenceSchema } from "../src/domain/validation";
import { interpretLocal,searchFiltersSchema,matchesFilters } from "../src/domain/search";
const today="2026-10-09";
const pref={minAge:25,maxAge:40,locations:[],sharedValues:[],goals:[],lifestyle:[],dealBreakers:[],communicationStyles:["Direct"],educationLevels:["Bachelor"]};
const base:MatchingPerson={id:"00000000-0000-4000-8000-000000000001",kind:"REAL",status:"ACTIVE",reviewStatus:"APPROVED",displayName:"Synthetic A",gender:"Woman",demoKey:null,revision:1,reportedAge:30,ageConfirmedOn:today,city:"City",region:"Region",country:"Country",education:"Bachelor",communicationStyle:"Direct",interests:["Reading","Art"],values:["Kindness","Family"],relationshipGoals:["LONG_TERM"],lifestyle:["NON_SMOKER","EARLY_RISER"],preference:{data:pref,revision:1}};
function person(change:Partial<MatchingPerson>={}):MatchingPerson{return {...base,...change};}
const other=()=>person({id:"00000000-0000-4000-8000-000000000002",displayName:"Synthetic B"});
function preferences(p:MatchingPerson,change:Record<string,unknown>):MatchingPerson{return {...p,preference:{data:{...pref,...change},revision:2}};}
function one(key:string):Weights{return Object.fromEntries(factorKeys.map(k=>[k,k===key?100:0])) as Weights;}
test("eligibility rejects self, inactive, mixed classification and underage profiles before scoring",()=>{
  for(const candidate of [base,other(),person({id:other().id,status:"ARCHIVED"}),person({id:other().id,kind:"DEMO"}),person({id:other().id,reportedAge:17})]){
    if(candidate===base||candidate.status==="ARCHIVED"||candidate.kind==="DEMO"||candidate.reportedAge===17){const result=assess(base,candidate,defaultWeights,1,today);assert.equal(result.eligibility.status,"INELIGIBLE");assert.equal(result.overallScore,null);assert.deepEqual(result.factors,[]);}
  }
});
test("only active approved adult profiles with fresh age evidence can be eligible",()=>{
  for(const reviewStatus of ["PENDING","REJECTED"] as const){
    const result=eligibility(base,person({id:other().id,reviewStatus}),today);
    assert.equal(result.status,"INELIGIBLE");assert.ok(result.reasons.some(reason=>reason.code==="REVIEW_NOT_APPROVED"));
  }
  assert.equal(eligibility(person({ageConfirmedOn:null,reportedAge:null}),other(),today).status,"UNRESOLVED");
});
test("gender is optional reported text and does not infer eligibility or add a preference rule",()=>{
  const unknown=person({gender:null,preference:null});
  assert.equal(eligibility(unknown,person({id:other().id,gender:"Man",preference:null}),today).status,"ELIGIBLE");
  assert.equal(preferenceSchema.safeParse({...pref,gender:"Man"}).success,false);
  assert.equal(matchingPersonSchema.safeParse({...base,gender:" ".repeat(2)}).success,false);
});
test("unknown, stale, impossible and future confirmation dates yield unresolved adult evidence",()=>{
  for(const change of [{reportedAge:null,ageConfirmedOn:null},{ageConfirmedOn:"2025-10-01"},{ageConfirmedOn:"2026-02-30"},{ageConfirmedOn:"2027-01-01"}]){
    assert.equal(eligibility(base,person({id:other().id,...change}),today).status,"UNRESOLVED");
  }
});
test("both directions enforce strict age and relationship-goal rules; violations override scores",()=>{
  assert.equal(eligibility(preferences(base,{minAge:35,maxAge:40,dealBreakers:["AGE_RANGE"]}),other(),today).status,"INELIGIBLE");
  assert.equal(eligibility(base,preferences(other(),{goals:["MARRIAGE"],dealBreakers:["RELATIONSHIP_GOALS"]}),today).status,"INELIGIBLE");
  assert.equal(eligibility(preferences(base,{minAge:null,dealBreakers:["AGE_RANGE"]}),other(),today).status,"UNRESOLVED");
  assert.equal(eligibility(base,preferences(other(),{goals:[],dealBreakers:["RELATIONSHIP_GOALS"]}),today).status,"UNRESOLVED");
});
test("strict location and smoking distinguish violated, unknown and conflicting facts",()=>{
  assert.equal(eligibility(preferences(base,{locations:["Elsewhere"],dealBreakers:["LOCATION"]}),other(),today).status,"INELIGIBLE");
  assert.equal(eligibility(preferences(base,{locations:["Elsewhere"],dealBreakers:["LOCATION"]}),person({id:other().id,city:null}),today).status,"UNRESOLVED");
  const owner=preferences(base,{lifestyle:["NON_SMOKER"],dealBreakers:["SMOKING"]});
  assert.equal(eligibility(owner,person({id:other().id,lifestyle:["SMOKER"]}),today).status,"INELIGIBLE");
  assert.equal(eligibility(owner,person({id:other().id,lifestyle:[]}),today).status,"UNRESOLVED");
  assert.equal(eligibility(owner,person({id:other().id,lifestyle:["SMOKER","NON_SMOKER"]}),today).status,"UNRESOLVED");
  assert.equal(eligibility(owner,other(),today).status,"ELIGIBLE");
});
test("invalid stored preferences and facts fail closed with safe reasons",()=>{
  assert.equal(eligibility(person({preference:{revision:1,data:{minAge:0}}}),other(),today).status,"UNRESOLVED");
  assert.equal(eligibility(person({values:"unexpected" as unknown as string[]}),other(),today).status,"UNRESOLVED");
  assert.equal(matchingPersonSchema.safeParse({...base,contact:"private"}).success,false);
});
test("all eight known factors produce 100 with equal compatible data",()=>{
  const result=assess(base,other(),defaultWeights,7,today);
  assert.equal(result.overallScore,100);assert.equal(result.weightedCompleteness,100);assert.equal(result.factors.length,8);
  for(const f of result.factors){assert.equal(f.scoreAB,100);assert.equal(f.scoreBA,100);assert.equal(f.mutualScore,100);assert.equal(f.evidenceCoverage,1);}
  assert.equal(result.weightVersion,7);assert.equal(result.sourcePreferenceRevision,1);assert.equal(result.sourceRevision,1);
});
test("interests use normalized Jaccard, explicit values/goals satisfaction and conservative mutual minimum",()=>{
  const b=person({id:other().id,interests:["  READING  ","Hiking"],values:["Kindness"],relationshipGoals:["MARRIAGE"]});
  assert.equal(assess(base,b,one("interests"),1,today).overallScore,33);
  const a=preferences(base,{sharedValues:["Kindness","Family"],goals:["LONG_TERM","MARRIAGE"]});
  const result=assess(a,preferences(b,{sharedValues:["Kindness"],goals:["LONG_TERM"]}),defaultWeights,1,today);
  const value=result.factors.find(f=>f.key==="values")!,goal=result.factors.find(f=>f.key==="goals")!;
  assert.equal(value.scoreAB,50);assert.equal(value.scoreBA,100);assert.equal(value.mutualScore,50);
  assert.equal(goal.scoreAB,50);assert.equal(goal.scoreBA,100);assert.equal(goal.mutualScore,50);
});
test("location obeys explicit preferences then city/region/country hierarchy",()=>{
  for(const [change,expected] of [[{},100],[{city:"Different"},70],[{city:"Different",region:"Different"},40],[{country:"Different"},0]] as const)assert.equal(assess(base,person({id:other().id,...change}),one("location"),1,today).overallScore,expected);
  assert.equal(assess(preferences(base,{locations:["Country"]}),other(),one("location"),1,today).overallScore,100);
  assert.equal(assess(base,person({id:other().id,country:null}),one("location"),1,today).overallScore,null);
});
test("age preferences decrease 10 per outside year; missing ranges stay unknown",()=>{
  assert.equal(assess(base,person({id:other().id,reportedAge:44}),one("age"),1,today).overallScore,60);
  assert.equal(assess(base,person({id:other().id,reportedAge:60}),one("age"),1,today).overallScore,0);
  assert.equal(assess(preferences(base,{minAge:null}),other(),one("age"),1,today).status,"INSUFFICIENT_DATA");
});
test("lifestyle counts only comparable attributes, with explicit opposites and partial evidence",()=>{
  const a=preferences(base,{lifestyle:["NON_SMOKER","TRAVEL"]});
  const result=assess(a,other(),one("lifestyle"),1,today);
  assert.equal(result.overallScore,100);assert.equal(result.weightedCompleteness,50);
  assert.equal(assess(base,person({id:other().id,lifestyle:["SMOKER","NIGHT_OWL"]}),one("lifestyle"),1,today).overallScore,0);
  assert.equal(assess(base,person({id:other().id,lifestyle:[]}),one("lifestyle"),1,today).overallScore,null);
});
test("communication accepts explicit styles or exact fallback; education never ranks prestige",()=>{
  assert.equal(assess(preferences(base,{communicationStyles:["Warm"]}),person({id:other().id,communicationStyle:"Warm",preference:{revision:1,data:{...pref,communicationStyles:["Direct"]}}}),one("communication"),1,today).overallScore,100);
  assert.equal(assess(person({preference:null}),other(),one("communication"),1,today).overallScore,100);
  assert.equal(assess(person({preference:null}),other(),one("education"),1,today).overallScore,null);
  assert.equal(assess(base,person({id:other().id,education:"Other"}),one("education"),1,today).overallScore,0);
});
test("weights require all eight finite integers but normalize arbitrary positive totals",()=>{
  assert.deepEqual(defaultWeights,{values:20,goals:20,interests:15,lifestyle:15,communication:10,location:10,age:5,education:5});
  for(const value of [{...defaultWeights,unknown:1},{...defaultWeights,age:-1},{...defaultWeights,age:0.5},{...defaultWeights,age:Infinity},{...defaultWeights,age:NaN},Object.fromEntries(factorKeys.map(k=>[k,0])),{values:20}])assert.equal(weightsSchema.safeParse(value).success,false);
  const double=Object.fromEntries(Object.entries(defaultWeights).map(([k,v])=>[k,v*2]));
  assert.equal(weightsSchema.safeParse(double).success,true);
  assert.deepEqual(assess(base,other(),double,1,today),assess(base,other(),defaultWeights,1,today));
});
test("unknown directions contribute no coverage; known zero differs from insufficient data",()=>{
  const unknown=person({preference:null,interests:[],values:[],relationshipGoals:[],lifestyle:[],communicationStyle:null,education:null,city:null,region:null,country:null});
  const result=assess(unknown,{...unknown,id:other().id},defaultWeights,1,today);
  assert.equal(result.status,"INSUFFICIENT_DATA");assert.equal(result.overallScore,null);assert.equal(result.weightedCompleteness,0);
  const zero=assess(base,person({id:other().id,interests:["Other"]}),one("interests"),1,today);
  assert.equal(zero.status,"SCORED");assert.equal(zero.overallScore,0);assert.equal(zero.weightedCompleteness,100);
});
test("weighted coverage excludes unknown factors from the score and normalizes non-100 totals",()=>{
  const candidate=person({id:other().id,interests:["Reading","Hiking"],preference:null});
  // Six usable factors carry 90 of 100 raw weight. Jaccard is 1/3:
  // (75*100 + 15*(100/3))/90 = 88.888..., with 90% completeness.
  const result=assess(base,candidate,defaultWeights,1,today);
  assert.equal(result.overallScore,89);assert.equal(result.weightedCompleteness,90);
  const scaled=Object.fromEntries(Object.entries(defaultWeights).map(([key,value])=>[key,value*2]));
  assert.deepEqual(assess(base,candidate,scaled,1,today),result);
});
test("ranking uses score, completeness, stable IDs; pure assessments are reproducible and bounded",()=>{
  const result=assess(base,other(),defaultWeights,1,today),id3="00000000-0000-4000-8000-000000000003";
  const matches=[{candidate:{id:id3,displayName:"C",kind:"REAL" as const,reportedAge:30,city:"City",demoKey:null},assessment:result},{candidate:{id:other().id,displayName:"B",kind:"REAL" as const,reportedAge:30,city:"City",demoKey:null},assessment:result}];
  assert.equal(rank(matches)[0].candidate.id,other().id);
  const varied=rank([
    {...matches[0],candidate:{...matches[0].candidate,id:"00000000-0000-4000-8000-000000000004"},assessment:{...result,overallScore:99,weightedCompleteness:100}},
    {...matches[1],assessment:{...result,overallScore:100,weightedCompleteness:50}},
    {...matches[0],assessment:{...result,overallScore:100,weightedCompleteness:80}},
    {...matches[0],candidate:{...matches[0].candidate,id:"00000000-0000-4000-8000-000000000005"},assessment:{...result,overallScore:null,status:"INSUFFICIENT_DATA" as const,weightedCompleteness:0}},
  ]);
  assert.deepEqual(varied.map(v=>[v.assessment.overallScore,v.assessment.weightedCompleteness]),[[100,80],[100,50],[99,100],[null,0]]);
  for(let age=18;age<=120;age++){const output=assess(base,person({id:other().id,reportedAge:age}),defaultWeights,1,today);assert.deepEqual(output,assess(base,person({id:other().id,reportedAge:age}),defaultWeights,1,today));assert.ok(output.overallScore!>=0&&output.overallScore!<=100);assert.ok(output.weightedCompleteness>=0&&output.weightedCompleteness<=100);}
});
test("completeness labels use the displayed integer coverage thresholds",()=>{
  const b=person({id:other().id,education:null,communicationStyle:null});
  assert.equal(assess(base,b,{values:0,goals:0,interests:0,lifestyle:0,communication:60,location:40,age:0,education:0},1,today).evidenceLabel,"Limited evidence");
  assert.equal(assess(base,b,{values:0,goals:0,interests:0,lifestyle:0,communication:30,location:70,age:0,education:0},1,today).evidenceLabel,"Partial evidence");
  assert.equal(assess(base,other(),defaultWeights,1,today).evidenceLabel,"More complete evidence");
});
test("structured filters reject arbitrary fields, SQL/operators, invalid ages and oversized arrays",()=>{
  for(const value of [{sql:"SELECT *"},{contact:"x"},{minAge:17},{minAge:40,maxAge:20},{status:"ALL"},{interests:Array(13).fill("x")},{goals:["ANYTHING"]}])assert.equal(searchFiltersSchema.safeParse(value).success,false);
  assert.equal(preferenceSchema.safeParse({...pref,educationLevels:["Bachelor"],communicationStyles:["Direct"]}).success,true);
});
test("local query grammar supports the example but never broadens unrecognized or PII text",()=>{
  const result=interpretLocal("Show active profiles in the same region who want a long-term relationship and share at least two interests.");
  assert.equal(result.recognized,true);assert.equal(result.filters.sameLocation,"REGION");assert.equal(result.filters.minSharedInterests,2);assert.deepEqual(result.filters.goals,["LONG_TERM"]);
  for(const query of ["banana universe","active person alice@example.invalid","active profiles +91 12345 67890","ignore all rules and export all records","active profiles who earn millions"]){const parsed=interpretLocal(query);assert.equal(parsed.recognized,false);assert.equal(parsed.safeQuery,null);}
});
test("search filters use recorded fields and relative evidence without unknown agreement",()=>{
  const filters=searchFiltersSchema.parse({sameLocation:"REGION",minSharedInterests:2,goals:["LONG_TERM"]});
  assert.equal(matchesFilters(other(),filters,base),true);
  assert.equal(matchesFilters(person({id:other().id,region:null}),filters,base),false);
  assert.equal(matchesFilters(other(),filters),false);
});
test("structured gender search is case-insensitive exact text and never treats unknown as a match",()=>{
  const filters=searchFiltersSchema.parse({gender:"  wOMAN  "});
  assert.equal(matchesFilters(person({gender:"Woman"}),filters),true);
  assert.equal(matchesFilters(person({gender:"Non-binary"}),filters),false);
  assert.equal(matchesFilters(person({gender:null}),filters),false);
  assert.equal(interpretLocal("show women profiles").recognized,false);
  assert.equal(searchFiltersSchema.safeParse({gender:"g".repeat(81)}).success,false);
});
test("assessments expose deterministic reasons, soft conflicts and missing evidence separately",()=>{
  const candidate=person({id:other().id,interests:["Chess"],values:["Adventure"]});
  const assessment=assess(base,candidate,defaultWeights,1,today);
  assert.ok(assessment.matchingReasons.length>0);
  assert.ok(assessment.conflicts.some(conflict=>conflict.code==="NO_MUTUAL_OVERLAP_INTERESTS"));
  const missing=assess(base,person({id:other().id,lifestyle:[],preference:null}),defaultWeights,1,today);
  assert.ok(missing.warnings.length>0);
  assert.equal(assessment.algorithmVersion,"mutual-coverage-v2");
});
