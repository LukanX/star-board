import { describe, expect, it } from "vitest";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";

const validDraft = {
  generationRunId: "00000000-0000-4000-8000-000000000001",
  targetKind: "npc" as const,
  mode: "create" as const,
  subject: "A masked station broker",
  prompt: "A masked station broker in a crowded orbital bazaar.",
  image: { base64: "aW1hZ2U=", url: null },
  provider: "openai" as const,
  model: "gpt-image-1",
  createdAt: "2026-08-03T12:34:56.000Z",
};

describe("image generation schemas", () => {
  it("accepts a reviewed draft with a canonical UTC timestamp", () => {
    expect(imageDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("requires either base64 image data or an image URL", () => {
    const result = imageDraftSchema.safeParse({
      ...validDraft,
      image: { base64: null, url: null },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.image).toBeDefined();
    }
  });

  it("rejects an offset timestamp before route normalization", () => {
    expect(imageDraftSchema.safeParse({ ...validDraft, createdAt: "2026-08-03T12:34:56+00:00" }).success).toBe(false);
  });

  it("accepts refinement context without requiring it for create mode", () => {
    const result = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "refine",
      targetKind: "character",
      subject: "A pilot with a cracked visor",
      refinement: "Make the lighting warmer and add a scar over the left eyebrow.",
      currentPrompt: "A pilot in a flight suit, portrait composition.",
    });

    expect(result.success).toBe(true);
  });
});