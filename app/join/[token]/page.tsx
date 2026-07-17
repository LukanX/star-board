"use client";

import { useState } from "react";
import { ArrowUpRight, Link2, Orbit, Radio, ShieldCheck } from "lucide-react";

export default function JoinCampaignPage({ params }: { params: Promise<{ token: string }> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  async function redeem() {
    setIsJoining(true);
    setMessage(null);

    try {
      const { token } = await params;
      const response = await fetch("/api/campaigns/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();

      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to join campaign.");
      }

      setMessage("You are cleared for campaign access. Returning to the cockpit...");
      window.setTimeout(() => {
        window.location.href = `/?campaignId=${encodeURIComponent(result.campaignId)}`;
      }, 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to join campaign.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-grid" />
      <div className="auth-signal auth-signal-one" />
      <div className="auth-signal auth-signal-two" />
      <section className="auth-panel join-panel">
        <div className="auth-brand"><span className="auth-brand-symbol"><Orbit size={23} /></span><span><strong>STAR BOARD</strong><small>CAMPAIGN OPERATIONS</small></span></div>
        <div className="auth-heading"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> CREW INVITATION</p><h1>Join the campaign.</h1><p>A GM has opened a secure berth for you. Confirm your access to enter the campaign cockpit.</p></div>
        <button className="button button-primary auth-submit" disabled={isJoining} onClick={redeem} type="button"><Radio size={16} /> {isJoining ? "VERIFYING..." : "ACCEPT INVITATION"} <ArrowUpRight size={15} /></button>
        {message ? <div className="auth-status"><ShieldCheck size={15} /> <span>{message}</span></div> : null}
        <div className="auth-footer"><span><Link2 size={13} /> PRIVATE JOIN CHANNEL</span><span>PLAYER ACCESS ONLY</span></div>
      </section>
    </main>
  );
}
