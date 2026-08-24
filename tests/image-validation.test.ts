import { describe, expect, it } from "vitest";
import { buildArtPrompt } from "@/lib/ai/prompts";
import { campaignArtKindSchema } from "@/lib/validation/art";
import { imageDraftSchema, imageGenerationInputSchema, imagePromptMaxLength } from "@/lib/validation/image";

const validDraft = {
  generationRunId: "00000000-0000-4000-8000-000000000001",
  targetKind: "npc" as const,
  mode: "create" as const,
  subject: "A masked station broker",
  aspectRatio: "1:1" as const,
  size: "1024x1024" as const,
  prompt: "A masked station broker in a crowded orbital bazaar.",
  image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" },
  provider: "openrouter" as const,
  model: "openai/gpt-image-1",
  createdAt: "2026-08-03T12:34:56.000Z",
};

const placeContext = {
  hierarchy: [
    { name: "Asterion", kind: "planet" },
    { name: "Night Market", kind: "district" },
  ],
  parent: {
    name: "Night Market",
    kind: "district",
    description: "A crowded district beneath the orbital ring.",
    playerNotes: "Public parent notes.",
  },
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

  it("accepts dependent dimensions for a non-square aspect ratio", () => {
    const result = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "create",
      targetKind: "place",
      subject: "A storm-lit orbital harbor",
      aspectRatio: "16:9",
      size: "3840x2160",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a size that does not belong to the selected aspect ratio", () => {
    const result = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "create",
      targetKind: "place",
      subject: "A storm-lit orbital harbor",
      aspectRatio: "3:4",
      size: "3840x2160",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.size).toContain("Size 3840x2160 does not match aspect ratio 3:4.");
  });

  it("accepts Places as an image generation target", () => {
    const input = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "create",
      targetKind: "place",
      subject: "A storm-lit orbital harbor",
    });

    expect(input.success).toBe(true);
    expect(imageDraftSchema.safeParse({ ...validDraft, targetKind: "place" }).success).toBe(true);
  });

  it("accepts a parent reference only for Place artwork", () => {
    const placeInput = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "create",
      targetKind: "place",
      parentPlaceId: "00000000-0000-4000-8000-000000000002",
      subject: "A hidden transit room",
    });
    const npcInput = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "create",
      targetKind: "npc",
      parentPlaceId: "00000000-0000-4000-8000-000000000002",
      subject: "A masked station broker",
    });

    expect(placeInput.success).toBe(true);
    expect(npcInput.success).toBe(false);
    if (!npcInput.success) expect(npcInput.error.flatten().fieldErrors.parentPlaceId).toContain("Parent context is only valid for Place artwork.");
  });

  it("accepts a full previously generated prompt for refinement", () => {
    const result = imageGenerationInputSchema.safeParse({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "refine",
      targetKind: "character",
      subject: "A pilot with a cracked visor",
      currentPrompt: "x".repeat(2000),
    });

    expect(result.success).toBe(true);
  });

  it("keeps a refined prompt within the image draft limit", () => {
    const prompt = buildArtPrompt(
      "A pilot with a cracked visor",
      "A long campaign style brief. ".repeat(100),
      "Make the overcoat white and add salt and pepper to the fur.",
      "Existing visual direction. ".repeat(200),
    );

    expect(prompt.length).toBeLessThanOrEqual(imagePromptMaxLength);
    expect(prompt).toContain("Make the overcoat white");
    expect(prompt).toContain("Subject: A pilot with a cracked visor");
  });

  it("includes bounded parent context while keeping the child subject visible", () => {
    const prompt = buildArtPrompt(
      "A hidden transit room",
      "A broad campaign style brief.",
      undefined,
      undefined,
      "place",
      {
        ...placeContext,
        parent: {
          ...placeContext.parent,
          description: "d".repeat(4000),
          playerNotes: "n".repeat(2400),
        },
      },
    );

    expect(prompt.length).toBeLessThanOrEqual(imagePromptMaxLength);
    expect(prompt).toContain("Place hierarchy: Asterion (planet) > Night Market (district)");
    expect(prompt).toContain("Immediate parent description:");
    expect(prompt).toContain("Immediate parent player notes:");
    expect(prompt).toContain("keep the child place as the focal subject");
    expect(prompt).toContain("Subject: A hidden transit room");
  });

  it("directs faction artwork toward a standalone symbol or logo", () => {
    const prompt = buildArtPrompt("The Glass Meridian", undefined, undefined, undefined, "faction");

    expect(prompt).toContain("only one standalone faction symbol or logo");
    expect(prompt).toContain("Do not create characters");
    expect(prompt).not.toContain("no logos");
  });

  it("directs enemy artwork toward one readable creature subject", () => {
    const prompt = buildArtPrompt("A plated void predator", undefined, undefined, undefined, "enemy");

    expect(prompt).toContain("one readable creature");
    expect(prompt).toContain("Do not create a group");
  });

  it("accepts Places as a campaign artwork target", () => {
    expect(campaignArtKindSchema.parse("place")).toBe("place");
  });
});