"use client";
import { useState,type FormEvent } from "react";
import Link from "next/link";
import type { CandidateSummary } from "@/domain/matching";
import { SearchControls,readSearch } from "./search-controls";
import { Button,Badge } from "./ui";
import { api } from "./api";
type Request={kind:string;query:string;filters:ReturnType<typeof readSearch>["filters"];cursor?:string};
type Results={profiles:CandidateSummary[];total:number;nextCursor:string|null;interpretation:{source:string;message:string}|null};
export function ProfileSearch(){
  const [result,setResult]=useState<Results|null>(null),[request,setRequest]=useState<Request|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function run(input:Request,more=false){setBusy(true);setError("");try{const data=await api<Results>("/api/workspace/search/profiles","POST",input);setResult(previous=>more&&previous?{...data,profiles:[...previous.profiles,...data.profiles]}:data);setRequest({...input,cursor:undefined});}catch(e){setResult(null);setError(e instanceof Error?e.message:"Unable to search profiles.");}finally{setBusy(false);}}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);try{void run({kind:String(form.get("kind")),...readSearch(form)});}catch{setError("Review the structured filter values.");}}
  return <details className="panel panel-padding advanced-profile-search"><summary>Structured and natural-language profile search</summary><form className="form-stack" onSubmit={submit} aria-busy={busy}><p className="muted small">Advanced search is local, active-only and separated by classification. Relative filters and optional Gemini interpretation are available with a source in Matches.</p><label>Search classification<select className="control" name="kind"><option value="REAL">Real</option><option value="DEMO">Demo</option></select></label><SearchControls prefix="profile" /><Button type="submit" disabled={busy}>{busy?"Searching…":"Search recorded facts"}</Button></form>{error&&<p role="alert" className="form-error">{error}</p>}{result&&<><p role="status">{result.total} profiles satisfy these filters.</p>{result.interpretation&&<p><strong>{result.interpretation.source}</strong> · {result.interpretation.message}</p>}<ul className="search-profile-results">{result.profiles.map(p=><li key={p.id}><Link href={"/profiles/"+p.id}>{p.displayName}</Link> <Badge>{p.kind}</Badge><span className="muted small">{p.city??"City unknown"} · {p.reportedAge??"Age unknown"}</span></li>)}</ul>{result.nextCursor&&<Button variant="secondary" disabled={busy} onClick={()=>request&&void run({...request,cursor:result.nextCursor!},true)}>See more profile results</Button>}</>}</details>;
}
