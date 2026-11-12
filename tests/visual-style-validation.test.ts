import { describe, expect, it } from "vitest";
import { buildVisualStylePrompt } from "@/lib/ai/visual-style-prompt";
import {
  visualStyleDraftOutputSchema,
  visualStyleCreateInputSchema,
  visualStyleGenerationInputSchema,
  visualStyleNameSchema,
  visualStyleTextSchema,
  visualStyleUpdateInputSchema,
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

  it("limits generated drafts to 300 characters without shrinking manual or saved styles", () => {
    const draft = { name: "Neon frontier", visualStyle: "x".repeat(300), rationale: "" };
    expect(visualStyleDraftOutputSchema.safeParse(draft).success).toBe(true);
    expect(visualStyleDraftOutputSchema.safeParse({ ...draft, visualStyle: "x".repeat(301) }).success).toBe(false);

    const saved = { name: draft.name, visualStyle: "x".repeat(1200), status: "ready", wizardInputs: { artDirection: "choose-for-me" }, expectedRevision: 1 };
    expect(visualStyleTextSchema.parse(saved.visualStyle)).toBe(saved.visualStyle);
    expect(visualStyleCreateInputSchema.safeParse(saved).success).toBe(true);
    expect(visualStyleUpdateInputSchema.safeParse(saved).success).toBe(true);
    expect(visualStyleCreateInputSchema.safeParse({ ...saved, visualStyle: "x".repeat(1201) }).success).toBe(false);
    expect(visualStyleUpdateInputSchema.safeParse({ ...saved, visualStyle: "x".repeat(1201) }).success).toBe(false);
  });

  it("asks for a compact reusable style fragment instead of repeated prompt boilerplate", () => {
    const prompt = buildVisualStylePrompt(visualStyleGenerationInputSchema.parse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      artDirection: "inked-illustration",
    }), { system: "Starfinder 2e", description: "A hopeful frontier campaign." });

    expect(prompt).toContain("Target 200-300 characters for visualStyle; never exceed 300 characters.");
    expect(prompt).toContain("short, semicolon-separated rendering cues");
    expect(prompt).toContain("Put medium or linework first, then palette, lighting");
    expect(prompt).not.toContain("500-700");
    expect(prompt).not.toContain("continuity rule");
    expect(prompt).toContain("The visualStyle field must be a standalone prompt fragment");
  });
});