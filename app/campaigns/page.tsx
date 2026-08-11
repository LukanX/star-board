"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Check, CirclePlus, Hexagon, Orbit, Radio, ShieldCheck } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";

type Campaign = {
  id: string;
  name: string;
  system: string;
  description: string;
  created_by: string;
};

type Membership = { role: "gm" | "player"; display_name: string; campaign: Campaign | Campaign[] | null };

function getCampaign(membership: Membership) {
  return Array.isArray(membership.campaign) ? membership.campaign[0] : membership.campaign;
}

export default function CampaignsPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading campaign manifest...");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    void fetch("/api/campaigns").then(async (response) => {
      if (response.status === 401) {
        window.location.href = "/login?next=/campaigns";
        return null;
      }

      const result = (await response.json()) as { campaigns?: Membership[]; error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to load campaigns.");
      }

      return result.campaigns ?? [];
    }).then((campaignList) => {
      if (!campaignList) return;
      setMemberships(campaignList);
      setDisplayNames(Object.fromEntries(campaignList.flatMap((membership) => {
        const campaign = getCampaign(membership);
        return campaign ? [[campaign.id, membership.display_name]] : [];
      })));
      setStatus(campaignList.length ? "Choose a campaign to open the command deck." : "No campaigns yet. Create the first one.");
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Campaign service is unavailable.");
    });
  }, []);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setStatus("Registering campaign signal...");

    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to create campaign.");
      }

      window.location.href = `/?campaignId=${encodeURIComponent(result.campaignId)}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create campaign.");
    } finally {
      setIsCreating(false);
    }
  }

  async function updateDisplayName(campaignId: string) {
    const displayName = displayNames[campaignId]?.trim();

    if (!displayName) {
      setStatus("Display name cannot be empty.");
      return;
    }

    setStatus("Updating campaign display name...");

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/membership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const result = (await response.json()) as { displayName?: string; error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to update display name.");
      }

      setDisplayNames((current) => ({ ...current, [campaignId]: result.displayName ?? displayName }));
      setStatus("Campaign display name updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to update display name.");
    }
  }

  return (
    <main className="campaigns-shell">
      <div className="auth-grid" />
      <section className="campaigns-frame">
        <header className="campaigns-header">
          <div className="auth-brand"><span className="auth-brand-symbol"><Orbit size={23} /></span><span><strong>STAR BOARD</strong><small>CAMPAIGN OPERATIONS</small></span></div>
          <div className="campaigns-header-actions"><span className="campaigns-clearance"><ShieldCheck size={14} /> AUTHENTICATED CREW</span><SignOutButton className="button button-secondary" /></div>
        </header>
        <div className="campaigns-intro"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> CAMPAIGN MANIFEST</p><h1>Choose or create a campaign.</h1><p>Anyone with an account can open a new campaign. A GM invite is only needed to join an existing one.</p></div>
        <div className="campaigns-layout">
          <section className="campaign-list" aria-label="Your campaigns">
            <div className="campaigns-section-heading"><span>YOUR CAMPAIGNS</span><strong>{memberships.length.toString().padStart(2, "0")}</strong></div>
            {memberships.length ? memberships.map((membership) => {
              const campaign = getCampaign(membership);

              if (!campaign) return null;

              return <div className="campaign-choice-wrap" key={campaign.id}><button className="campaign-choice" onClick={() => { window.location.href = `/?campaignId=${encodeURIComponent(campaign.id)}`; }} type="button"><span className="campaign-choice-icon"><Hexagon size={19} /></span><span className="campaign-choice-copy"><strong>{campaign.name}</strong><small>{campaign.system} {"//"} {membership.role === "gm" ? "GAME MASTER" : "PLAYER"}</small><span>{campaign.description || "No campaign brief recorded."}</span></span><ArrowUpRight size={17} /></button><form className="campaign-display-form" onSubmit={(event) => { event.preventDefault(); void updateDisplayName(campaign.id); }}><label htmlFor={`display-name-${campaign.id}`}>YOUR NAME IN THIS CAMPAIGN</label><input id={`display-name-${campaign.id}`} maxLength={120} onChange={(event) => setDisplayNames((current) => ({ ...current, [campaign.id]: event.target.value }))} value={displayNames[campaign.id] ?? membership.display_name} /><button aria-label={`Save display name for ${campaign.name}`} title="Save display name" type="submit"><Check size={14} /></button></form></div>;
            }) : <div className="campaign-empty"><Radio size={20} /><p>Nothing on the manifest yet.</p><span>Your first campaign will become the crew&apos;s home signal.</span></div>}
            <p className="campaign-status"><span className="live-dot" /> {status}</p>
          </section>
          <section className="campaign-create">
            <div className="campaigns-section-heading"><span>OPEN YOUR CAMPAIGN</span><CirclePlus size={16} /></div>
            <form onSubmit={createCampaign}>
              <label htmlFor="campaign-name">CAMPAIGN NAME</label>
              <input id="campaign-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Signal / Noise" required value={name} />
              <label htmlFor="campaign-description">BRIEFING <span>OPTIONAL</span></label>
              <textarea id="campaign-description" maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="A one-line signal for the crew." value={description} />
              <button className="button button-primary" disabled={isCreating} type="submit"><Radio size={15} /> {isCreating ? "REGISTERING..." : "CREATE CAMPAIGN"} <ArrowUpRight size={15} /></button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
