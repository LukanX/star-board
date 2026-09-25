"use client";

import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEditorState, type Editor } from "@tiptap/react";

const toolbarButtonClassName =
  "h-8 w-8 shrink-0 inline-grid place-items-center border border-[var(--line)] bg-[rgba(255,255,255,.025)] text-[var(--muted)] cursor-pointer transition-colors hover:border-[var(--cyan)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-[var(--cyan)] aria-pressed:bg-[rgba(98,232,255,.09)] aria-pressed:text-[var(--cyan)]";

function ToolbarButton({
  label,
  icon,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={toolbarButtonClassName}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
    </button>
  );
}

export default function NoteFormattingToolbar({
  editor,
  ariaLabel = "Text formatting",
}: {
  editor: Editor | null;
  ariaLabel?: string;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => {
      if (!activeEditor) return null;
      return {
        heading: [1, 2, 3].find((level) =>
          activeEditor.isActive("heading", { level }),
        ) ?? 0,
        bold: activeEditor.isActive("bold"),
        italic: activeEditor.isActive("italic"),
        bulletList: activeEditor.isActive("bulletList"),
        orderedList: activeEditor.isActive("orderedList"),
        canUndo: activeEditor.can().undo(),
        canRedo: activeEditor.can().redo(),
      };
    },
  });

  if (!editor || !state) return null;

  const setHeading = (value: string) => {
    const level = Number(value);
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run();
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previousUrl ?? "https://");
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
  };

  return (
    <div
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-2 py-2"
      role="toolbar"
    >
      <select
        aria-label="Text style"
        className="h-8 max-w-[135px] border border-[var(--line)] bg-[#0a1118] px-2 text-[var(--muted)] font-mono text-[9px] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2"
        onChange={(event) => setHeading(event.target.value)}
        value={state.heading}
      >
        <option value={0}>Paragraph</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      <ToolbarButton
        label="Bold"
        icon={<Bold aria-hidden="true" size={15} />}
        pressed={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        icon={<Italic aria-hidden="true" size={15} />}
        pressed={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Bulleted list"
        icon={<List aria-hidden="true" size={15} />}
        pressed={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Numbered list"
        icon={<ListOrdered aria-hidden="true" size={15} />}
        pressed={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Insert or edit link"
        icon={<Link2 aria-hidden="true" size={15} />}
        onClick={setLink}
      />
      <span aria-hidden="true" className="mx-1 h-5 border-l border-[var(--line)]" />
      <ToolbarButton
        label="Undo"
        icon={<Undo2 aria-hidden="true" size={15} />}
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        label="Redo"
        icon={<Redo2 aria-hidden="true" size={15} />}
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}