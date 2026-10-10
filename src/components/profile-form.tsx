"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, SectionHeader, TextInput } from "./ui";
import { api } from "./api";
import { contactSchema, goals, lifestyles, profileSchema } from "@/domain/validation";
import { formatAgeConfirmedDisplay, parseAgeConfirmedDisplay } from "@/domain/profile-form";
import type { ProfileDTO } from "@/domain/types";

const scalarFields = [
  ["city", "City", 80], ["region", "Region / state", 80], ["country", "Country", 80],
  ["education", "Education", 160], ["occupation", "Occupation", 160], ["communicationStyle", "Communication style", 160],
] as const;

type ContactDraft = { email: string; phone: string };
type SavedProfile = { id: string; revision: number };

function errorText(error: unknown) { return error instanceof Error ? error.message : "Unable to save."; }

export function ProfileForm({ profile }: { profile?: ProfileDTO }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [loadingContact, setLoadingContact] = useState(false);
  const [error, setError] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactReady, setContactReady] = useState(!profile);
  const [contactDirty, setContactDirty] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({ email: "", phone: "" });
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(profile ? { id: profile.id, revision: profile.revision } : null);
  const [coreSaved, setCoreSaved] = useState(false);

  async function loadContact() {
    if (!profile) return;
    setLoadingContact(true);
    setContactError("");
    try {
      const contact = await api<{ email: string | null; phone: string | null }>("/api/workspace/profiles/" + profile.id + "/contact");
      setContactDraft({ email: contact.email ?? "", phone: contact.phone ?? "" });
      setContactReady(true);
      setContactDirty(false);
    } catch (caught) {
      setContactError(errorText(caught));
    } finally {
      setLoadingContact(false);
    }
  }

  function validatedContact() {
    const result = contactSchema.safeParse(contactDraft);
    if (!result.success) {
      const issue = result.error.issues[0];
      setContactError((issue.path.join(".") ? issue.path.join(".") + ": " : "") + issue.message);
      return null;
    }
    setContactError("");
    return result.data;
  }

  async function retryContact() {
    if (!savedProfile) return;
    const contact = validatedContact();
    if (!contact) return;
    setBusy(true);
    setContactError("");
    try {
      const result = await api<{ revision: number }>("/api/workspace/profiles/" + savedProfile.id + "/contact", "PATCH", { revision: savedProfile.revision, contact });
      setSavedProfile({ ...savedProfile, revision: result.revision });
      setContactDirty(false);
      router.push("/profiles/" + savedProfile.id);
      router.refresh();
    } catch (caught) {
      setContactError("The profile is saved, but private contacts were not saved. " + errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (coreSaved) return;
    setBusy(true);
    setError("");
    setContactError("");
    const form = new FormData(event.currentTarget);
    const shownDate = String(form.get("ageConfirmedOn") ?? "");
    const parsedDate = parseAgeConfirmedDisplay(shownDate);
    if (!parsedDate.ok) {
      setError("Age last confirmed must use DD-MM-YYYY and be a real calendar date.");
      setBusy(false);
      return;
    }
    const value = {
      displayName: String(form.get("displayName") ?? ""),
      gender: String(form.get("gender") ?? "").trim() || null,
      reportedAge: form.get("reportedAge") ? Number(form.get("reportedAge")) : null,
      ageConfirmedOn: parsedDate.value,
      ...Object.fromEntries(scalarFields.map(([field]) => [field, form.get(field) ? String(form.get(field)) : null])),
      interests: String(form.get("interests") ?? "").split(",").map(v => v.trim()).filter(Boolean),
      values: String(form.get("values") ?? "").split(",").map(v => v.trim()).filter(Boolean),
      relationshipGoals: form.getAll("relationshipGoals"),
      lifestyle: form.getAll("lifestyle"),
      bio: form.get("bio") ? String(form.get("bio")) : null,
    };
    const parsed = profileSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues.map(issue => issue.path.join(".") + ": " + issue.message).join(" "));
      setBusy(false);
      return;
    }
    const contact = contactReady && contactDirty && profile?.kind !== "DEMO" ? validatedContact() : null;
    if (contactReady && contactDirty && profile?.kind !== "DEMO" && !contact) {
      setBusy(false);
      return;
    }

    try {
      const saved = await api<ProfileDTO>("/api/workspace/profiles" + (profile ? "/" + profile.id : ""), profile ? "PATCH" : "POST", profile ? { revision: profile.revision, profile: parsed.data } : parsed.data);
      setSavedProfile({ id: saved.id, revision: saved.revision });
      setCoreSaved(true);
      if (contact) {
        try {
          const contactResult = await api<{ revision: number }>("/api/workspace/profiles/" + saved.id + "/contact", "PATCH", { revision: saved.revision, contact });
          setSavedProfile({ id: saved.id, revision: contactResult.revision });
          setContactDirty(false);
        } catch (caught) {
          setContactError("The profile is saved, but private contacts were not saved. Your entries are still here; retry the contact save below. " + errorText(caught));
          return;
        }
      }
      router.push("/profiles/" + saved.id);
      router.refresh();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const isDemo = profile?.kind === "DEMO";

  return <form className="panel panel-padding form-stack" onSubmit={submit} aria-busy={busy}>
    <p className="muted">New records are real profiles. Demo classification cannot be changed. Blank facts remain unknown; no gender or orientation is inferred.</p>
    <div className="form-grid">
      <label>Display name<TextInput name="displayName" required maxLength={80} defaultValue={profile?.displayName} /></label>
      <label>Gender (reported)<TextInput name="gender" maxLength={80} autoComplete="off" placeholder="Enter the person's own words" defaultValue={profile?.gender ?? ""} aria-describedby="gender-help" /></label>
      <label>Reported age<TextInput name="reportedAge" type="number" min={18} max={120} defaultValue={profile?.reportedAge ?? ""} /></label>
      <label>Age last confirmed (DD-MM-YYYY)<TextInput name="ageConfirmedOn" inputMode="numeric" placeholder="DD-MM-YYYY" maxLength={10} defaultValue={formatAgeConfirmedDisplay(profile?.ageConfirmedOn ?? null)} aria-describedby="age-confirmed-help" /></label>
      {scalarFields.map(([name, label, max]) => <label key={name}>{label}<TextInput name={name} maxLength={max} defaultValue={profile?.[name] ?? ""} /></label>)}
      <label>Interests (comma-separated)<TextInput name="interests" maxLength={500} defaultValue={profile?.interests.join(", ")} /></label>
      <label>Values (comma-separated)<TextInput name="values" maxLength={500} defaultValue={profile?.values.join(", ")} /></label>
    </div>
    <p id="gender-help" className="muted small">Leave blank when unknown or unreported. Record only the person&apos;s own wording; no category is inferred.</p>
    <p id="age-confirmed-help" className="muted small">Enter the date the reported age was last confirmed. The saved date is validated in the profile&apos;s standard date format.</p>
    <fieldset className="choice-group"><legend>Relationship goals — leave unchecked if unknown</legend>{goals.map(goal => <label key={goal}><input type="checkbox" name="relationshipGoals" value={goal} defaultChecked={profile?.relationshipGoals.includes(goal)} />{goal.replaceAll("_", " ").toLowerCase()}</label>)}</fieldset>
    <fieldset className="choice-group"><legend>Lifestyle — optional reported facts</legend>{lifestyles.map(style => <label key={style}><input type="checkbox" name="lifestyle" value={style} defaultChecked={profile?.lifestyle.includes(style)} />{style.replaceAll("_", " ").toLowerCase()}</label>)}</fieldset>
    <label>About<textarea className="control" name="bio" rows={5} maxLength={1500} defaultValue={profile?.bio ?? ""} /></label>

    <section className="form-stack" aria-labelledby="private-contact-heading">
      <SectionHeader title="Private contact details" description="Saved through the protected contact endpoint and encrypted at rest. Contact ownership is not verified." />
      {isDemo ? <p className="muted">Demo profiles cannot store deliverable contact details.</p> : profile && !contactReady ? <div><p className="muted small">Existing contact values are not included in profile data. Load them separately when you intend to view or edit them.</p><Button type="button" variant="secondary" disabled={loadingContact} onClick={loadContact}>{loadingContact ? "Loading private contacts…" : "Load private contacts"}</Button></div> : <>
        <div className="form-grid">
          <label>Private email<TextInput name="privateEmail" type="email" maxLength={254} autoComplete="off" value={contactDraft.email} onChange={event => { setContactDraft(current => ({ ...current, email: event.target.value })); setContactDirty(true); }} /></label>
          <label>Private mobile number (international)<TextInput name="privatePhone" type="tel" inputMode="tel" maxLength={40} autoComplete="off" placeholder="+91 98765 43210" value={contactDraft.phone} onChange={event => { setContactDraft(current => ({ ...current, phone: event.target.value })); setContactDirty(true); }} aria-describedby="phone-help" /></label>
        </div>
        <p id="phone-help" className="muted small">Include + and the country code. Email and mobile are not verified by this form.</p>
        <p className="muted small">Save profile fields and private contacts are separate operations. If the contact save fails, the profile remains saved and you can retry without submitting it again.</p>
      </>}
      {contactError && <p className="form-error" role="alert">{contactError}</p>}
      {coreSaved && contactError && <div className="button-row"><Button type="button" disabled={busy} onClick={retryContact}>{busy ? "Retrying…" : "Retry saving private contacts"}</Button><Link href={savedProfile ? "/profiles/" + savedProfile.id : "/profiles"} className="button button-secondary">Continue to profile</Link></div>}
    </section>

    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row">
      {!coreSaved && <Button disabled={busy || loadingContact} type="submit">{busy ? "Saving…" : profile ? "Save profile" : "Create profile"}</Button>}
      <Link href={profile ? "/profiles/" + profile.id : savedProfile ? "/profiles/" + savedProfile.id : "/profiles"} className="button button-secondary">{coreSaved ? "View profile" : "Cancel"}</Link>
    </div>
  </form>;
}
