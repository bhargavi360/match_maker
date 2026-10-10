"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";
import { Button, SectionHeader } from "./ui";
import { Dialog } from "./dialog";
type Summary = { profiles: number; contacts: number; preferences: number; consents: number; workflows:number; snapshots:number; decisions:number; emailDrafts:number; chatConversations:number; chatMessages:number; chatProposals:number; confirmationToken: string };
export function DemoControls() {
  const router = useRouter();
  const [preview, setPreview] = useState<Summary | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function action(kind: "seed" | "preview" | "reset") {
    setBusy(true); setError(""); setMessage("");
    try {
      if (kind === "seed") { await api("/api/workspace/demo/seed", "POST", { confirmation: "SEED DEMO" }); setMessage("Four demo profiles are available. Repeated seeding keeps existing demo records."); }
      else if (kind === "preview") { setPreview(await api("/api/workspace/demo/reset")); setConfirmation(""); }
      else { const result = await api<{ affected: number }>("/api/workspace/demo/reset", "POST", { confirmation, confirmationToken: preview?.confirmationToken }); setPreview(null); setMessage(result.affected + " demo profiles removed."); }
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to manage demo data."); }
    finally { setBusy(false); }
  }
  return <section className="panel panel-padding"><SectionHeader title="Optional demo data" description="Synthetic profiles stay classified as DEMO; real records and the account are preserved" /><p className="muted">Seeding is idempotent and never automatic. Demo records have no deliverable contacts or implied customer consent.</p><div className="button-row"><Button variant="secondary" disabled={busy} onClick={() => action("seed")}>Add synthetic demo profiles</Button><Button variant="danger" disabled={busy} onClick={() => action("preview")}>Review demo reset</Button></div>{message && <p role="status">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}<Dialog open={preview !== null} onClose={() => setPreview(null)} title="Reset demo records">{preview && <><p>{preview.profiles} demo profiles, {preview.contacts} contacts, {preview.preferences} preference records, and {preview.consents} consent records will be deleted.</p><p>{preview.workflows} demo workflows, {preview.snapshots} assessment snapshots and {preview.decisions} decision events and {preview.emailDrafts} encrypted email drafts will also be deleted.</p><p>{preview.chatConversations} profile-linked demo conversations, {preview.chatMessages} saved messages and {preview.chatProposals} action proposals will be deleted.</p><p className="muted">Every real profile, account, bootstrap latch, and settings record is preserved.</p><label className="form-stack">Type RESET DEMO<input className="control" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>{error && <p role="alert" className="form-error">{error}</p>}<div className="button-row"><Button variant="danger" disabled={busy || confirmation !== "RESET DEMO"} onClick={() => action("reset")}>Confirm demo reset</Button><Button variant="secondary" onClick={() => setPreview(null)}>Cancel reset</Button></div></>}</Dialog></section>;
}
