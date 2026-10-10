"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProfileDetail } from "@/domain/types";
import { consentScopes, goals, lifestyles, dealBreakers, preferenceSchema } from "@/domain/validation";
import { api } from "./api";
import { Badge, Button, TextInput, SectionHeader } from "./ui";
import { Dialog } from "./dialog";
function ErrorMessage({ message }: { message: string }) { return message ? <p role="alert" className="form-error">{message}</p> : null; }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Unable to complete the operation."; }
function PrivateContacts({ profile }: { profile: ProfileDetail }) {
  const router = useRouter();
  const [contact, setContact] = useState<{ email: string | null; phone: string | null; revision: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() { setBusy(true); setError(""); try { setContact(await api("/api/workspace/profiles/" + profile.id + "/contact")); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try { await api("/api/workspace/profiles/" + profile.id + "/contact", "PATCH", { revision: contact?.revision, contact: { email: String(form.get("email")), phone: String(form.get("phone")) } }); setContact(null); router.refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="panel panel-padding"><SectionHeader title="Private contacts" description="Encrypted at rest; excluded from lists and ordinary profile details" />{contact ? <form className="form-stack" onSubmit={save} aria-busy={busy}><label>Private email<TextInput name="email" type="email" maxLength={254} autoComplete="off" defaultValue={contact.email ?? ""} /></label><label>Private phone<TextInput name="phone" type="tel" maxLength={40} autoComplete="off" placeholder="+91 98765 43210" aria-describedby="detail-phone-help" defaultValue={contact.phone ?? ""} /></label><p id="detail-phone-help" className="muted small">Use + and the country code. This number is not verified.</p><div className="button-row"><Button type="submit" disabled={busy}>Save private contacts</Button><Button variant="secondary" onClick={() => setContact(null)}>Close contacts</Button></div></form> : <Button variant="secondary" disabled={busy} onClick={open}>{busy ? "Openingâ€¦" : "Open private contacts"}</Button>}<ErrorMessage message={error} /><p className="muted small">Demo profiles cannot store deliverable contacts. No email service is connected.</p></section>;
}
function Preferences({ profile }: { profile: ProfileDetail }) {
  const router = useRouter();
  const saved = profile.preference ? preferenceSchema.parse(profile.preference.data) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const split = (field: string) => String(form.get(field) ?? "").split(",").map(v => v.trim()).filter(Boolean);
    const preference = { minAge: form.get("minAge") ? Number(form.get("minAge")) : null, maxAge: form.get("maxAge") ? Number(form.get("maxAge")) : null, locations: split("locations"), sharedValues: split("sharedValues"), communicationStyles: split("communicationStyles"), educationLevels: split("educationLevels"), goals: form.getAll("goals"), lifestyle: form.getAll("lifestyle"), dealBreakers: form.getAll("dealBreakers") };
    try { await api("/api/workspace/profiles/" + profile.id + "/preference", "PATCH", { revision: profile.revision, preference }); router.refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="panel panel-padding"><SectionHeader title="Partner preferences" description="Optional, recorded preferences; unknown is not agreement" /><form className="form-stack" onSubmit={submit} aria-busy={busy}><div className="form-grid"><label>Preferred minimum age<TextInput name="minAge" type="number" min={18} max={120} defaultValue={saved?.minAge ?? ""} /></label><label>Preferred maximum age<TextInput name="maxAge" type="number" min={18} max={120} defaultValue={saved?.maxAge ?? ""} /></label><label>Preferred locations (comma-separated)<TextInput name="locations" maxLength={500} defaultValue={saved?.locations.join(", ")} /></label><label>Shared values (comma-separated)<TextInput name="sharedValues" maxLength={500} defaultValue={saved?.sharedValues.join(", ")} /></label><label>Acceptable communication styles (comma-separated)<TextInput name="communicationStyles" maxLength={500} defaultValue={saved?.communicationStyles.join(", ")} /></label><label>Acceptable education descriptions (comma-separated)<TextInput name="educationLevels" maxLength={500} defaultValue={saved?.educationLevels.join(", ")} /></label></div>{([{ name: "goals", label: "Preferred goals", values: goals }, { name: "lifestyle", label: "Preferred lifestyle", values: lifestyles }, { name: "dealBreakers", label: "Explicit deal-breakers", values: dealBreakers }] as const).map(group => <fieldset key={group.name} className="choice-group"><legend>{group.label}</legend>{group.values.map(value => <label key={value}><input type="checkbox" name={group.name} value={value} defaultChecked={saved?.[group.name].some(selected => selected === value)} />{value.replaceAll("_"," ").toLowerCase()}</label>)}</fieldset>)}<ErrorMessage message={error} /><Button disabled={busy} type="submit">{busy ? "Savingâ€¦" : "Save preferences"}</Button></form></section>;
}
function Consent({ profile }: { profile: ProfileDetail }) {
  const router = useRouter();
  const [scope, setScope] = useState<typeof consentScopes[number]>("SEARCH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const consent = { scope, status: String(form.get("status")), policyVersion: String(form.get("policyVersion")), provenance: String(form.get("provenance")) };
    try { await api("/api/workspace/profiles/" + profile.id + "/consent", "PATCH", { revision: profile.revision, consent }); router.refresh(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="panel panel-padding"><SectionHeader title="AI-processing permission" description="Permission recorded is separate from AI integration enabled" /><p className="muted">No AI request is made. Possessing a profile is not evidence of permission. Record each scope only from customer-provided consent.</p>{profile.kind === "DEMO" && <Badge tone="warning">Synthetic consent examples only</Badge>}<dl className="consent-list">{consentScopes.map(item => { const record = profile.consents.find(c => c.scope === item); return <div key={item}><dt>{item.replaceAll("_"," ")}</dt><dd><Badge tone={record?.status === "GRANTED" ? "success" : "neutral"}>{record?.status ?? "UNSET"}</Badge>{record && <p className="muted small">{record.synthetic ? "Synthetic evidence" : "Recorded evidence"} Â· {record.policyVersion} Â· {record.provenance} Â· revision {record.revision}</p>}</dd></div>; })}</dl><form className="form-stack" onSubmit={submit} aria-busy={busy}><div className="form-grid"><label>Consent scope<select className="control" value={scope} onChange={e => setScope(e.target.value as typeof scope)}>{consentScopes.map(s => <option key={s}>{s}</option>)}</select></label><label>Permission change<select className="control" name="status"><option value="GRANTED">Record grant</option><option value="WITHDRAWN">Record withdrawal</option></select></label><label>Policy version<TextInput name="policyVersion" required maxLength={40} placeholder="e.g. policy-v1" /></label><label>Internal evidence reference<TextInput name="provenance" required maxLength={120} placeholder={profile.kind === "DEMO" ? "synthetic-example" : "e.g. consent-record-123"} /></label></div><p className="muted small">Use an internal record reference, not a contact address or complete customer message. This permission applies only to the selected scope.</p><ErrorMessage message={error} /><Button disabled={busy} type="submit">{busy ? "Recordingâ€¦" : "Record permission change"}</Button></form></section>;
}
export function ProfileDetailView({ profile }: { profile: ProfileDetail }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function status() { setBusy(true); setError(""); try { await api("/api/workspace/profiles/" + profile.id + "/status", "PATCH", { revision: profile.revision, status: profile.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" }); router.refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function remove(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget); try { await api("/api/workspace/profiles/" + profile.id, "DELETE", { revision: profile.revision, confirmation: String(form.get("confirmation")) }); router.push("/profiles"); router.refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  const facts = [
    { label: "Gender", value: profile.gender ?? "Unknown / not reported" },
    { label: "Reported age", value: profile.reportedAge === null ? "Unknown" : profile.reportedAge + " · confirmed " + (profile.ageConfirmedOn ?? "Unknown") },
    { label: "Location", value: [profile.city, profile.region, profile.country].filter(Boolean).join(", ") || "Unknown" },
    { label: "Occupation", value: profile.occupation ?? "Unknown" },
    { label: "Education", value: profile.education ?? "Unknown" },
    { label: "Interests", value: profile.interests.join(", ") || "Unknown" },
    { label: "Values", value: profile.values.join(", ") || "Unknown" },
    { label: "Goals", value: profile.relationshipGoals.join(", ") || "Unknown" },
    { label: "Lifestyle", value: profile.lifestyle.join(", ") || "Unknown" },
    { label: "Communication", value: profile.communicationStyle ?? "Unknown" },
  ];
  const canReactivate = profile.reviewStatus === "APPROVED";
  const reviewTone = canReactivate ? "success" : "warning";
  return <div className="settings-stack">
    <section className="panel panel-padding">
      <div className="section-heading">
        <div>
          <div className="button-row"><Badge tone={profile.kind === "DEMO" ? "warning" : "neutral"}>{profile.kind} · {profile.status}</Badge><Badge tone={reviewTone}>Review: {profile.reviewStatus.toLowerCase()}</Badge></div>
          <p className="muted small">Revision {profile.revision} · updated {new Date(profile.updatedAt).toLocaleDateString("en-IN")}</p>
        </div>
        <Link href={"/profiles/" + profile.id + "/edit"} className="button button-secondary">Edit profile</Link>
      </div>
      <p>{profile.bio ?? "About information is unknown."}</p>
      <dl className="profile-facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
      {profile.reviewStatus !== "APPROVED" && <p className="muted" role="status">This profile is not eligible for matching until an explicit review flow approves it.</p>}
      <ErrorMessage message={error} />
      <div className="button-row">
        {profile.status === "ACTIVE" ? <Button variant="secondary" disabled={busy} onClick={status}>Archive profile</Button> : canReactivate ? <Button variant="secondary" disabled={busy} onClick={status}>Reactivate profile</Button> : <Button variant="secondary" disabled aria-describedby="review-status-help">Awaiting review</Button>}
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete permanently</Button>
      </div>
      {profile.status === "ARCHIVED" && !canReactivate && <p id="review-status-help" className="muted small">A profile must be approved before it can be reactivated.</p>}
    </section>
    <PrivateContacts profile={profile} />
    <Preferences profile={profile} />
    <Consent profile={profile} />
    <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete profile permanently">
      <p>This removes the profile, its contact/preferences/consent records, and every workflow in which it is the current source or selected candidate, including assessment snapshots and decision history. Conversations linked to this source or candidate, including their messages and proposals, are also removed. The sanitized audit history remains. Encrypted approved-email snapshots, attempts and provider evidence are retained for duplicate prevention and reconciliation. This does not cancel an accepted or uncertain send.</p>
      <form className="form-stack" onSubmit={remove}>
        <label>Type DELETE {profile.displayName}<TextInput name="confirmation" required autoComplete="off" maxLength={100} /></label>
        <ErrorMessage message={error} />
        <div className="button-row"><Button variant="danger" disabled={busy} type="submit">{busy ? "Deleting…" : "Confirm permanent deletion"}</Button><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Keep profile</Button></div>
      </form>
    </Dialog>
  </div>;
}
