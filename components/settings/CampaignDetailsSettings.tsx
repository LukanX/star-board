"use client";

import { useState, type FormEvent } from "react";
import { Check, FileText, LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { panelClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName, accentIconCyanClassName } from "@/components/ui/terminalStyles";

type CampaignDetails = {
  name: string;
  description: string;
};

const fieldClassName =
  "w-full min-w-0 border border-[rgba(139,151,169,.28)] bg-[#0a1118] px-3 text-[var(--ink)] outline-none transition-[border,box-shadow] placeholder:text-[#4d5a6b] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)]";
const labelClassName = "grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]";
const saveButtonClassName =
  "h-[37px] min-w-[166px] inline-flex items-center justify-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-[14px] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:bg-[#8ceeff] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

export default function CampaignDetailsSettings({
  campaignId,
  initialCampaign,
}: {
  campaignId: string;
  initialCampaign: CampaignDetails;
}) {
  const router = useRouter();
  const { clearDirty, setDirty } = useDirtyForm();
  const [details, setDetails] = useState<CampaignDetails>(initialCampaign);
  const [baseline, setBaseline] = useState<CampaignDetails>(initialCampaign);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateDetails = (nextDetails: CampaignDetails) => {
    setDetails(nextDetails);
    setSaved(false);
    setError(null);
    if (nextDetails.name === baseline.name && nextDetails.description === baseline.description) {
      clearDirty();
    } else {
      setDirty();
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = details.name.trim();
    const description = details.description.trim();

    if (!name) {
      setError("Campaign name is required.");
      return;
    }
    if (name.length > 120) {
      setError("Campaign name must be 120 characters or fewer.");
      return;
    }
    if (description.length > 2000) {
      setError("Campaign description must be 2000 characters or fewer.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const result = (await response.json()) as { campaign?: CampaignDetails; error?: string };

      if (!response.ok || !result.campaign) {
        throw new Error(result.error ?? "Campaign details could not be saved.");
      }

      setDetails(result.campaign);
      setBaseline(result.campaign);
      clearDirty();
      setSaved(true);
      router.refresh();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Campaign details could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${panelClassName} w-full min-w-0`} data-campaign-details-settings>
      <div className="panel-topline flex items-start justify-between gap-4 px-[21px] pb-3 pt-5">
        <div>
          <p className={`${eyebrowClassName} !mb-2`}>GM CONTROL // CAMPAIGN IDENTITY</p>
          <h2>Campaign details</h2>
        </div>
        <FileText className={accentIconCyanClassName} size={17} />
      </div>
      <div className="grid gap-[6px] border-b border-[var(--line)] px-[21px] pb-4">
        <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.5]">
          Keep the campaign name and briefing clear for every member of the crew.
        </p>
        <span className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.06em] leading-[1.5]">
          These details appear in the campaign switcher and shape the context shown around the campaign.
        </span>
      </div>
      <form className="grid gap-4 p-[18px_21px_21px]" onSubmit={(event) => void save(event)}>
        <label className={labelClassName}>
          CAMPAIGN NAME
          <input
            aria-describedby="campaign-name-hint"
            className={`${fieldClassName} h-[39px] text-[12px]`}
            maxLength={120}
            onChange={(event) => updateDetails({ ...details, name: event.target.value })}
            required
            value={details.name}
          />
          <small className="text-[var(--dim)] text-[8px] tracking-[.04em]" id="campaign-name-hint">{details.name.length}/120 CHARACTERS</small>
        </label>
        <label className={labelClassName}>
          CAMPAIGN DESCRIPTION
          <textarea
            aria-describedby="campaign-description-hint"
            className={`${fieldClassName} min-h-[150px] resize-y py-3 text-[11px] leading-[1.55]`}
            maxLength={2000}
            onChange={(event) => updateDetails({ ...details, description: event.target.value })}
            placeholder="Describe the tone, premise, and current mission."
            value={details.description}
          />
          <small className="text-[var(--dim)] text-[8px] tracking-[.04em]" id="campaign-description-hint">{details.description.length}/2000 CHARACTERS</small>
        </label>
        {error ? <p className="m-0 text-[var(--pink)] text-[10px] leading-[1.5]" role="alert">{error}</p> : null}
        {saved ? <p className="flex items-center gap-2 m-0 text-[var(--green)] text-[10px]" role="status"><Check size={14} /> CAMPAIGN DETAILS SAVED.</p> : null}
        <div className="flex justify-end border-t border-[var(--line)] pt-4">
          <button className={saveButtonClassName} disabled={isSaving} type="submit">
            {isSaving ? <><LoaderCircle className="animate-spin" size={14} /> SAVING...</> : saved ? <><Check size={14} /> SAVED</> : <><Save size={14} /> SAVE DETAILS</>}
          </button>
        </div>
      </form>
    </section>
  );
}