"use client";

import type { KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import {
  maxNarrativeStyleTagLength,
  maxNarrativeStyleTags,
  narrativeStylePresets,
} from "@/lib/campaign/narrative-style-tags";
import { narrativeStyleTagsSchema } from "@/lib/validation/campaign-narrative-settings";

export default function NarrativeStyleTagPicker({
  idPrefix,
  styleTags,
  customTag,
  disabled = false,
  validationMessage,
  onChange,
  onValidationMessageChange,
}: {
  idPrefix: string;
  styleTags: string[];
  customTag: string;
  disabled?: boolean;
  validationMessage: string | null;
  onChange: (styleTags: string[], customTag: string) => void;
  onValidationMessageChange: (message: string | null) => void;
}) {
  const atCapacity = styleTags.length >= maxNarrativeStyleTags;

  const update = (nextStyleTags: string[], nextCustomTag = customTag) => {
    onChange(nextStyleTags, nextCustomTag);
    onValidationMessageChange(null);
  };

  const togglePreset = (preset: string, selected: boolean) => {
    const alreadySelected = styleTags.some((tag) => tag.toLowerCase() === preset.toLowerCase());
    if (selected && !alreadySelected && atCapacity) {
      onValidationMessageChange(`Choose no more than ${maxNarrativeStyleTags} narrative style tags.`);
      return;
    }
    const nextStyleTags = selected
      ? alreadySelected ? styleTags : [...styleTags, preset]
      : styleTags.filter((tag) => tag.toLowerCase() !== preset.toLowerCase());
    update(nextStyleTags);
  };

  const addCustomTag = () => {
    const candidateTag = customTag.trim();
    if (!candidateTag) return;
    const result = narrativeStyleTagsSchema.safeParse([...styleTags, candidateTag]);
    if (!result.success) {
      onValidationMessageChange(result.error.issues[0]?.message ?? "Narrative style tags are invalid.");
      return;
    }
    update(result.data, "");
  };

  const handleCustomTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      addCustomTag();
    }
    if (event.key === "Escape" && customTag) {
      event.preventDefault();
      update(styleTags, "");
    }
  };

  return (
    <fieldset className="grid min-w-0 gap-[10px]" data-narrative-style-tag-picker disabled={disabled}>
      <legend className="mb-[6px] grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">NARRATIVE STYLE TAGS</legend>
      <div className="grid grid-cols-2 gap-[7px] sm:grid-cols-3" data-narrative-style-presets>
        {narrativeStylePresets.map((preset) => {
          const checked = styleTags.some((tag) => tag.toLowerCase() === preset.toLowerCase());
          return (
            <label className={`flex min-h-[34px] min-w-0 items-center gap-2 border px-[9px] py-[6px] font-mono text-[9px] transition-colors focus-within:border-[var(--cyan)] ${checked ? "border-[rgba(98,232,255,.55)] bg-[rgba(98,232,255,.08)] text-[var(--cyan)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[rgba(98,232,255,.35)]"} ${!checked && atCapacity ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`} key={preset}>
              <input
                checked={checked}
                className="h-3 w-3 shrink-0 accent-[var(--cyan)]"
                disabled={!checked && atCapacity}
                onChange={(event) => togglePreset(preset, event.target.checked)}
                type="checkbox"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{preset}</span>
            </label>
          );
        })}
      </div>
      <div aria-label="Selected custom narrative style tags" className="flex min-h-[24px] flex-wrap gap-[6px]" data-narrative-custom-tags role="list">
        {styleTags.filter((tag) => !narrativeStylePresets.some((preset) => preset.toLowerCase() === tag.toLowerCase())).map((tag) => (
          <span className="inline-flex max-w-full items-center gap-1 border border-[rgba(255,92,154,.34)] bg-[rgba(255,92,154,.07)] px-[7px] py-[4px] text-[var(--pink)] font-mono text-[8px]" key={tag} role="listitem">
            <span className="min-w-0 [overflow-wrap:anywhere]">{tag}</span>
            <button
              aria-label={`Remove narrative style tag ${tag}`}
              className="grid h-5 w-5 shrink-0 place-items-center border border-transparent bg-transparent p-0 text-[var(--muted)] hover:border-[rgba(255,92,154,.4)] hover:text-[var(--pink)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)]"
              onClick={() => update(styleTags.filter((current) => current !== tag))}
              title={`Remove ${tag}`}
              type="button"
            >
              <X aria-hidden="true" size={12} />
            </button>
          </span>
        ))}
      </div>
      <small aria-live="polite" className="text-[var(--dim)] text-[8px]">{styleTags.length}/{maxNarrativeStyleTags} TAGS SELECTED</small>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 max-[420px]:grid-cols-1">
        <label className="grid gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
          CUSTOM TAG
          <input
            aria-describedby={`${idPrefix}-tag-hint`}
            className="w-full min-w-0 border border-[rgba(139,151,169,.28)] bg-[#0a1118] px-3 text-[var(--ink)] outline-none transition-[border,box-shadow] placeholder:text-[#4d5a6b] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)] h-[37px] text-[11px]"
            disabled={atCapacity}
            maxLength={maxNarrativeStyleTagLength}
            onChange={(event) => update(styleTags, event.target.value)}
            onKeyDown={handleCustomTagKeyDown}
            placeholder="e.g. Found family"
            value={customTag}
          />
          <small className="text-[var(--dim)] text-[8px]" id={`${idPrefix}-tag-hint`}>{customTag.length}/{maxNarrativeStyleTagLength} CHARACTERS</small>
        </label>
        <button
          aria-label="Add custom narrative style tag"
          className="inline-flex h-[37px] items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(255,255,255,.035)] px-3 text-[var(--ink)] font-mono text-[8px] tracking-[.08em] hover:border-[rgba(98,232,255,.45)] disabled:cursor-not-allowed disabled:opacity-50 max-[420px]:w-full"
          disabled={atCapacity || !customTag.trim()}
          onClick={addCustomTag}
          type="button"
        >
          <Plus aria-hidden="true" size={13} /> ADD TAG
        </button>
      </div>
      {validationMessage ? <p className="m-0 text-[var(--pink)] text-[10px] leading-[1.5]" role="alert">{validationMessage}</p> : null}
    </fieldset>
  );
}