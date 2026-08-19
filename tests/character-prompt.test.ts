import { describe, expect, it } from "vitest";
import { buildCharacterPrompt } from "@/lib/ai/prompts";

describe("character portrait prompt", () => {
  it("assesses both the backstory and physical appearance", () => {
    const prompt = buildCharacterPrompt({
      campaignId: "00000000-0000-4000-8000-000000000001",
      mode: "create",
      name: "Nova",
      species: "Android",
      className: "Mechanic",
      backstoryMarkdown: "Nova survived a derelict ship and distrusts corporate salvage crews.",
      physicalDescription: "Tall, silver-eyed, with a split left ear and a patched flight jacket.",
    }, { system: "Starfinder 2e", description: "A tense frontier campaign", artStyleSuffix: "Retro-futurist" });

    expect(prompt).toContain("Backstory: Nova survived a derelict ship");
    expect(prompt).toContain("Physical appearance: Tall, silver-eyed");
    expect(prompt).toContain("Assess both the backstory and physical appearance together.");
  });
});