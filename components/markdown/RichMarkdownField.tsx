"use client";

import RichMarkdownBody from "@/components/markdown/RichMarkdownBody";
import type { NoteVisibility } from "@/lib/campaign/types";

export default function RichMarkdownField({
  campaignId,
  label,
  value,
  isMarkdown,
  maxLength,
  audience,
  onChange,
}: {
  campaignId: string;
  label: string;
  value: string;
  isMarkdown: boolean;
  maxLength: number;
  audience: NoteVisibility;
  onChange: (value: string, isMarkdown: boolean) => void;
}) {
  return (
    <div className="grid gap-[7px] text-[var(--dim)] font-mono text-[8px] tracking-[.12em]">
      <span>{label}</span>
      <RichMarkdownBody
        value={value}
        isMarkdown={isMarkdown}
        onChange={onChange}
        campaignId={campaignId}
        label={label}
        maxLength={maxLength}
        audience={audience}
      />
    </div>
  );
}