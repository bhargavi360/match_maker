"use client";

import { useState } from "react";
import { sampleDraft } from "@/data/preview";
import { Dialog } from "./dialog";
import { Icon } from "./icons";
import { Badge, Button, TextInput } from "./ui";

export function EmailPreview() {
  const [subject, setSubject] = useState(sampleDraft.subject);
  const [body, setBody] = useState(sampleDraft.body);
  const [confirmReset, setConfirmReset] = useState(false);
  const edited = subject !== sampleDraft.subject || body !== sampleDraft.body;
  return <><div className="email-layout"><aside className="panel draft-sidebar" aria-label="Synthetic drafts"><h2>Draft examples</h2><div className="draft-list-item"><Icon name="mail" /><div><strong>Aanya & Ishaan</strong><small>Synthetic introduction</small></div><Badge>1</Badge></div><p className="muted small">One sample draft. No inbox, saved drafts, or delivery history.</p></aside><section className="panel email-editor"><div className="editor-heading"><div><p className="eyebrow">INTRODUCTION DRAFT</p><h2>A thoughtful hello.</h2></div><Badge tone={edited ? "warning" : "neutral"}>{edited ? "Temporary edits" : "Preview only · unsent"}</Badge></div><p className="editor-notice" id="draft-preview-note"><Icon name="info" />Edits stay in this tab and reset when you leave or reload.</p><div className="email-field"><label htmlFor="draft-recipient">To</label><TextInput id="draft-recipient" value="Aanya · synthetic recipient, no email address" readOnly /></div><div className="email-field"><label htmlFor="draft-subject">Subject</label><TextInput id="draft-subject" value={subject} maxLength={200} onChange={event => setSubject(event.target.value)} aria-describedby="draft-preview-note" /></div><div className="email-body-field"><label htmlFor="draft-body" className="sr-only">Email body preview</label><textarea id="draft-body" value={body} maxLength={10000} onChange={event => setBody(event.target.value)} aria-describedby="draft-preview-note" /></div><div className="editor-footer"><span className="muted small">{body.length.toLocaleString("en-IN")} characters · temporary preview</span><div className="button-row"><Button variant="ghost" disabled={!edited} onClick={() => setConfirmReset(true)}>Reset preview</Button><Button disabled aria-describedby="send-unavailable"><Icon name="mail" />Send unavailable</Button></div></div><p id="send-unavailable" className="privacy-caption"><Icon name="lock" />Resend is not connected. No approval, save, or delivery action is available.</p></section></div><Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset preview edits"><p>Replace your temporary edits with the original synthetic sample? No saved data is affected.</p><div className="dialog-actions"><Button variant="secondary" onClick={() => setConfirmReset(false)}>Keep editing</Button><Button variant="danger" onClick={() => { setSubject(sampleDraft.subject); setBody(sampleDraft.body); setConfirmReset(false); }}>Reset text</Button></div></Dialog></>;
}
