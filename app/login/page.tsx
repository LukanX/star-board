"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight, Orbit, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/campaigns";
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });

      if (error) {
        throw error;
      }

      setStatus("A secure access link is on its way. Check your inbox to enter the campaign.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to send an access link.");
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
        <div className="auth-heading"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> SECURE CREW ACCESS</p><h1>Return to the signal.</h1><p>Enter your email and we&apos;ll send a magic link for your campaign console.</p></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">CREW EMAIL</label>
          <input autoComplete="email" id="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@station.net" required type="email" value={email} />
          <button className="button button-primary auth-submit" disabled={isSubmitting} type="submit"><Radio size={16} /> {isSubmitting ? "TRANSMITTING..." : "SEND ACCESS LINK"} <ArrowUpRight size={15} /></button>
        </form>
        {status ? <div className="auth-status"><ShieldCheck size={15} /> <span>{status}</span></div> : null}
        <div className="auth-footer"><span><Sparkles size={13} /> STARFINDER 2E CAMPAIGNS</span><span>YOUR CREW. YOUR CANON.</span></div>
      </section>
    </main>
  );
}
