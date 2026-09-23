import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { isNoteMarkdownVisualSafe, noteEditorExtensions } from "@/components/notes/noteEditorExtensions";

const markdownManager = new MarkdownManager({
  extensions: noteEditorExtensions,
  markedOptions: { gfm: true },
});
const markdownParser = unified().use(remarkParse).use(remarkGfm);

function withoutPositions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPositions);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "position")
      .map(([key, child]) => [key, withoutPositions(child)]),
  );
}

const roundTripCases = [
  [
    "headings and inline formatting",
    "# Relay log\n\nA **bold** warning and *quiet* signal.",
  ],
  [
    "nested ordered and unordered lists",
    "- First\n- Second\n  - Nested\n\n1. One\n2. Two",
  ],
  [
    "links, blockquotes, and code",
    "> Check the [relay](https://example.test/relay).\n\n`signal lost`",
  ],
  [
    "GFM tables",
    "| Name | Status |\n| --- | --- |\n| Relay | Active |",
  ],
  [
    "GFM task lists and strikethrough",
    "- [ ] Check the antenna\n- [x] Confirm ~~old~~ signal",
  ],
] as const;

describe("note Markdown editor compatibility", () => {
  it.each(roundTripCases)("preserves %s", (_name, source) => {
    const document = markdownManager.parse(source);
    const serialized = markdownManager.serialize(document);

    expect(withoutPositions(markdownParser.parse(serialized))).toEqual(
      withoutPositions(markdownParser.parse(source)),
    );
    expect(isNoteMarkdownVisualSafe(source)).toBe(true);
  });

  it("keeps unsupported inline HTML in Markdown source mode", () => {
    expect(isNoteMarkdownVisualSafe('<div data-note="custom"><p>Keep this markup.</p></div>')).toBe(false);
  });

  it("round-trips a selected entity link without linking adjacent text", () => {
    const source = "[@Sentinel](https://campaign.test/enemy) plain text";
    const serialized = markdownManager.serialize(markdownManager.parse(source));

    expect(withoutPositions(markdownParser.parse(serialized))).toEqual(
      withoutPositions(markdownParser.parse(source)),
    );
  });
});