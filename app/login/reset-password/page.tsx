"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight, Orbit, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    if (password !== confirmation) {
      setStatus("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await getSupabaseBrowserClient().auth.updateUser({ password });

      if (error) {
        throw error;
      }

      window.location.href = "/campaigns";
    } catch (error) {
      setStatus(error instanceof Error && /session|expired|invalid/i.test(error.message)
        ? "This password reset link is invalid or has expired. Request a new link and try again."
        : error instanceof Error ? error.message : "Unable to update your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-grid" />
      <div className="auth-signal auth-signal-one" />
      <div className="auth-signal auth-signal-two" />
      <section className="auth-panel">
        <div className="auth-brand"><span className="auth-brand-symbol"><Orbit size={23} /></span><span><strong>STAR BOARD</strong><small>CAMPAIGN OPERATIONS</small></span></div>
        <div className="auth-heading"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> PASSWORD RESET</p><h1>Choose a new password.</h1><p>Set a new password to regain access to your campaign console.</p></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="password">New password</label>
          <input autoComplete="new-password" id="password" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type="password" value={password} />
          <label htmlFor="confirmation">Confirm password</label>
          <input autoComplete="new-password" id="confirmation" minLength={8} onChange={(event) => setConfirmation(event.target.value)} placeholder="Enter the password again" required type="password" value={confirmation} />
          <button className="button button-primary auth-submit" disabled={isSubmitting} type="submit"><Radio size={16} /> {isSubmitting ? "UPDATING..." : "UPDATE PASSWORD"} <ArrowUpRight size={15} /></button>
        </form>
        {status ? <div className="auth-status"><ShieldCheck size={15} /> <span>{status}</span></div> : null}
        <div className="auth-footer"><span><Sparkles size={13} /> STARFINDER 2E CAMPAIGNS</span><button className="auth-mode-toggle" onClick={() => { window.location.href = "/login"; }} type="button">Return to sign in</button></div>
      </section>
    </main>
  );
}