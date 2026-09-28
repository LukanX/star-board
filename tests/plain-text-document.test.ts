import { describe, expect, it } from "vitest";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { plainTextToDocument } from "@/lib/campaign/plain-text-document";
import { serializeRichMarkdown } from "@/components/notes/noteEditorExtensions";
const markdownParser = unified().use(remarkParse).use(remarkGfm);

function renderedText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as { type?: string; value?: string; children?: unknown[] };
  if (value.type === "text") return value.value ?? "";
  if (value.type === "break") return "\n";
  if (value.type === "paragraph") return (value.children ?? []).map(renderedText).join("") + "\n\n";
  if (value.type === "root") return (value.children ?? []).map(renderedText).join("").replace(/\n\n$/, "");
  return (value.children ?? []).map(renderedText).join("");
}

describe("plain-text editor import", () => {
  it("keeps Markdown-looking punctuation literal and represents single line breaks explicitly", () => {
    expect(plainTextToDocument("# Literal *words* [a link](https://example.test)\nNext line")).toEqual({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "# Literal *words* [a link](https://example.test)" },
          { type: "hardBreak" },
          { type: "text", text: "Next line" },
        ],
      }],
    });
  });

  it("preserves blank lines as paragraph boundaries, including trailing newlines", () => {
    expect(plainTextToDocument("First\n\nSecond\n")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
        { type: "paragraph" },
      ],
    });
  });

  it("normalizes CRLF input without changing the text", () => {
    expect(plainTextToDocument("First\r\nSecond").content?.[0]?.content).toEqual([
      { type: "text", text: "First" },
      { type: "hardBreak" },
      { type: "text", text: "Second" },
    ]);
  });

  it("serializes as Markdown without reinterpreting literal punctuation or line breaks", () => {
    const source = "# Literal *words* [a link](literal destination)\nNext line\n\nSecond paragraph";
    const markdown = serializeRichMarkdown(plainTextToDocument(source));
    const tree = markdownParser.parse(markdown);

    expect(renderedText(tree)).toBe(source);
    expect((tree as { children?: Array<{ type?: string }> }).children?.map((node) => node.type))
      .toEqual(["paragraph", "paragraph"]);
    expect(JSON.stringify(tree)).not.toContain('"type":"link"');
    expect(JSON.stringify(tree)).not.toContain('"type":"strong"');
    expect(JSON.stringify(tree)).not.toContain('"type":"heading"');
  });
});