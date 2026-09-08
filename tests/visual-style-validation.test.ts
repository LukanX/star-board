import { describe, expect, it } from "vitest";
import {
  visualStyleDraftOutputSchema,
  visualStyleNameSchema,
  visualStyleTextSchema,
  visualStyleWizardInputSchema,
} from "@/lib/validation/visual-style";

describe("visual style validation", () => {
  it("accepts a concise generated style and bounded wizard inputs", () => {
    const style = "Original urban fantasy cyberpunk tabletop RPG illustration, synthwave space opera, crisp ink contours, controlled film grain, dramatic rim lighting, readable silhouette, no logos, no text, no watermark.";

    expect(visualStyleDraftOutputSchema.parse({
      name: "Neon frontier",
      visualStyle: style,
      rationale: "Keeps the campaign's neon science-fantasy energy readable across subjects.",
    })).toMatchObject({ name: "Neon frontier", visualStyle: style });
    expect(visualStyleWizardInputSchema.parse({
      campaignVibe: "Hopeful, tense, and strange.",
      artDirection: "inked-illustration",
      directionNotes: "Use crisp contours and restrained grain.",
    })).toEqual({
      campaignVibe: "Hopeful, tense, and strange.",
      artDirection: "inked-illustration",
      directionNotes: "Use crisp contours and restrained grain.",
    });
  });

  it("rejects whitespace-padding and oversized style names or text", () => {
    expect(() => visualStyleNameSchema.parse(" Neon frontier")).toThrow();
    expect(() => visualStyleNameSchema.parse("x".repeat(81))).toThrow();
    expect(() => visualStyleTextSchema.parse("x".repeat(1201))).toThrow();
    expect(() => visualStyleWizardInputSchema.parse({ campaignVibe: "x".repeat(601) })).toThrow();
  });
});