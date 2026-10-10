"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "./api";
import { ThemeToggle } from "./theme";
import { Button, TextInput } from "./ui";

type AuthFormProps = { setup?: boolean; available?: boolean; landing?: boolean; registered?: boolean };

export function AuthForm({ setup = false, available = true, landing = false, registered = false }: AuthFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const values = setup
      ? Object.fromEntries(formData)
      : { email: formData.get("email"), password: formData.get("password") };

    try {
      await api(setup ? "/api/bootstrap" : "/api/auth/sign-in/email", "POST", values);
      if (setup) {
        form.reset();
        setComplete(true);
      } else {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  if (landing) {
    return <section className="landing-auth-card">
      <p className="landing-auth-kicker">YOUR PRIVATE WORKSPACE</p>
      <h2>Welcome back!</h2>
      <p className="landing-auth-intro">Sign in to continue your journey.</p>
      <form onSubmit={submit} className="landing-form" aria-busy={busy}>
        <label>Email address<TextInput name="email" type="email" required maxLength={254} autoComplete="username" /></label>
        <label>Password<span className="landing-password-control"><TextInput name="password" type={showPassword ? "text" : "password"} maxLength={128} required autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span></label>
        <label className="landing-remember"><input name="remember" type="checkbox" /><span>Remember me</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Please wait..." : "Sign In"}</Button>
      </form>
      <div className="landing-or" aria-hidden="true"><span />OR<span /></div>
      <p className="landing-auth-note">Password recovery and social sign-in are not enabled for this private workspace.</p>
      <p className="landing-auth-footer">New here? <Link href="/register">Create Account</Link></p>
    </section>;
  }

  return <main id="main-content" className="auth-page">
    <div className="auth-theme"><ThemeToggle /></div>
    <section className="auth-card panel panel-padding">
      <Link href="/login" className="brand-name">matchmaker.</Link>
      <p className="eyebrow">A PRIVATE SPACE FOR CONNECTIONS</p>
      <h1>{setup ? "Set up your workspace." : "Welcome back."}</h1>
      <p className="muted">{setup ? "One account. One-time, operator-authorized setup." : "Sign in to manage profiles and recorded permissions."}</p>
      {setup && !available ? <div className="empty-state"><h2>Setup is permanently closed.</h2><p>The bootstrap latch remains closed even if account data becomes inconsistent. Contact the operator; recovery is not available in this stage.</p><Link className="button button-primary" href="/login">Go to login</Link></div> : complete ? <div className="empty-state" role="status"><h2>Your account is ready.</h2><p>Sign in using the credentials you just chose.</p><Link href="/login" className="button button-primary">Go to login</Link></div> : <form onSubmit={submit} className="form-stack" aria-busy={busy}>{setup && <><label>Setup token<TextInput name="token" type="password" required autoComplete="off" maxLength={256} /></label><p className="muted small">The operator supplies this token from server configuration. It is never put in a link or saved in the browser.</p><label>Your name<TextInput name="name" required maxLength={80} autoComplete="name" /></label></>}{registered && !setup && <p className="form-success" role="status">Your account was created. Sign in with your new email and password.</p>}<label>Email<TextInput name="email" type="email" required maxLength={254} autoComplete="username" /></label><label>Password<TextInput name="password" type="password" minLength={setup ? 12 : undefined} maxLength={128} required autoComplete={setup ? "new-password" : "current-password"} /></label>{setup && <p className="muted small">Use a passphrase between 12 and 128 characters.</p>}{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy ? "Please wait..." : setup ? "Create single account" : "Sign in"}</Button>{!setup && <p className="muted small auth-footnote">Don&apos;t have an account? <Link href="/register" className="text-link">Create Account</Link></p>}</form>}
      <p className="muted small auth-footnote">AI, matching, and email delivery remain disconnected previews.</p>
    </section>
  </main>;
}
