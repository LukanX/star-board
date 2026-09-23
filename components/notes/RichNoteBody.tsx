"use client";

import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import NoteFormattingToolbar from "@/components/notes/NoteFormattingToolbar";
import { isNoteMarkdownVisualSafe, noteEditorExtensions } from "@/components/notes/noteEditorExtensions";
import { NoteEntitySuggestion } from "@/components/notes/NoteEntitySuggestion";
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
  const [sourceMarkdown, setSourceMarkdown] = useState(initialMarkdown);
  const [sourceMode, setSourceMode] = useState(() => !isNoteMarkdownVisualSafe(initialMarkdown));
  const [extensions] = useState(() => [
    ...noteEditorExtensions,
    NoteEntitySuggestion.configure({
      campaignId,
      noteId,
      audience,
    }),
  ]);
  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Note body",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const markdown = currentEditor.getMarkdown();
      setSourceMarkdown(markdown);
      onChange(markdown);
    },
  });

  const toggleSourceMode = () => {
    if (!sourceMode) {
      setSourceMode(true);
      return;
    }
    if (!editor || !isNoteMarkdownVisualSafe(sourceMarkdown)) return;
    editor.commands.setContent(sourceMarkdown, { contentType: "markdown" });
    setSourceMode(false);
  };

  return (
    <div
      className="overflow-hidden border border-[rgba(139,151,169,.28)] bg-[#0a1118] focus-within:border-[var(--cyan)] focus-within:shadow-[0_0_0_2px_rgba(98,232,255,.1)]"
      data-note-rich-editor="true"
    >
      <div className="flex items-center justify-end border-b border-[var(--line)] px-2 py-1">
        <button
          className="border-0 bg-transparent p-1 text-[var(--cyan)] font-mono text-[8px] tracking-[.1em] cursor-pointer disabled:cursor-not-allowed disabled:text-[var(--dim)]"
          disabled={sourceMode && !isNoteMarkdownVisualSafe(sourceMarkdown)}
          onClick={toggleSourceMode}
          type="button"
        >
          {sourceMode ? "VISUAL EDITOR" : "EDIT MARKDOWN SOURCE"}
        </button>
      </div>
      {sourceMode ? (
        <textarea
          aria-label="Note body Markdown source"
          className="min-h-[220px] max-h-[70vh] w-full resize-y overflow-y-auto border-0 bg-transparent px-3 py-2 text-[var(--ink)] font-mono text-[11px] leading-[1.55] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--cyan)]"
          maxLength={20000}
          onChange={(event) => {
            setSourceMarkdown(event.target.value);
            onChange(event.target.value);
          }}
          value={sourceMarkdown}
        />
      ) : (
        <>
          <NoteFormattingToolbar editor={editor} />
          <EditorContent
            className="max-h-[70vh] min-h-[220px] overflow-y-auto px-3 py-2 text-[var(--ink)] text-[11px] leading-[1.65] outline-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:outline-none [&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:text-[20px] [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:text-[16px] [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:text-[13px] [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_a]:text-[var(--cyan)] [&_.ProseMirror_code]:text-[var(--amber)] [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:border [&_.ProseMirror_pre]:border-[var(--line)] [&_.ProseMirror_pre]:bg-[#080d14] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_blockquote]:ml-0 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--pink)] [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-[var(--line)] [&_.ProseMirror_td]:p-1 [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-[var(--line)] [&_.ProseMirror_th]:p-1"
            editor={editor}
          />
        </>
      )}
    </div>
  );
}