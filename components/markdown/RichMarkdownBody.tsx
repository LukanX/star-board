"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import NoteFormattingToolbar from "@/components/notes/NoteFormattingToolbar";
import { NoteEntitySuggestion } from "@/components/notes/NoteEntitySuggestion";
import { isNoteMarkdownVisualSafe, noteEditorExtensions, serializeRichMarkdown } from "@/components/notes/noteEditorExtensions";
import { plainTextToDocument } from "@/lib/campaign/plain-text-document";
import type { NoteVisibility } from "@/lib/campaign/types";

export default function RichMarkdownBody({
  value,
  isMarkdown,
  onChange,
  campaignId,
  label,
  maxLength,
  noteId,
  audience,
}: {
  value: string;
  isMarkdown: boolean;
  onChange: (markdown: string, isMarkdown: boolean) => void;
  campaignId: string;
  label: string;
  maxLength: number;
  noteId?: string;
  audience: NoteVisibility;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [sourceMarkdown, setSourceMarkdown] = useState(() => isMarkdown ? value : "");
  const [sourceMode, setSourceMode] = useState(
    () => isMarkdown && !isNoteMarkdownVisualSafe(value),
  );
  const synchronizedValue = useRef({ value, isMarkdown });
  const sourceModeChanged = useRef(false);
  const [extensions] = useState(() => [
    ...noteEditorExtensions,
    NoteEntitySuggestion.configure({
      campaignId,
      noteId,
      audience,
      instanceId,
    }),
  ]);
  const editor = useEditor({
    extensions,
    content: isMarkdown ? value : plainTextToDocument(value),
    contentType: isMarkdown ? "markdown" : "json",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const markdown = serializeRichMarkdown(currentEditor.getJSON());
      synchronizedValue.current = { value: markdown, isMarkdown: true };
      setSourceMarkdown(markdown);
      onChange(markdown, true);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (synchronizedValue.current.value === value
      && synchronizedValue.current.isMarkdown === isMarkdown) return;

    synchronizedValue.current = { value, isMarkdown };
    sourceModeChanged.current = false;
    setSourceMarkdown(isMarkdown ? value : "");
    setSourceMode(isMarkdown && !isNoteMarkdownVisualSafe(value));
    editor.commands.setContent(
      isMarkdown ? value : plainTextToDocument(value),
      { contentType: isMarkdown ? "markdown" : "json", emitUpdate: false },
    );
  }, [editor, isMarkdown, value]);

  const toggleSourceMode = () => {
    if (!sourceMode) {
      if (!editor) return;
      setSourceMarkdown(serializeRichMarkdown(editor.getJSON()));
      sourceModeChanged.current = false;
      setSourceMode(true);
      return;
    }
    if (!editor || !isNoteMarkdownVisualSafe(sourceMarkdown)) return;
    editor.commands.setContent(
      !sourceModeChanged.current && !isMarkdown ? plainTextToDocument(value) : sourceMarkdown,
      {
        contentType: !sourceModeChanged.current && !isMarkdown ? "json" : "markdown",
        emitUpdate: false,
      },
    );
    sourceModeChanged.current = false;
    setSourceMode(false);
  };

  return (
    <div
      className="overflow-hidden border border-[rgba(139,151,169,.28)] bg-[#0a1118] focus-within:border-[var(--cyan)] focus-within:shadow-[0_0_0_2px_rgba(98,232,255,.1)]"
      data-rich-markdown-editor="true"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-2 py-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
            {label.toUpperCase()}
          </span>
          {audience === "gm" ? (
            <span data-private-field="true" className="inline-flex shrink-0 items-center gap-1 text-[var(--pink)] font-mono text-[7px] tracking-[.08em]">
              <LockKeyhole aria-hidden="true" size={10} /> PRIVATE
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span aria-live="polite" className="text-[var(--dim)] font-mono text-[8px]">
            {(sourceMode ? sourceMarkdown : editor ? serializeRichMarkdown(editor.getJSON()) : value).length}/{maxLength}
          </span>
          <button
            className="border-0 bg-transparent p-1 text-[var(--cyan)] font-mono text-[8px] tracking-[.08em] cursor-pointer disabled:cursor-not-allowed disabled:text-[var(--dim)]"
            disabled={sourceMode && !isNoteMarkdownVisualSafe(sourceMarkdown)}
            onClick={toggleSourceMode}
            type="button"
          >
            {sourceMode ? "VISUAL EDITOR" : "EDIT MARKDOWN SOURCE"}
          </button>
        </div>
      </div>
      {sourceMode ? (
        <textarea
          aria-label={`${label} Markdown source`}
          className="min-h-[150px] max-h-[70vh] w-full resize-y overflow-y-auto border-0 bg-transparent px-3 py-2 text-[var(--ink)] font-mono text-[11px] leading-[1.55] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--cyan)]"
          maxLength={maxLength}
          onChange={(event) => {
            const markdown = event.target.value;
            sourceModeChanged.current = true;
            synchronizedValue.current = { value: markdown, isMarkdown: true };
            setSourceMarkdown(markdown);
            onChange(markdown, true);
          }}
          value={sourceMarkdown}
        />
      ) : (
        <>
          <NoteFormattingToolbar editor={editor} ariaLabel={`${label} formatting`} />
          <EditorContent
            className="max-h-[70vh] min-h-[150px] overflow-y-auto px-3 py-2 text-[var(--ink)] text-[11px] leading-[1.65] outline-none [&_.ProseMirror]:min-h-[130px] [&_.ProseMirror]:outline-none [&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:text-[20px] [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-[16px] [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:text-[13px] [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_a]:text-[var(--cyan)] [&_.ProseMirror_code]:text-[var(--amber)] [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:border [&_.ProseMirror_pre]:border-[var(--line)] [&_.ProseMirror_pre]:bg-[#080d14] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_blockquote]:ml-0 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--pink)] [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-[var(--line)] [&_.ProseMirror_td]:p-1 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-[var(--line)] [&_.ProseMirror_th]:p-1"
            editor={editor}
          />
        </>
      )}
    </div>
  );
}