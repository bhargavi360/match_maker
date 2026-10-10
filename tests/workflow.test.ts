import {test} from "node:test";
import assert from "node:assert/strict";
import {transition,validateWorkflow,sameAssessment,workflowCommandSchema,type WorkflowState} from "../src/domain/workflow";
import {assess,type MatchingPerson} from "../src/domain/matching";
import {defaultWeights} from "../src/domain/validation";
const start:WorkflowState={currentStep:1,status:"IN_PROGRESS",snapshotId:null,reviewedAt:null,decision:null};
const selected=transition(start,{action:"candidate",snapshotId:"snapshot"});
const reviewed=transition(selected,{action:"review",at:"2026-10-09T00:00:00Z"});
test("selection and explicit review precede approval; navigation never creates a decision",()=>{
  const step2=transition(start,{action:"navigate",step:2});assert.equal(step2.decision,null);
  assert.throws(()=>transition(start,{action:"approve"}));assert.throws(()=>transition(selected,{action:"approve"}));
  const approved=transition(reviewed,{action:"approve"});assert.equal(approved.status,"MATCH_APPROVED");assert.equal(approved.currentStep,4);
  assert.equal(transition(approved,{action:"navigate",step:5}).decision,"APPROVED");
});
test("back navigation preserves the reviewed snapshot and valid human approval",()=>{
  const approved=transition(reviewed,{action:"approve"});
  for(const step of [3,2,1,4,5]){const back=transition(approved,{action:"navigate",step});assert.equal(back.snapshotId,reviewed.snapshotId);assert.equal(back.reviewedAt,reviewed.reviewedAt);}
});
test("rejection cannot advance, repeat or silently change its pair",()=>{
  const rejected=transition(reviewed,{action:"reject"});
  for(const event of [{action:"navigate",step:4},{action:"approve"},{action:"reject"},{action:"source"},{action:"candidate",snapshotId:"other"}] as const)assert.throws(()=>transition(rejected,event));
});
test("reopen clears review and snapshot, retaining a distinct reopen event",()=>{
  for(const action of ["approve","reject"] as const){const reopened=transition(transition(reviewed,{action}),{action:"reopen"});assert.equal(reopened.decision,"REOPENED");assert.equal(reopened.snapshotId,null);assert.equal(reopened.reviewedAt,null);assert.equal(reopened.currentStep,2);assert.throws(()=>transition(reopened,{action:"approve"}));}
  assert.throws(()=>transition(selected,{action:"reopen"}));
});
test("source/candidate changes clear dependent context and stale evidence cannot advance",()=>{
  const source=transition(reviewed,{action:"source"});assert.equal(source.snapshotId,null);assert.equal(source.reviewedAt,null);
  assert.equal(transition(reviewed,{action:"candidate",snapshotId:"new"}).reviewedAt,null);
  const stale=transition(transition(reviewed,{action:"approve"}),{action:"stale"});assert.equal(stale.decision,"APPROVED");assert.equal(stale.reviewedAt,null);assert.equal(stale.currentStep,3);
  assert.throws(()=>transition(stale,{action:"navigate",step:4}));assert.throws(()=>transition(stale,{action:"review",at:"now"}));assert.throws(()=>transition(stale,{action:"refresh",snapshotId:"new"}));
  assert.equal(transition(transition(stale,{action:"navigate",step:2}),{action:"stale"}).currentStep,2);
});
test("archive freezes transitions and conflicting state/step combinations fail validation",()=>{
  assert.throws(()=>transition(transition(start,{action:"archive"}),{action:"navigate",step:2}));
  for(const invalid of [{...start,currentStep:4},{...start,status:"MATCH_APPROVED"},{...start,reviewedAt:"now"},{...start,currentStep:0},{...start,status:"MATCH_REJECTED"}])assert.throws(()=>validateWorkflow(invalid as WorkflowState));
});
const person:MatchingPerson={id:"11111111-1111-4111-8111-111111111111",kind:"REAL",status:"ACTIVE",reviewStatus:"APPROVED",gender:null,demoKey:null,displayName:"Synthetic",revision:1,reportedAge:30,ageConfirmedOn:"2026-10-09",city:"City",region:"Region",country:"Country",education:null,communicationStyle:"Direct",interests:["Art"],values:["Kindness"],relationshipGoals:["LONG_TERM"],lifestyle:[],preference:null};
const candidate={...person,id:"22222222-2222-4222-8222-222222222222"};
test("profile, preference, weight and algorithm versions invalidate exact assessment equality",()=>{
  const baseline=assess(person,candidate,defaultWeights,1,"2026-10-09");assert.ok(sameAssessment(baseline,baseline));
  for(const key of ["sourceRevision","candidateRevision","sourcePreferenceRevision","candidatePreferenceRevision","weightVersion"] as const)assert.equal(sameAssessment(baseline,{...baseline,[key]:2}),false);
  assert.equal(sameAssessment(baseline,{...baseline,algorithmVersion:"future"}),false);
});
test("self, mixed classifications and unknown strict-rule evidence cannot validate an approval assessment",()=>{
  const baseline=assess(person,candidate,defaultWeights,1,"2026-10-09");
  for(const other of [person,{...candidate,kind:"DEMO" as const,demoKey:"test"},{...candidate,reportedAge:null,ageConfirmedOn:null}])assert.equal(sameAssessment(baseline,assess(person,other,defaultWeights,1,"2026-10-09")),false);
  assert.throws(()=>workflowCommandSchema.parse({action:"approve",revision:1,snapshotId:candidate.id,confirmation:"APPROVE MATCH",actorId:"forged",score:100}));
});
