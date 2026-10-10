"use client";
import { useState,useRef,type FormEvent,type CSSProperties } from "react";
import Link from "next/link";
import type { MatchPage,MatchRequest } from "@/server/matching";
import { type CandidateSummary,type Assessment,localExplanation,factorLabels } from "@/domain/matching";
import { type Interpretation } from "@/domain/search";
import { LivePortrait } from "./profiles-live";
import { MatchesPreview } from "./matches";
import { Badge,Button,EmptyState,SectionHeader } from "./ui";
import { SearchControls,readSearch,describeFilters } from "./search-controls";
import { api } from "./api";
import { Dialog } from "./dialog";

export function PairBreakdown({assessment,sourceId,candidateId}:{assessment:Assessment;sourceId:string;candidateId:string}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [explanation,setExplanation]=useState<{source:string;summary:string;notice:string;assessment:Assessment}|null>(null);
  const requestId=useRef(0);
  function close(){requestId.current++;setOpen(false);setExplanation(null);setError("");}
  async function explain(){const token=++requestId.current;setExplanation(null);setError("");setOpen(true);setBusy(true);try{const result=await api<NonNullable<typeof explanation>>("/api/workspace/matches/explain","POST",{sourceId,candidateId,useGemini:true});if(requestId.current===token)setExplanation(result);}catch(e){if(requestId.current===token)setError(e instanceof Error?e.message:"Unable to explain this pair.");}finally{if(requestId.current===token)setBusy(false);}}
  const reasons=assessment.matchingReasons??[],conflicts=assessment.conflicts??[],warnings=assessment.warnings??[];
  return <section className="panel panel-padding match-breakdown">
    <SectionHeader title="Deterministic factor breakdown" description="A → B and B → A are preference satisfaction; the lower direction is authoritative." />
    <Badge tone={assessment.eligibility.status==="ELIGIBLE"?"accent":"warning"}>Pair eligibility: {assessment.eligibility.status.toLowerCase()}</Badge>
    <dl className="factor-chart">{assessment.factors.map(f=><div className="factor-row live-factor" key={f.key}><dt>{factorLabels[f.key]}<small className="muted">A → B: {f.scoreAB??"Unknown"} · B → A: {f.scoreBA??"Unknown"}</small></dt><dd><span className={"factor-track "+(f.mutualScore===null?"factor-missing":"")} aria-hidden="true"><span className="factor-bar" style={{"--factor-width":(f.mutualScore??0)+"%"} as CSSProperties} /></span><span className="factor-value">{f.mutualScore===null?"Unknown":f.mutualScore+"/100"}</span><span className="muted small factor-evidence">{Math.round(f.evidenceCoverage*100)}% mutual evidence{f.missing.length?" · "+f.missing.join(" "):""}</span></dd></div>)}</dl>
    <div className="match-explanation-groups">
      <section><h3>Matching reasons</h3>{reasons.length?<ul>{reasons.map(reason=><li key={reason.code}>{reason.message}</li>)}</ul>:<p className="muted">No mutual positive evidence was recorded.</p>}</section>
      <section><h3>Recorded conflicts</h3>{conflicts.length?<ul>{conflicts.map(conflict=><li key={conflict.code}>{conflict.message}</li>)}</ul>:<p className="muted">No scored factor has a zero mutual score.</p>}</section>
      <section><h3>Missing or unresolved evidence</h3>{warnings.length?<ul>{warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>:<p className="muted">No missing or partial factor evidence was detected.</p>}</section>
    </div>
    <Badge tone="accent">Local explanation</Badge><p>{localExplanation(assessment)}</p>
    <p className="muted small">The current preference contract has no gender-preference field. Gender is not inferred or used as a pairing rule; reported gender can be filtered using structured search.</p>
    <details><summary>Versions and limitations</summary><p className="muted small">Algorithm {assessment.algorithmVersion}; weight version {assessment.weightVersion}; profile revisions {assessment.sourceRevision}/{assessment.candidateRevision}; preference revisions {assessment.sourcePreferenceRevision??"unset"}/{assessment.candidatePreferenceRevision??"unset"}. Unknown facts do not imply agreement. Age must have been confirmed within 365 days. This heuristic is not a probability of relationship success. Human review remains mandatory.</p></details>
    <div className="button-row"><Button variant="secondary" onClick={explain}>Optional Gemini explanation</Button></div>
    <p className="muted small">Each request rechecks both current EXPLANATION scopes. Gemini receives aliases and factor numbers only; no names, contacts or biographies. Explanations are temporary and never saved.</p>
    <Dialog open={open} onClose={close} title="Pair explanation">{busy&&<p role="status">Checking current evidence and permissions…</p>}{error&&<p role="alert" className="form-error">{error}</p>}{explanation&&<><Badge>{explanation.source}</Badge><p>{explanation.summary}</p><p className="muted small">{explanation.notice}</p></>}<Button variant="secondary" onClick={close}>Close explanation</Button></Dialog>
  </section>;
}

export function MatchesLive({sources,truncated,geminiConfigured}:{sources:CandidateSummary[];truncated:boolean;geminiConfigured:boolean}){
  const [sourceId,setSourceId]=useState(sources[0]?.id??""),[data,setData]=useState<MatchPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [selected,setSelected]=useState<string|null>(null),[interpretation,setInterpretation]=useState<Interpretation|null>(null);
  const formRef=useRef<HTMLFormElement>(null),generation=useRef(0);
  async function run(input:MatchRequest){
    const token=++generation.current;setBusy(true);setError("");setSelected(null);setData(null);
    try{const result=await api<MatchPage>("/api/workspace/matches","POST",input);if(generation.current===token)setData(result);}
    catch(e){if(generation.current===token){setError(e instanceof Error?e.message:"Unable to rank candidates.");setData(null);}}
    finally{if(generation.current===token)setBusy(false);}
  }
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setInterpretation(null);const form=new FormData(event.currentTarget);try{void run({sourceId,limit:Number(form.get("limit")??10),...readSearch(form)});}catch(e){setError(e instanceof Error?e.message:"Check the structured filters.");}}
  async function interpret(){if(!formRef.current)return;const query=String(new FormData(formRef.current).get("query")??"");setBusy(true);setError("");try{setInterpretation(await api("/api/workspace/search/interpret","POST",{sourceId,query,useGemini:true}));}catch(e){setError(e instanceof Error?e.message:"Unable to interpret the query.");}finally{setBusy(false);}}
  const active=data?.results.find(r=>r.candidate.id===selected);
  return <><form className="panel panel-padding form-stack matching-search" onSubmit={submit} ref={formRef} aria-busy={busy}>
    <label>Source profile<select className="control" name="sourceId" required value={sourceId} onChange={e=>{generation.current++;setSourceId(e.target.value);setData(null);setSelected(null);setInterpretation(null);setBusy(false);}}><option value="">Choose a source profile</option>{sources.map(p=><option key={p.id} value={p.id}>{p.displayName} · {p.kind} · {p.reportedAge??"age unknown"}</option>)}</select></label>
    {truncated&&<p className="muted small">The first 200 active, approved profiles with current age confirmation are listed.</p>}
    <label>Recommendations to show<select className="control" name="limit" defaultValue="10">{[5,6,7,8,9,10].map(count=><option key={count} value={count}>{count}</option>)}</select></label>
    <SearchControls relative prefix="match" />
    <div className="button-row"><Button type="submit" disabled={busy||!sourceId}>{busy?"Working…":"Rank candidates"}</Button><Button variant="secondary" disabled={busy||!sourceId} onClick={interpret}>Try optional Gemini interpretation</Button><Badge>{geminiConfigured?"Gemini optionally configured":"Gemini unconfigured · local fallback"}</Badge></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{interpretation&&<p role="status"><strong>{interpretation.source}</strong> · {interpretation.message}</p>}
  </form>
  {busy&&<p role="status">Loading current, authorized results…</p>}
  {data&&<><div className="results-heading"><p role="status"><strong>{data.total}</strong> eligible candidates; showing up to {data.results.length} recommendations · weight version {data.weightVersion}</p><Badge tone="warning">Human review required</Badge></div>
    {data.interpretation&&<p className="muted"><strong>{data.interpretation.source}</strong> · {data.interpretation.message}</p>}
    <p className="muted small">Applied filters: {describeFilters(data.filters)}. Strict rules excluded {data.excluded.ineligible} pairs; {data.excluded.unresolved} need eligibility review.</p>
    {!!Object.keys(data.excluded.reasons).length&&<details><summary>Eligibility reason codes</summary><ul>{Object.entries(data.excluded.reasons).map(([code,count])=><li key={code}>{code.replaceAll("_"," ").toLowerCase()}: {count}</li>)}</ul><p className="muted small">Excluded candidates are not exposed as scored results.</p></details>}
    {data.results.length?<><div className="match-grid">{data.results.map(({candidate,assessment})=><article className="match-card panel" key={candidate.id}><div className="match-photo"><LivePortrait profile={candidate} /><span className="photo-label">{candidate.kind==="DEMO"?"Synthetic portrait":"Neutral placeholder"}</span></div><div className="match-card-copy"><div className="match-title"><div><h2>{candidate.displayName}, {candidate.reportedAge}</h2><p className="muted">{candidate.city??"City unknown"}</p><Badge>{candidate.kind} · eligible</Badge></div><div className="score-ring" aria-label={assessment.overallScore===null?"Insufficient data":"Heuristic score "+assessment.overallScore+" out of 100"}><strong>{assessment.overallScore??"—"}</strong><span>{assessment.overallScore===null?"Unknown":"/ 100"}</span></div></div><p>{assessment.overallScore===null?"Insufficient data":assessment.evidenceLabel+" · "+assessment.weightedCompleteness+"% completeness"}</p><p className="score-disclaimer">Heuristic compatibility indicator · not a probability</p><Button variant={selected===candidate.id?"primary":"secondary"} onClick={()=>setSelected(candidate.id)} aria-pressed={selected===candidate.id}>View factor breakdown</Button><Link className="text-link" href={"/profiles/"+candidate.id}>View saved profile →</Link></div></article>)}</div>{active&&<PairBreakdown key={active.candidate.id+":"+data.snapshot} assessment={active.assessment} sourceId={sourceId} candidateId={active.candidate.id} />}</>:<div className="panel"><EmptyState title="No eligible results" description="Review the query, structured filters, confirmed ages and both people's strict preferences. Unknown hard-rule evidence needs review." /></div>}
  </>}
  {!data&&!busy&&!error&&<div className="panel"><EmptyState title={sources.length?"Choose a profile and explore":"A fresh space for matching"} description={sources.length?"Rank active, approved profiles in the same classification. Scores use local facts; no AI consent is needed for deterministic matching.":"Create profiles first or optionally seed synthetic records in Settings. Matching does not require Gemini."} action={<Link className="button button-secondary" href="/profiles">Review profiles</Link>} /></div>}
  <details className="preview-states"><summary>Design state examples</summary><p className="muted">These original fixed examples remain separate from actual matching results.</p><MatchesPreview /></details></>;
}
