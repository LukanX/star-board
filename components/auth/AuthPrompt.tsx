import Link from "next/link";
import { ArrowUpRight, Orbit, Radio, UserRound } from "lucide-react";

type AuthPromptProps = {
  nextPath?: string;
};

export default function AuthPrompt({ nextPath = "/campaigns" }: AuthPromptProps) {
  const encodedNextPath = encodeURIComponent(nextPath);

  return (
    <main className="auth-shell">
      <div className="auth-grid" />
      <div className="auth-signal auth-signal-one" />
      <div className="auth-signal auth-signal-two" />
      <section className="auth-panel auth-prompt-panel">
        <div className="auth-brand"><span className="auth-brand-symbol"><Orbit size={23} /></span><span><strong>STAR BOARD</strong><small>CAMPAIGN OPERATIONS</small></span></div>
        <div className="auth-heading"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> CAMPAIGN CONSOLE</p><h1>Open your campaign console.</h1><p>Sign in to continue to an existing campaign, or create an account to start a new one.</p></div>
        <div className="auth-prompt-actions">
          <Link className="button button-primary auth-submit" href={`/login?mode=signin&next=${encodedNextPath}`}><Radio size={16} /> SIGN IN <ArrowUpRight size={15} /></Link>
          <Link className="button button-secondary auth-submit" href={`/login?mode=create&next=${encodedNextPath}`}><UserRound size={16} /> CREATE ACCOUNT <ArrowUpRight size={15} /></Link>
        </div>
        <div className="auth-footer"><span><Orbit size={13} /> STARFINDER 2E CAMPAIGNS</span><span>AUTHENTICATION REQUIRED</span></div>
      </section>
    </main>
  );
}
