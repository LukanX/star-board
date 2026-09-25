import { describe, expect, it } from "vitest";
import { markdownExcerpt } from "@/lib/campaign/markdown-excerpt";

describe("Markdown card excerpts", () => {
  it("keeps visible link labels without exposing internal link destinations", () => {
    const href = "/campaigns/00000000-0000-4000-8000-000000000001/npcs/00000000-0000-4000-8000-000000000002";
    const result = markdownExcerpt(`A **warning** from [@Mara](${href}) arrived.`);

    expect(result).toBe("A warning from @Mara arrived.");
    expect(result).not.toContain(href);
  });

  it("collapses paragraphs and bounds long summaries", () => {
    expect(markdownExcerpt("First paragraph.\n\nSecond paragraph.")).toBe("First paragraph. Second paragraph.");
    expect(markdownExcerpt("x".repeat(30), 12)).toBe("xxxxxxxxx...");
  });
});