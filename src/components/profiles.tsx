"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { PreviewProfile } from "@/data/preview";
import { profiles } from "@/data/preview";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { Badge, Button, EmptyState, ErrorState, ProfileSkeletons, TextInput } from "./ui";

const fallback = "/demo/portraits/fallback.svg";

export function Portrait({ profile, className = "", src }: { profile: PreviewProfile; className?: string; src?: string }) {
  const original = src ?? profile.portrait;
  const [failedSource, setFailedSource] = useState("");
  const actual = failedSource === original ? fallback : original;
  return <Image className={`portrait ${className}`} src={actual} width={560} height={700} unoptimized alt={actual === fallback ? `Portrait unavailable for ${profile.name}, a synthetic profile` : `AI-created portrait for ${profile.name}, a fictional adult`} onError={() => { if (actual !== fallback) setFailedSource(original); }} />;
}

export function ProfileCard({ profile, onView }: { profile: PreviewProfile; onView: () => void }) {
  return <article className="profile-card panel"><button className="profile-photo-button" type="button" onClick={onView} aria-label={`View ${profile.name}'s synthetic profile`}><Portrait profile={profile} /><span className="photo-label">Synthetic portrait</span></button><div className="profile-card-copy"><div className="profile-name-row"><h2>{profile.name}<span className="profile-age">, {profile.age}</span></h2><Badge>Demo</Badge></div><p className="profile-detail"><Icon name="location" />{profile.location}</p><p className="profile-detail"><Icon name="work" />{profile.occupation}</p><div className="tag-list">{profile.interests.slice(0, 3).map(tag => <span className="tag" key={tag}>{tag}</span>)}</div><div className="profile-card-footer"><span>{profile.goal}</span><button className="text-button" type="button" onClick={onView}>View profile<Icon name="arrow" /></button></div></div></article>;
}

export function ProfilesPreview() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [interest, setInterest] = useState("all");
  const [selected, setSelected] = useState<PreviewProfile | null>(null);
  const [state, setState] = useState<"ready" | "loading" | "error">("ready");
  const visible = profiles.filter(profile => (city === "all" || profile.location === city) && (interest === "all" || profile.interests.includes(interest)) && `${profile.name} ${profile.occupation} ${profile.location} ${profile.interests.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  function reset() { setQuery(""); setCity("all"); setInterest("all"); }
  return <>
    <div className="filter-toolbar"><div className="search-field"><Icon name="search" /><label className="sr-only" htmlFor="profile-search">Search synthetic profiles</label><TextInput id="profile-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, interest, or occupation…" type="search" /></div><div className="filter-field"><label htmlFor="city-filter">Location</label><select className="control" id="city-filter" value={city} onChange={event => setCity(event.target.value)}><option value="all">All cities</option><option>Bengaluru</option><option>Mumbai</option></select></div><div className="filter-field"><label htmlFor="interest-filter">Interest</label><select className="control" id="interest-filter" value={interest} onChange={event => setInterest(event.target.value)}><option value="all">All interests</option>{["Art", "Hiking", "Reading", "Cooking", "Travel"].map(value => <option key={value}>{value}</option>)}</select></div>{(query || city !== "all" || interest !== "all") && <Button variant="ghost" onClick={reset}>Reset filters</Button>}</div>
    <div className="results-heading"><p role="status"><strong>{visible.length}</strong> synthetic {visible.length === 1 ? "profile" : "profiles"}<span className="muted"> · local preview filters</span></p><span className="muted small">A person behind every possibility</span></div>
    {state === "loading" ? <ProfileSkeletons /> : state === "error" ? <ErrorState onRetry={() => setState("ready")} /> : visible.length ? <div className="profile-grid">{visible.map(profile => <ProfileCard key={profile.id} profile={profile} onView={() => setSelected(profile)} />)}</div> : <div className="panel"><EmptyState title="No profiles in this view" description="Try another search or clear your filters to see the four synthetic examples." action={<Button variant="secondary" onClick={reset}>Reset filters</Button>} /></div>}
    <details className="preview-states"><summary>Explore loading, error, and image fallback states</summary><p className="muted small">These are presentation examples. No requests or customer operations are simulated.</p><div className="button-row"><Button variant="secondary" aria-pressed={state === "ready"} onClick={() => setState("ready")}>Show profiles</Button><Button variant="secondary" aria-pressed={state === "loading"} onClick={() => setState("loading")}>Show loading preview</Button><Button variant="secondary" aria-pressed={state === "error"} onClick={() => setState("error")}>Show error preview</Button></div><div className="fallback-example"><Portrait profile={profiles[0]} src={fallback} /><div><strong>Bundled portrait fallback</strong><p className="muted small">A neutral local image replaces unavailable portraits automatically.</p></div></div></details>
    <Dialog open={selected !== null} onClose={() => setSelected(null)} title="Synthetic profile">{selected && <div className="profile-dialog-content"><Portrait profile={selected} /><div><Badge tone="accent">Fictional person · preview only</Badge><h3 className="dialog-profile-name">{selected.name}, {selected.age}</h3><p className="muted">{selected.occupation} · {selected.location}</p><p className="profile-bio">{selected.bio}</p><dl className="profile-facts"><div><dt>Education</dt><dd>{selected.education}</dd></div><div><dt>Relationship goal</dt><dd>{selected.goal}</dd></div><div><dt>Communication</dt><dd>{selected.communication}</dd></div><div><dt>Values</dt><dd>{selected.values.join(", ")}</dd></div></dl><p className="privacy-caption"><Icon name="lock" />No contact details are included in this preview.</p><Link className="button button-secondary" href="/matches" onClick={() => setSelected(null)}>Explore match examples<Icon name="arrow" /></Link></div></div>}</Dialog>
  </>;
}
