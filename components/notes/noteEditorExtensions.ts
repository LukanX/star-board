import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
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
    const manager = new MarkdownManager({
      extensions: noteEditorExtensions,
      markedOptions: { gfm: true },
    });
    const roundTripped = manager.serialize(manager.parse(markdown));
    return JSON.stringify(stripMarkdownPositions(markdownAstProcessor.parse(roundTripped)))
      === JSON.stringify(stripMarkdownPositions(markdownAstProcessor.parse(markdown)));
  } catch {
    return false;
  }
}