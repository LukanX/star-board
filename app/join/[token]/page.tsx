"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Link2, Orbit, Radio, ShieldCheck } from "lucide-react";
import {
  authBrandClassName,
  authBrandNameClassName,
  authBrandSubtitleClassName,
  authBrandSymbolClassName,
  authFooterClassName,
  authFooterItemClassName,
  authGridClassName,
  authHeadingClassName,
  authPanelClassName,
  authShellClassName,
  authSignalClassName,
  authSignalOneClassName,
  authSignalTwoClassName,
  authStatusClassName,
  authSubmitClassName,
  joinHeadingClassName,
  joinSubmitClassName,
} from "@/components/auth/authStyles";
import {
  eyebrowBrightClassName,
  liveDotBrightClassName,
} from "@/components/ui/terminalStyles";
import { campaignPath } from "@/lib/campaign/routes";

export default function JoinCampaignPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
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
        router.push(campaignPath(result.campaignId));
      }, 700);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to join campaign.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <main className={authShellClassName}>
      <div className={authGridClassName} />
      <div className={`${authSignalClassName} ${authSignalOneClassName}`} />
      <div className={`${authSignalClassName} ${authSignalTwoClassName}`} />
      <section className={authPanelClassName}>
        <div className={authBrandClassName}><span className={authBrandSymbolClassName}><Orbit size={23} /></span><span><strong className={authBrandNameClassName}>STAR BOARD</strong><small className={authBrandSubtitleClassName}>CAMPAIGN OPERATIONS</small></span></div>
        <div className={`${authHeadingClassName} ${joinHeadingClassName}`}><p className={eyebrowBrightClassName}><span className={liveDotBrightClassName} /> CREW INVITATION</p><h1>Join the campaign.</h1><p>A GM has opened a secure berth for you. Confirm your access to enter the campaign cockpit.</p></div>
        <button className={`${authSubmitClassName} ${joinSubmitClassName}`} disabled={isJoining} onClick={redeem} type="button"><Radio size={16} /> {isJoining ? "VERIFYING..." : "ACCEPT INVITATION"} <ArrowUpRight size={15} /></button>
        {message ? <div className={authStatusClassName}><ShieldCheck size={15} /> <span>{message}</span></div> : null}
        <div className={authFooterClassName}><span className={authFooterItemClassName}><Link2 size={13} /> PRIVATE JOIN CHANNEL</span><span>PLAYER ACCESS ONLY</span></div>
      </section>
    </main>
  );
}
