import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "@/components/markdown/MarkdownContent";
import { describe, expect, it } from "vitest";
import NarrativeContent from "@/components/markdown/NarrativeContent";
import { serializeRichMarkdown } from "@/components/notes/noteEditorExtensions";
import { plainTextToDocument } from "@/lib/campaign/plain-text-document";

describe("entity narrative rendering", () => {
  it("enables soft-break handling on MarkdownContent when requested", () => {
    const source = ["First line", "Second line"].join(String.fromCharCode(10));
    const html = renderToStaticMarkup(
      <MarkdownContent source={source} preserveSoftBreaks />,
    );
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain(`<p>${source}</p>`);
  });

  it("does not alter standalone Notes Markdown rendering", () => {
    const source = ["First line", "Second line"].join(String.fromCharCode(10));
    const html = renderToStaticMarkup(<MarkdownContent source={source} />);
    expect(html).not.toContain("whitespace-pre-wrap");
  });

  it("renders a single Markdown newline as a visible line break", () => {
    const source = ["First line", "Second line"].join(String.fromCharCode(10));
    const html = renderToStaticMarkup(<NarrativeContent source={source} isMarkdown />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain(`<p>${source}</p>`);
  });

  it("keeps legacy plain text literal while preserving whitespace", () => {
    const html = renderToStaticMarkup(
      <NarrativeContent source={'# Literal *text* [link](not-a-link)\nNext line'} isMarkdown={false} />,
    );

    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("# Literal *text* [link](not-a-link)");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<strong>");
  });

  it("does not auto-link a literal legacy URL when that field is converted to Markdown", () => {
    const source = serializeRichMarkdown(plainTextToDocument("Literal [link](https://example.test)"));
    const html = renderToStaticMarkup(
      <NarrativeContent source={source} isMarkdown suppressAutolinkLiterals />,
    );

    expect(html).not.toContain("<a ");
    expect(html).toContain("[link](https://example.test)");
  });

  it("renders canonical campaign links through the existing entity preview link component", () => {
    const html = renderToStaticMarkup(
      <NarrativeContent
        source="See [@Mara](/campaigns/00000000-0000-4000-8000-000000000001/npcs/00000000-0000-4000-8000-000000000002)."
        isMarkdown
      />,
    );

    expect(html).toContain("@Mara");
    expect(html).toContain("underline");
    expect(html).toContain("/campaigns/00000000-0000-4000-8000-000000000001/npcs/00000000-0000-4000-8000-000000000002");
  });
});
