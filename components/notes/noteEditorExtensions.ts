import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { unified } from "unified";

export const noteEditorExtensions = [
  StarterKit.configure({
    link: { openOnClick: false, autolink: false },
    heading: { levels: [1, 2, 3, 4, 5, 6] },
  }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem,
  Markdown.configure({ markedOptions: { gfm: true } }),
];

const markdownAstProcessor = unified().use(remarkParse).use(remarkGfm);
const markdownManager = new MarkdownManager({
  extensions: noteEditorExtensions,
  markedOptions: { gfm: true },
});

function escapeMarkdownBlockSyntax(markdown: string) {
  return markdown.replace(
    /(^|\n)([ \t]{0,3})(#{1,6}[ \t]|>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+|(?:-{3,}|_{3,}|\*{3,})[ \t]*$|`{3,}|~{3,})/gm,
    (_match, lineStart: string, indentation: string, marker: string) => `${lineStart}${indentation}\\${marker}`,
  );
}

export function serializeRichMarkdown(document: JSONContent): string {
  return (document.content ?? []).map((block) => {
    const markdown = markdownManager.serialize({ type: "doc", content: [block] })
      .replace(/(?:\r?\n)+$/g, "");
    return block.type === "paragraph" ? escapeMarkdownBlockSyntax(markdown) : markdown;
  }).join("\n\n");
}

function stripMarkdownPositions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMarkdownPositions);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "position")
      .map(([key, child]) => [key, stripMarkdownPositions(child)]),
  );
}

export function isNoteMarkdownVisualSafe(markdown: string): boolean {
  try {
    const roundTripped = markdownManager.serialize(markdownManager.parse(markdown));
    return JSON.stringify(stripMarkdownPositions(markdownAstProcessor.parse(roundTripped)))
      === JSON.stringify(stripMarkdownPositions(markdownAstProcessor.parse(markdown)));
  } catch {
    return false;
  }
}