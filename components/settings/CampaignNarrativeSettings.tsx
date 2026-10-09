"use client";

import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, LockKeyhole, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import NarrativeStyleTagPicker from "@/components/ui/NarrativeStyleTagPicker";
import { maxCampaignSettingLength } from "@/lib/campaign/narrative-style-tags";
import type { CampaignNarrativeSettings as CampaignNarrativeSettingsData } from "@/lib/campaign/narrative-settings";
import { campaignNarrativeSettingsSchema } from "@/lib/validation/campaign-narrative-settings";

const dirtySource = "campaign-narrative-settings";
const fieldClassName =
  "w-full min-w-0 border border-[rgba(139,151,169,.28)] bg-[#0a1118] px-3 text-[var(--ink)] outline-none transition-[border,box-shadow] placeholder:text-[#4d5a6b] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)]";
const labelClassName = "grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]";
const saveButtonClassName =
  "h-[37px] min-w-[190px] inline-flex items-center justify-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-[14px] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background] duration-[200ms] whitespace-nowrap hover:-translate-y-px hover:bg-[#8ceeff] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

function sameSettings(left: CampaignNarrativeSettingsData, right: CampaignNarrativeSettingsData) {
  return left.setting === right.setting
    && left.styleTags.length === right.styleTags.length
    && left.styleTags.every((tag, index) => tag === right.styleTags[index]);
}

function firstIssueMessage(result: ReturnType<typeof campaignNarrativeSettingsSchema.safeParse>) {
  return result.success ? null : result.error.issues[0]?.message ?? "Narrative settings are invalid.";
}

export default function CampaignNarrativeSettings({
  campaignId,
  initialSettings,
}: {
  campaignId: string;
  initialSettings: CampaignNarrativeSettingsData;
}) {
  const router = useRouter();
  const { clearDirty, setDirty } = useDirtyForm();
  const [settings, setSettings] = useState<CampaignNarrativeSettingsData>(() => ({
    setting: initialSettings.setting,
    styleTags: [...initialSettings.styleTags],
  }));
  const [baseline, setBaseline] = useState<CampaignNarrativeSettingsData>(() => ({
    setting: initialSettings.setting,
    styleTags: [...initialSettings.styleTags],
  }));
  const [customTag, setCustomTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updateSettings = (nextSettings: CampaignNarrativeSettingsData, pendingTag = customTag) => {
    setSettings(nextSettings);
    setSaved(false);
    setError(null);
    if (sameSettings(nextSettings, baseline) && !pendingTag.trim()) {
      clearDirty(dirtySource);
    } else {
      setDirty(dirtySource);
    }
  };

  const updateStyleTags = (styleTags: string[], nextCustomTag: string) => {
    setCustomTag(nextCustomTag);
    updateSettings({ ...settings, styleTags }, nextCustomTag);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let nextSettings = settings;
    if (customTag.trim()) {
      const withPendingTag = campaignNarrativeSettingsSchema.safeParse({
        setting: settings.setting,
        styleTags: [...settings.styleTags, customTag],
      });
      const issue = firstIssueMessage(withPendingTag);
      if (issue) {
        setError(issue);
        return;
      }
      if (!withPendingTag.success) return;
      nextSettings = withPendingTag.data;
      updateSettings(nextSettings, "");
      setCustomTag("");
    }

    const validated = campaignNarrativeSettingsSchema.safeParse(nextSettings);
    const issue = firstIssueMessage(validated);
    if (issue) {
      setError(issue);
      return;
    }
    if (!validated.success) return;

    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/narrative-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.data),
      });
      const result = (await response.json()) as { narrativeSettings?: unknown; error?: string };
      if (!response.ok || !result.narrativeSettings) {
        throw new Error(result.error ?? "Campaign narrative settings could not be saved.");
      }

      const parsed = campaignNarrativeSettingsSchema.safeParse(result.narrativeSettings);
      if (!parsed.success) throw new Error("The saved narrative settings response was invalid.");

      setSettings(parsed.data);
      setBaseline(parsed.data);
      clearDirty(dirtySource);
      setSaved(true);
      router.refresh();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Campaign narrative settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="w-full min-w-0 border border-[var(--line)] bg-[var(--panel)]" data-campaign-narrative-settings>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-[21px] pb-3 pt-5">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[8px] text-[var(--pink)] tracking-[.1em]"><LockKeyhole aria-hidden="true" size={12} /> GM ONLY // NARRATIVE CONTEXT</p>
          <h2 className="m-0 text-[15px] font-semibold text-[var(--ink)]">Campaign narrative context</h2>
        </div>
      </div>
      <form className="grid gap-5 p-[18px_21px_21px]" onSubmit={(event) => void save(event)}>
        <label className={labelClassName}>
          CAMPAIGN SETTING
          <textarea
            aria-describedby="campaign-setting-hint"
            className={`${fieldClassName} min-h-[100px] resize-y py-3 text-[11px] leading-[1.55]`}
            disabled={isSaving}
            maxLength={maxCampaignSettingLength}
            onChange={(event) => updateSettings({ ...settings, setting: event.target.value })}
            value={settings.setting}
          />
          <small className="text-[var(--dim)] text-[8px]" id="campaign-setting-hint">{settings.setting.length}/{maxCampaignSettingLength} CHARACTERS</small>
        </label>

        <NarrativeStyleTagPicker
          idPrefix="custom-narrative"
          styleTags={settings.styleTags}
          customTag={customTag}
          disabled={isSaving}
          validationMessage={null}
          onChange={updateStyleTags}
          onValidationMessageChange={setError}
        />

        {error ? <p className="m-0 text-[var(--pink)] text-[10px] leading-[1.5]" role="alert">{error}</p> : null}
        {saved ? <p className="flex items-center gap-2 m-0 text-[var(--green)] text-[10px]" role="status"><Check aria-hidden="true" size={14} /> NARRATIVE CONTEXT SAVED.</p> : null}
        <div className="flex justify-end border-t border-[var(--line)] pt-4">
          <button className={saveButtonClassName} disabled={isSaving} type="submit">
            {isSaving ? <><LoaderCircle className="animate-spin" aria-hidden="true" size={14} /> SAVING...</> : saved ? <><Check aria-hidden="true" size={14} /> SAVED</> : <><Save aria-hidden="true" size={14} /> SAVE NARRATIVE SETTINGS</>}
          </button>
        </div>
      </form>
    </section>
  );
}