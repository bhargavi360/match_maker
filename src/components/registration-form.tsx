"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "./api";
import { ThemeToggle } from "./theme";
import { Button, TextInput } from "./ui";

export function RegistrationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api("/api/auth/sign-up/email", "POST", values);
      router.replace("/login?registered=1");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create your account.");
    } finally {
      setBusy(false);
    }
  }

  return <main id="main-content" className="auth-page">
    <div className="auth-theme"><ThemeToggle /></div>
    <section className="auth-card panel panel-padding">
      <Link href="/" className="brand-name">matchmaker.</Link>
      <p className="eyebrow">CREATE YOUR ACCOUNT</p>
      <h1>Begin your journey.</h1>
      <p className="muted">Create an account to access your Matchmaker AI workspace.</p>
      <form onSubmit={submit} className="form-stack" aria-busy={busy}>
        <label>Name<TextInput name="name" required maxLength={80} autoComplete="name" /></label>
        <label>Email<TextInput name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        <label>Password<TextInput name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="password-help" /></label>
        <p className="muted small" id="password-help">Use 12 to 128 characters.</p>
        <label>Confirm password<TextInput name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Creating account..." : "Create Account"}</Button>
      </form>
      <p className="muted small auth-footnote">Already have an account? <Link href="/login" className="text-link">Sign In</Link></p>
    </section>
  </main>;
}
