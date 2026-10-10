"use client";

import { useState, type CSSProperties } from "react";
import { matchExamples, type MatchExample } from "@/data/preview";
import { Portrait } from "./profiles";
import { Badge, Button, SectionHeader } from "./ui";
import { Icon } from "./icons";

export function Score({ score }: { score: number }) { return <div className="score-ring" aria-label={`Illustrative heuristic score ${score} out of 100`}><strong>{score}</strong><span>/ 100</span></div>; }

export function FactorChart({ match }: { match: MatchExample }) {
  return <dl className="factor-chart">{match.factors.map(factor => <div className="factor-row" key={factor.name}><dt>{factor.name}</dt><dd><span className={`factor-track ${factor.score === null ? "factor-missing" : ""}`} aria-hidden="true"><span className="factor-bar" style={{ "--factor-width": `${factor.score ?? 0}%` } as CSSProperties} /></span><span className="factor-value">{factor.score === null ? "Unknown" : `${factor.score}/100`}</span></dd></div>)}</dl>;
}

export function MatchExplanation({ match }: { match: MatchExample }) {
  return <div className="explanation-grid"><section className="panel panel-padding"><SectionHeader title="A closer look at compatibility" description="Fixed factor examples · not calculated" /><FactorChart match={match} /></section><section className="panel panel-padding explanation-copy"><Badge tone="accent">Written example · no live AI</Badge><h2>More than a number</h2><p>{match.summary}</p><div className="completeness"><span><strong>{match.completeness}%</strong> illustrative data completeness</span><div className="completeness-track" aria-hidden="true"><span style={{ width: `${match.completeness}%` }} /></div><p className="muted small">{match.completeness < 80 ? "Partial evidence: several preferences are not recorded." : "Education preferences are not recorded in this example."}</p></div><details className="explanation-details"><summary>Read the limitations</summary><p>These scores and factors are hand-authored presentation examples. They are heuristic indicators, not scientifically validated probabilities. Missing information is not agreement, and no match is approved here.</p></details></section></div>;
}

export function MatchesPreview() {
  const [selected, setSelected] = useState(matchExamples[0]);
  return <><div className="source-strip panel"><Portrait profile={selected.source} className="mini-portrait" /><div><span className="eyebrow">EXAMPLE SOURCE PROFILE</span><strong>{selected.source.name}, {selected.source.age}</strong><span className="muted small">{selected.source.location} · {selected.source.goal}</span></div><Badge>2 fixed examples</Badge></div><div className="match-grid">{matchExamples.map(match => <article className={`match-card panel ${selected.id === match.id ? "selected-match" : ""}`} key={match.id}><div className="match-photo"><Portrait profile={match.candidate} /><span className="photo-label">Synthetic portrait</span></div><div className="match-card-copy"><div className="match-title"><div><h2>{match.candidate.name}, {match.candidate.age}</h2><p className="profile-detail"><Icon name="location" />{match.candidate.location}</p><p className="muted small">{match.candidate.occupation}</p></div><Score score={match.score} /></div><div className="tag-list">{match.candidate.values.map(value => <span key={value} className="tag">{value}</span>)}</div><p className="score-disclaimer">Illustrative heuristic score · not a probability</p><Button variant={selected.id === match.id ? "primary" : "secondary"} aria-pressed={selected.id === match.id} onClick={() => setSelected(match)}>{selected.id === match.id ? "Viewing breakdown" : "View breakdown"}<Icon name="arrow" /></Button></div></article>)}</div><div className="section-heading breakdown-heading"><h2>{selected.source.name} & {selected.candidate.name}</h2><Badge tone="warning">No match decision made</Badge></div><MatchExplanation match={selected} /><p className="muted small match-pagination-note">Two examples are bundled. Top 10 ranking and see-more behavior belong to the later matching stage.</p></>;
}
