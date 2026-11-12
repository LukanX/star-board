import { describe, expect, it } from "vitest";
import { getSupportedImageResolutions } from "@/lib/ai/image-options";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";

const request = {
  campaignId: "00000000-0000-4000-8000-000000000001",
  mode: "create", targetKind: "npc", subject: "A station broker",
};

describe("native image resolution", () => {
  it("offers only advertised native tiers, in ascending order", () => {
    expect(getSupportedImageResolutions(["resolution"], { resolution: ["4K", "512", "1K", "2K"] })).toEqual(["1K", "2K", "4K"]);
    expect(getSupportedImageResolutions(["resolution"], { resolution: ["4K", "2K"] })).toEqual(["2K", "4K"]);
    expect(getSupportedImageResolutions(["size"], { resolution: ["4K"] })).toEqual([]);
    expect(getSupportedImageResolutions(["resolution"], {})).toEqual([]);
    expect(getSupportedImageResolutions(undefined, undefined)).toEqual([]);
  });

  it.each(["1K", "2K", "4K"])("retains %s in requests and review drafts", (resolution) => {
    const input = imageGenerationInputSchema.parse({ ...request, resolution });
    expect(input).toHaveProperty("resolution", resolution);
    const draft = imageDraftSchema.parse({
      generationRunId: request.campaignId, ...request, aspectRatio: "1:1", resolution,
      prompt: "Original direction", image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" },
      provider: "openrouter", model: "test/image", createdAt: "2026-11-05T12:00:00.000Z",
    });
    expect(draft).toHaveProperty("resolution", resolution);
  });

  it("rejects unknown tiers, conflicting pixel sizes, and the retired upscale operation", () => {
    expect(imageGenerationInputSchema.safeParse({ ...request, resolution: "8K" }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({ ...request, resolution: "2K", size: "1024x1024" }).success).toBe(false);
    expect(imageGenerationInputSchema.safeParse({
      campaignId: request.campaignId, mode: "refine", purpose: "studio-art", targetKind: "scene",
      operation: "upscale", upscale: { assetId: request.campaignId },
    }).success).toBe(false);
  });
});
