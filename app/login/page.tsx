"use client";

import { FormEvent, useState } from "react";
import { ArrowUpRight, KeyRound, Orbit, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "create" | "signin" | "reset";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<AuthMode>("create");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCreatingAccount = mode === "create";
  const isResettingPassword = mode === "reset";

  function getNextPath() {
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    return requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/campaigns";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      if (isResettingPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/login/reset-password`,
        });

        if (error) {
          throw error;
        }

        setStatus("If an account uses this email address, a password reset link has been sent.");
        return;
      }

      const result = isCreatingAccount
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        throw result.error;
      }

      if (!result.data.session) {
        throw new Error("Account created, but email confirmation is required. Check your email before signing in.");
      }

      window.location.href = getNextPath();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (isCreatingAccount && /already registered|already exists/i.test(message)) {
        setStatus("An account already uses this email address. Sign in or reset your password.");
      } else if (!isCreatingAccount && !isResettingPassword && /invalid login credentials/i.test(message)) {
        setStatus("The email address or password is incorrect. Use Reset password if you need to recover access.");
      } else if (message) {
        setStatus(message);
      } else {
        setStatus(isResettingPassword ? "Unable to send a password reset link." : isCreatingAccount ? "Unable to create your account." : "Unable to sign in.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setStatus(null);
  }

  return (
    <main className="auth-shell">
      <div className="auth-grid" />
      <div className="auth-signal auth-signal-one" />
      <div className="auth-signal auth-signal-two" />
      <section className="auth-panel">
        <div className="auth-brand"><span className="auth-brand-symbol"><Orbit size={23} /></span><span><strong>STAR BOARD</strong><small>CAMPAIGN OPERATIONS</small></span></div>
        <div className="auth-heading"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> {isCreatingAccount ? "ACCOUNT CREATION" : isResettingPassword ? "PASSWORD RESET" : "SIGN IN"}</p><h1>{isCreatingAccount ? "Create your account." : isResettingPassword ? "Reset your password." : "Sign in to Star Board."}</h1><p>{isCreatingAccount ? "Use your email address and password to access your campaign console." : isResettingPassword ? "Enter your email address and we will send you a secure password reset link." : "Enter your email address and password to open your campaign console."}</p></div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <input autoComplete="email" id="email" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} />
          {!isResettingPassword ? <><label htmlFor="password">Password</label><input autoComplete={isCreatingAccount ? "new-password" : "current-password"} id="password" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required type="password" value={password} /></> : null}
          <button className="button button-primary auth-submit" disabled={isSubmitting} type="submit"><Radio size={16} /> {isSubmitting ? "PROCESSING..." : isCreatingAccount ? "CREATE ACCOUNT" : isResettingPassword ? "SEND RESET LINK" : "SIGN IN"} <ArrowUpRight size={15} /></button>
        </form>
        {mode === "signin" ? <button className="auth-reset-action" onClick={() => switchMode("reset")} type="button"><KeyRound size={13} /> Reset password</button> : null}
        {status ? <div className="auth-status"><ShieldCheck size={15} /> <span>{status}</span></div> : null}
        <div className="auth-footer"><span><Sparkles size={13} /> STARFINDER 2E CAMPAIGNS</span><button className="auth-mode-toggle" onClick={() => switchMode(isCreatingAccount || isResettingPassword ? "signin" : "create")} type="button">{isCreatingAccount ? "Already have an account? Sign in" : isResettingPassword ? "Return to sign in" : "New here? Create an account"}</button></div>
      </section>
    </main>
  );
}
