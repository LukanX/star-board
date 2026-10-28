import { describe, expect, it } from "vitest";
import { searchReferences } from "@/lib/references/catalog";
import { buildArtPrompt, buildCharacterPrompt, buildNpcPrompt, ImagePromptBudgetError } from "@/lib/ai/prompts";
import { imageGenerationInputSchema } from "@/lib/validation/image";

const campaignId = "00000000-0000-4000-8000-000000000001";
function context(name: string) {
  const facts: Record<string, string> = { Android: "biomechanical fixture", Vesk: "tail fixture", Kasatha: "Four arms fixture", Barathu: "Floating fixture", Human: "individually varied fixture" };
  return { text: `User-entered test appearance: ${facts[name]}. Explicit subject details override these defaults.`, sources: [] };
}

describe("user-entered appearance prompt contracts", () => {
  it.each([
    ["Android", "biomechanical"],
    ["Vesk", "tail"],
    ["Kasatha", "Four arms"],
    ["Barathu", "Floating"],
    ["Human", "individually varied"],
  ])("preserves %s anatomy through NPC, character, and direct image prompts", (name, fact) => {
    const reference = context(name);
    const input = { campaignId, mode: "create" as const, species: name, physicalDescription: "A deliberate individual variation." };
    expect(buildNpcPrompt(input, undefined, undefined, reference)).toContain(fact);
    expect(buildCharacterPrompt(input, undefined, undefined, reference)).toContain(fact);
    const image = buildArtPrompt("An individual with a missing arm.", "Charcoal, violet light.", undefined, { referenceContext: reference, targetKind: "npc" });
    expect(image).toContain(fact);
    expect(image).toContain("Explicit subject details");
    expect(image).toContain("missing arm");
    expect(image).toContain("Charcoal, violet light.");
    expect(image.length).toBeLessThanOrEqual(3000);
  });
  it("keeps near-limit anatomy and style while enforcing the exact image limit", () => {
    const image = buildArtPrompt("subject ".repeat(150), "violet ".repeat(130), "refine ".repeat(40), { referenceContext: context("Kasatha"), targetKind: "npc" });
    expect(image).toContain("Four arms");
    expect(image).toContain("Campaign visual style:");
    expect(image.length).toBeLessThanOrEqual(3000);
    expect(() => buildArtPrompt("subject ".repeat(150), "style ".repeat(200), "refine ".repeat(100), {
      referenceContext: { ...context("Kasatha"), text: context("Kasatha").text + "x".repeat(1600) }, targetKind: "character",
      characterContext: { name: "N".repeat(120), species: "Kasatha", physicalDescription: "appearance ".repeat(30) },
    })).toThrow(ImagePromptBudgetError);
  });
  it("rejects injecting NPC reference data into another target", () => {
    expect(imageGenerationInputSchema.safeParse({
      campaignId, mode: "create", targetKind: "faction", subject: "A symbol",
      npcReferenceContext: { species: "Vesk", ancestryReference: searchReferences("ancestry", "Vesk")[0].binding },
    }).success).toBe(false);
  });
});
