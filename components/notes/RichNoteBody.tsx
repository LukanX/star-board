"use client";

import RichMarkdownBody from "@/components/markdown/RichMarkdownBody";
import type { NoteVisibility } from "@/lib/campaign/types";

export default function RichNoteBody({
  initialMarkdown,
  onChange,
  campaignId,
  noteId,
  audience,
}: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  campaignId: string;
  noteId?: string;
  audience: NoteVisibility;
}) {
  return (
    <div data-note-rich-editor="true">
      <RichMarkdownBody
        value={initialMarkdown}
        isMarkdown
        onChange={(markdown) => onChange(markdown)}
        campaignId={campaignId}
        label="Note body"
        maxLength={20000}
        noteId={noteId}
        audience={audience}
      />
    </div>
  );
}