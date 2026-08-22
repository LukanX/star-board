"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Check, CirclePlus, Hexagon, Orbit, Radio, ShieldCheck } from "lucide-react";
import {
  authBrandClassName,
  authBrandNameClassName,
  authBrandSubtitleClassName,
  authBrandSymbolClassName,
  authGridClassName,
} from "@/components/auth/authStyles";
import SignOutButton from "@/components/auth/SignOutButton";

const campaignsShellClassName =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_0%,rgba(255,92,154,.1),transparent_28%),radial-gradient(circle_at_90%_100%,rgba(98,232,255,.1),transparent_30%),#080b11] px-6 py-[6vh] max-[760px]:px-3 max-[760px]:py-[18px]";

const campaignsFrameClassName =
  "relative z-[1] mx-auto w-full max-w-[1050px] border border-[rgba(98,232,255,.24)] bg-[rgba(12,17,25,.9)] shadow-[0_24px_80px_rgba(0,0,0,.36)]";

const campaignsHeaderClassName =
  "flex items-center justify-between gap-[18px] border-b border-[var(--line)] px-[27px] py-[23px] max-[760px]:items-start max-[760px]:flex-col max-[760px]:p-[19px]";

const campaignsHeaderBrandClassName =
  `${authBrandClassName} !border-0 !p-0`;

const campaignsHeaderActionsClassName =
  "flex items-center justify-end gap-[18px]";

const campaignsClearanceClassName =
  "inline-flex items-center gap-[7px] text-[var(--green)] font-mono text-[8px] tracking-[.1em] max-[760px]:self-end";

const campaignsSignOutClassName =
  "inline-flex h-[37px] items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(255,255,255,.035)] px-[14px] text-[var(--muted)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-60";

const campaignsIntroClassName =
  "px-[54px] pt-[58px] pb-[34px] [&_h1]:mb-3 [&>p:last-child]:m-0 [&>p:last-child]:text-[var(--muted)] [&>p:last-child]:text-[13px] max-[760px]:px-[19px] max-[760px]:pt-[38px] max-[760px]:pb-[27px]";

const campaignsLayoutClassName =
  "grid grid-cols-[minmax(0,1.2fr)_minmax(290px,.8fr)] gap-5 px-[54px] pb-[54px] max-[760px]:grid-cols-1 max-[760px]:px-[19px] max-[760px]:pb-[30px]";

const campaignsSectionClassName =
  "border-t border-[var(--line)] pt-[17px]";

const campaignsSectionHeadingClassName =
  "mb-[15px] flex items-center justify-between text-[var(--dim)] font-mono text-[8px] tracking-[.14em] [&>strong]:text-[var(--cyan)] [&>svg]:text-[var(--cyan)]";

const campaignChoiceWrapClassName =
  "mb-[10px] border border-[var(--line)] bg-[rgba(255,255,255,.02)]";

const campaignChoiceClassName =
  "flex w-full items-center gap-[13px] border-0 border-b border-[var(--line)] bg-transparent px-[13px] py-4 text-left text-[var(--ink)] cursor-pointer hover:border-[rgba(98,232,255,.55)] hover:bg-[rgba(98,232,255,.06)]";

const campaignChoiceIconClassName =
  "grid h-[37px] w-[37px] flex-[0_0_37px] place-items-center border border-[rgba(98,232,255,.35)] text-[var(--cyan)]";

const campaignChoiceCopyClassName =
  "min-w-0 flex-1 [&>strong]:block [&>strong]:text-[13px] [&>small]:mt-1 [&>small]:block [&>small]:text-[var(--cyan)] [&>small]:font-mono [&>small]:text-[7px] [&>small]:tracking-[.1em] [&>span]:mt-2 [&>span]:block [&>span]:overflow-hidden [&>span]:text-[var(--muted)] [&>span]:text-[10px] [&>span]:text-ellipsis [&>span]:whitespace-nowrap";

const campaignChoiceArrowClassName = "text-[var(--dim)]";

const campaignEmptyClassName =
  "grid justify-items-center gap-[9px] border border-dashed border-[rgba(139,151,169,.26)] px-5 py-[37px] text-center text-[var(--dim)] [&>p]:m-0 [&>p]:text-[var(--muted)] [&>p]:text-[12px] [&>span]:text-[10px]";

const campaignStatusClassName =
  "mt-[13px] flex min-h-[28px] items-center gap-2 text-[var(--dim)] font-mono text-[8px]";

const campaignCreateFormClassName = "grid gap-[9px]";

const campaignCreateLabelClassName =
  "mt-[7px] text-[var(--dim)] font-mono text-[8px] tracking-[.12em]";

const campaignCreateOptionalClassName = "text-[#596677]";

const campaignCreateInputClassName =
  "h-[43px] w-full border border-[rgba(139,151,169,.27)] bg-[#0a1118] px-3 py-[11px] text-[var(--ink)] font-mono text-[11px] outline-0 placeholder:text-[#4d5a6b] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)]";

const campaignCreateTextareaClassName =
  "min-h-[106px] w-full resize-y border border-[rgba(139,151,169,.27)] bg-[#0a1118] px-3 py-[11px] text-[var(--ink)] font-mono text-[11px] leading-[1.5] outline-0 placeholder:text-[#4d5a6b] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)]";

const campaignCreateButtonClassName =
  "mt-[10px] inline-flex h-[37px] w-full items-center justify-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-[14px] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap shadow-[0_0_20px_rgba(98,232,255,.16)] hover:-translate-y-px hover:bg-[#8ceeff] disabled:cursor-wait disabled:opacity-60 disabled:transform-none";

const campaignDisplayFormClassName =
  "flex items-center gap-2 px-[13px] py-[10px]";

const campaignDisplayLabelClassName =
  "whitespace-nowrap text-[var(--dim)] font-mono text-[7px] tracking-[.1em]";

const campaignDisplayInputClassName =
  "h-[29px] min-w-0 flex-1 border border-[var(--line)] bg-[rgba(8,11,17,.72)] px-2 text-[var(--ink)] font-mono text-[10px] outline-0 focus:border-[var(--cyan)] focus:outline focus:outline-1 focus:outline-[var(--cyan)]";

const campaignDisplaySaveClassName =
  "grid h-[29px] w-[29px] flex-[0_0_29px] place-items-center border border-[rgba(98,232,255,.35)] bg-[rgba(98,232,255,.08)] text-[var(--cyan)] cursor-pointer hover:border-[var(--cyan)] hover:bg-[rgba(98,232,255,.16)]";

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
    <main className={campaignsShellClassName}>
      <div className={authGridClassName} />
      <section className={campaignsFrameClassName}>
        <header className={campaignsHeaderClassName}>
          <div className={campaignsHeaderBrandClassName}><span className={authBrandSymbolClassName}><Orbit size={23} /></span><span><strong className={authBrandNameClassName}>STAR BOARD</strong><small className={authBrandSubtitleClassName}>CAMPAIGN OPERATIONS</small></span></div>
          <div className={campaignsHeaderActionsClassName}><span className={campaignsClearanceClassName}><ShieldCheck size={14} /> AUTHENTICATED CREW</span><SignOutButton className={campaignsSignOutClassName} /></div>
        </header>
        <div className={campaignsIntroClassName}><p className="eyebrow eyebrow-bright"><span className="live-dot" /> CAMPAIGN MANIFEST</p><h1>Choose or create a campaign.</h1><p>Anyone with an account can open a new campaign. A GM invite is only needed to join an existing one.</p></div>
        <div className={campaignsLayoutClassName}>
          <section className={campaignsSectionClassName} aria-label="Your campaigns">
            <div className={campaignsSectionHeadingClassName}><span>YOUR CAMPAIGNS</span><strong>{memberships.length.toString().padStart(2, "0")}</strong></div>
            {memberships.length ? memberships.map((membership) => {
              const campaign = getCampaign(membership);

              if (!campaign) return null;

              return <div className={campaignChoiceWrapClassName} key={campaign.id}><button className={campaignChoiceClassName} onClick={() => { window.location.href = `/?campaignId=${encodeURIComponent(campaign.id)}`; }} type="button"><span className={campaignChoiceIconClassName}><Hexagon size={19} /></span><span className={campaignChoiceCopyClassName}><strong>{campaign.name}</strong><small>{campaign.system} {"//"} {membership.role === "gm" ? "GAME MASTER" : "PLAYER"}</small><span>{campaign.description || "No campaign brief recorded."}</span></span><ArrowUpRight className={campaignChoiceArrowClassName} size={17} /></button><form className={campaignDisplayFormClassName} onSubmit={(event) => { event.preventDefault(); void updateDisplayName(campaign.id); }}><label className={campaignDisplayLabelClassName} htmlFor={`display-name-${campaign.id}`}>YOUR NAME IN THIS CAMPAIGN</label><input className={campaignDisplayInputClassName} id={`display-name-${campaign.id}`} maxLength={120} onChange={(event) => setDisplayNames((current) => ({ ...current, [campaign.id]: event.target.value }))} value={displayNames[campaign.id] ?? membership.display_name} /><button aria-label={`Save display name for ${campaign.name}`} className={campaignDisplaySaveClassName} title="Save display name" type="submit"><Check size={14} /></button></form></div>;
            }) : <div className={campaignEmptyClassName}><Radio size={20} /><p>Nothing on the manifest yet.</p><span>Your first campaign will become the crew&apos;s home signal.</span></div>}
            <p className={campaignStatusClassName}><span className="live-dot" /> {status}</p>
          </section>
          <section className={campaignsSectionClassName}>
            <div className={campaignsSectionHeadingClassName}><span>OPEN YOUR CAMPAIGN</span><CirclePlus size={16} /></div>
            <form className={campaignCreateFormClassName} onSubmit={createCampaign}>
              <label className={campaignCreateLabelClassName} htmlFor="campaign-name">CAMPAIGN NAME</label>
              <input className={campaignCreateInputClassName} id="campaign-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Signal / Noise" required value={name} />
              <label className={campaignCreateLabelClassName} htmlFor="campaign-description">BRIEFING <span className={campaignCreateOptionalClassName}>OPTIONAL</span></label>
              <textarea className={campaignCreateTextareaClassName} id="campaign-description" maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="A one-line signal for the crew." value={description} />
              <button className={campaignCreateButtonClassName} disabled={isCreating} type="submit"><Radio size={15} /> {isCreating ? "REGISTERING..." : "CREATE CAMPAIGN"} <ArrowUpRight size={15} /></button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
