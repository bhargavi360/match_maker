"use client";
import { useState } from "react";
import Link from "next/link";
import type { GlobalAllocation } from "@/server/matching";
import { api } from "./api";
import { Badge,Button,SectionHeader } from "./ui";

export function GlobalAllocationLive(){
  const [kind,setKind]=useState<"REAL"|"DEMO">("DEMO");
  const [result,setResult]=useState<GlobalAllocation|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function allocate(){
    setBusy(true);setError("");setResult(null);
    try{setResult(await api<GlobalAllocation>("/api/workspace/matches/allocate","POST",{kind}));}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to compute the allocation.");}
    finally{setBusy(false);}
  }
  const excludedProfileReasons=Object.entries(result?.excludedProfiles??{}).filter(([,count])=>count>0);
  const excludedPairReasons=Object.entries(result?.pairCounts.reasons??{}).filter(([,count])=>count>0);
  return <section className="panel panel-padding form-stack global-allocation">
    <SectionHeader title="Global one-to-one allocation" description="An exact, non-binding preview of the highest-total-score set of distinct eligible pairs." />
    <p className="muted">The allocation uses the existing mutual eligibility rules and numeric heuristic scores. It leaves unmatched profiles available, selects at most 25 couples, and does not infer a gender preference. A score is not a probability.</p>
    <label>Profile classification<select className="control" value={kind} disabled={busy} onChange={event=>{setKind(event.target.value as "REAL"|"DEMO");setResult(null);setError("");}}><option value="DEMO">DEMO synthetic profiles</option><option value="REAL">REAL profiles</option></select></label>
    <div className="button-row"><Button disabled={busy} onClick={allocate}>{busy?"Finding the global allocation…":"Compute allocation preview"}</Button><Badge tone="warning">Human review remains required</Badge></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {busy&&<p role="status">Checking current profile eligibility and pair evidence…</p>}
    {result&&<>
      <div className="results-heading"><p role="status"><strong>{result.pairs.length}</strong> couples · total heuristic score {result.totalScore} · {result.eligibleProfileCount} eligible profiles</p><Badge>{result.kind}</Badge></div>
      <p className="muted small">Objective: maximize the sum of the existing pair scores with up to {result.maxCouples} couples. Equal totals prefer fewer couples. This preview creates no workflow or approval decision.</p>
      <p className="muted small">Pair checks: {result.pairCounts.feasible} feasible · {result.pairCounts.scored} with numeric scores · {result.pairCounts.unscored} insufficient scoring evidence · {result.pairCounts.ineligible} ineligible · {result.pairCounts.unresolved} unresolved.</p>
      {!!excludedProfileReasons.length&&<details><summary>Profiles excluded from the allocation</summary><p className="muted small">One profile can have more than one exclusion reason.</p><ul>{excludedProfileReasons.map(([reason,count])=><li key={reason}>{reason.replaceAll("_"," ").toLowerCase()}: {count}</li>)}</ul></details>}
      {!!excludedPairReasons.length&&<details><summary>Pair eligibility reason counts</summary><ul>{excludedPairReasons.map(([reason,count])=><li key={reason}>{reason.replaceAll("_"," ").toLowerCase()}: {count}</li>)}</ul></details>}
      {result.pairs.length?<div className="match-grid">{[...result.pairs].sort((a,b)=>b.score-a.score||a.left.id.localeCompare(b.left.id)||a.right.id.localeCompare(b.right.id)).map(pair=><article className="match-card panel" key={pair.left.id+":"+pair.right.id}>
        <div className="match-card-copy">
          <div className="match-title"><div><h3>{pair.left.displayName}{pair.left.reportedAge!==null?", "+pair.left.reportedAge:""} + {pair.right.displayName}{pair.right.reportedAge!==null?", "+pair.right.reportedAge:""}</h3><p className="muted">{pair.left.city??"City unknown"} · {pair.right.city??"City unknown"}</p></div><div className="score-ring" aria-label={"Heuristic score "+pair.score+" out of 100"}><strong>{pair.score}</strong><span>/ 100</span></div></div>
          <p className="score-disclaimer">Heuristic compatibility indicator · not a probability</p>
          <div className="match-explanation-groups">
            <section><h4>Matching reasons</h4>{pair.assessment.matchingReasons.length?<ul>{pair.assessment.matchingReasons.map(reason=><li key={reason.code}>{reason.message}</li>)}</ul>:<p className="muted small">No mutual positive evidence was recorded.</p>}</section>
            <section><h4>Recorded conflicts</h4>{pair.assessment.conflicts.length?<ul>{pair.assessment.conflicts.map(reason=><li key={reason.code}>{reason.message}</li>)}</ul>:<p className="muted small">No scored factor has a zero mutual score.</p>}</section>
            <section><h4>Missing or unresolved evidence</h4>{pair.assessment.warnings.length?<ul>{pair.assessment.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>:<p className="muted small">No missing or partial factor evidence was detected.</p>}</section>
          </div>
          <div className="button-row"><Link className="text-link" href={"/profiles/"+pair.left.id}>View {pair.left.displayName}</Link><Link className="text-link" href={"/profiles/"+pair.right.id}>View {pair.right.displayName}</Link></div>
        </div>
      </article>)}</div>:<div className="panel"><h3>No couples selected</h3><p className="muted">No positive total-score improvement was found under the current eligibility and scoring evidence. Review the unmatched profile explanations below.</p></div>}
      {!!result.unmatched.length&&<details><summary>{result.unmatched.length} unmatched eligible profiles</summary><ul>{result.unmatched.map(item=><li key={item.profile.id}><Link className="text-link" href={"/profiles/"+item.profile.id}>{item.profile.displayName}</Link> — {item.message}</li>)}</ul><p className="muted small">Unmatched status is an allocation result, not a declaration of incompatibility.</p></details>}
      <details><summary>Allocation versions and limits</summary><p className="muted small">Scoring algorithm {result.algorithmVersion}; allocator {result.allocatorVersion}; weight version {result.weightVersion}; snapshot {result.snapshot}. The exact general-graph solver supports at most 400 eligible profiles per classification.</p></details>
    </>}
  </section>;
}
