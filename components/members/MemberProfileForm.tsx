"use client";

import { FormEvent, useState } from "react";
import { Check } from "lucide-react";
import { recordDetailMetaClassName } from "@/components/ui/recordStyles";

export default function MemberProfileForm({
  campaignId,
  initialDisplayName,
  onSaved,
}: {
  campaignId: string;
  initialDisplayName: string;
  onSaved: (displayName: string) => void;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDisplayName = displayName.trim();

    if (!nextDisplayName) {
      setError("Display name cannot be empty.");
      setStatus(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/membership`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: nextDisplayName }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        displayName?: string;
        error?: string;
      };

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update display name.");

      const savedDisplayName = result.displayName ?? nextDisplayName;
      setDisplayName(savedDisplayName);
      setStatus("Display name updated.");
      onSaved(savedDisplayName);
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update display name.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
      onSubmit={saveDisplayName}
    >
      <label>
        YOUR DISPLAY NAME
        <input
          maxLength={120}
          onChange={(event) => setDisplayName(event.target.value)}
          value={displayName}
        />
      </label>
      {error ? (
        <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className={recordDetailMetaClassName} role="status">
          {status}
        </p>
      ) : null}
      <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
        <button
          className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
          disabled={isSaving}
          type="submit"
        >
          <Check size={14} /> {isSaving ? "SAVING..." : "SAVE NAME"}
        </button>
      </div>
    </form>
  );
}
