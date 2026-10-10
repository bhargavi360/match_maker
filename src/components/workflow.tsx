"use client";

import Link from "next/link";
import { useState } from "react";
import { matchExamples, sampleDraft, workflowSteps } from "@/data/preview";
import { MatchExplanation } from "./matches";
import { Portrait } from "./profiles";
import { Tabs } from "./tabs";
import { Badge, Button } from "./ui";
import { Icon } from "./icons";

export function WorkflowPreview() {
  const [step, setStep] = useState(2);
  const match = matchExamples[0];
  return <><div className="workflow-context"><span><strong>Aanya & Ishaan</strong><span className="muted"> · sample introduction journey</span></span><Badge tone="accent">Illustrative progress: step 3 of 5</Badge></div><p className="muted small">Explore each screen below. Switching previews does not advance a workflow or approve a match.</p><Tabs labels={workflowSteps} selected={step} onSelect={setStep}>
    {step === 0 && <section className="panel panel-padding"><p className="eyebrow">STEP 01 · SELECTION PREVIEW</p><h2>Start with a person, not a score.</h2><div className="workflow-person"><Portrait profile={match.source} /><div><h3>{match.source.name}, {match.source.age}</h3><p className="muted">{match.source.occupation} · {match.source.location}</p><p>{match.source.bio}</p><Link href="/profiles" className="button button-secondary">Explore synthetic profiles<Icon name="arrow" /></Link></div></div></section>}
    {step === 1 && <section className="panel panel-padding"><p className="eyebrow">STEP 02 · REVIEW PREVIEW</p><h2>Make room for a closer look.</h2><p className="muted">The sample candidates illustrate how profile information and compatibility evidence will appear.</p><div className="workflow-person"><Portrait profile={match.candidate} /><div><h3>{match.candidate.name}, {match.candidate.age}</h3><p>{match.candidate.bio}</p><Link href="/matches" className="button button-secondary">Explore match examples<Icon name="arrow" /></Link></div></div></section>}
    {step === 2 && <><MatchExplanation match={match} /><div className="approval-preview panel"><Icon name="shield" /><div><strong>Your judgment leads the way.</strong><p id="approval-note" className="muted small">This preview has no approval rules or saved decisions.</p></div><Button disabled aria-describedby="approval-note">Approve match unavailable</Button></div></>}
    {step === 3 && <section className="panel panel-padding"><p className="eyebrow">STEP 04 · DRAFT PREVIEW</p><h2>A personal introduction, in your words.</h2><p className="muted">A hand-written sample is available. No AI generated this text.</p><div className="draft-excerpt"><strong>{sampleDraft.subject}</strong><p>{sampleDraft.body.split("\n\n")[1]}</p></div><Link href="/email" className="button button-secondary">Open editable draft preview<Icon name="arrow" /></Link></section>}
    {step === 4 && <section className="panel panel-padding"><p className="eyebrow">STEP 05 · DELIVERY PREVIEW</p><h2>A final moment of intention.</h2><p id="delivery-note" className="muted">Sending and export are unavailable. No provider is connected and no email can leave this workspace.</p><div className="delivery-options"><div><Icon name="mail" /><h3>Send an introduction</h3><p className="muted small">Future human-approved provider delivery.</p><Button disabled aria-describedby="delivery-note">Send unavailable</Button></div><div><Icon name="work" /><h3>Keep a draft</h3><p className="muted small">Future saved drafts and export.</p><Button variant="secondary" disabled aria-describedby="delivery-note">Export unavailable</Button></div></div></section>}
  </Tabs><div className="workflow-navigation"><Button variant="secondary" disabled={step === 0} onClick={() => setStep(value => value - 1)}><Icon name="left" />Previous preview</Button><span className="muted small">Viewing screen {step + 1} of 5</span><Button variant="secondary" disabled={step === 4} onClick={() => setStep(value => value + 1)}>Next preview<Icon name="right" /></Button></div></>;
}
