import { describe, expect, it } from "vitest";
import { buildVisualStylePrompt } from "@/lib/ai/visual-style-prompt";
import {
  visualStyleDraftOutputSchema,
  visualStyleGenerationInputSchema,
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

  it("asks for a compact reusable style fragment instead of repeated prompt boilerplate", () => {
    const prompt = buildVisualStylePrompt(visualStyleGenerationInputSchema.parse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      artDirection: "inked-illustration",
    }), { system: "Starfinder 2e", description: "A hopeful frontier campaign." });

    expect(prompt).toContain("Keep visualStyle to approximately 500-700 characters.");
    expect(prompt).toContain("The visualStyle field must be a standalone prompt fragment");
  });
});