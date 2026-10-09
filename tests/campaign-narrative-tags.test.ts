import { describe, expect, it } from "vitest";
import {
  maxCampaignSettingLength,
  maxNarrativeStyleTagLength,
  maxNarrativeStyleTags,
  narrativeStylePresets,
} from "@/lib/campaign/narrative-style-tags";
import { campaignNarrativeSettingsSchema } from "@/lib/validation/campaign-narrative-settings";
import { missionGenerationInputSchema } from "@/lib/validation/ai";

const campaignId = "00000000-0000-4000-8000-000000000001";

describe("campaign narrative settings validation", () => {
  it("exposes a compact set of science-fiction narrative presets", () => {
    expect(narrativeStylePresets).toContain("Space Opera");
    expect(narrativeStylePresets).toContain("Exploration");
    expect(narrativeStylePresets).toContain("Political Intrigue");
    expect(narrativeStylePresets).toContain("Cosmic Horror");
    expect(narrativeStylePresets).not.toContain("Painterly");
  });

  it("trims settings and tags and stores known presets with canonical spelling", () => {
    expect(campaignNarrativeSettingsSchema.parse({
      setting: "  A drifting research fleet.  ",
      styleTags: ["  space opera ", "found family"],
    })).toEqual({
      setting: "A drifting research fleet.",
      styleTags: ["Space Opera", "found family"],
    });
  });

  it("accepts an empty setting and empty tag list for explicit clearing", () => {
    expect(campaignNarrativeSettingsSchema.parse({ setting: "", styleTags: [] })).toEqual({ setting: "", styleTags: [] });
  });

  it("rejects case-insensitive duplicates across preset and custom labels", () => {
    expect(campaignNarrativeSettingsSchema.safeParse({
      setting: "",
      styleTags: ["Space Opera", "space opera"],
    }).success).toBe(false);
  });

  it("enforces setting, tag count, and tag length bounds", () => {
    expect(campaignNarrativeSettingsSchema.safeParse({ setting: "x".repeat(maxCampaignSettingLength + 1), styleTags: [] }).success).toBe(false);
    expect(campaignNarrativeSettingsSchema.safeParse({ setting: "", styleTags: Array.from({ length: maxNarrativeStyleTags + 1 }, (_, index) => `tag-${index}`) }).success).toBe(false);
    expect(campaignNarrativeSettingsSchema.safeParse({ setting: "", styleTags: ["x".repeat(maxNarrativeStyleTagLength + 1)] }).success).toBe(false);
  });

  it("rejects empty and control-character tags and unsupported fields", () => {
    expect(campaignNarrativeSettingsSchema.safeParse({ setting: "", styleTags: ["  "] }).success).toBe(false);
    expect(campaignNarrativeSettingsSchema.safeParse({ setting: "", styleTags: ["two\nlines"] }).success).toBe(false);
    expect(campaignNarrativeSettingsSchema.safeParse({ setting: "", styleTags: [], description: "not a setting" }).success).toBe(false);
  });

  it("preserves omitted versus explicit mission tag overrides and canonicalizes supplied tags", () => {
    const campaignDefaults = missionGenerationInputSchema.parse({ campaignId, mode: "create" });
    const noTags = missionGenerationInputSchema.parse({ campaignId, mode: "create", styleTags: [] });
    const customTags = missionGenerationInputSchema.parse({ campaignId, mode: "create", styleTags: [" space opera ", "one-off"] });

    expect(campaignDefaults).not.toHaveProperty("styleTags");
    expect(noTags.styleTags).toEqual([]);
    expect(customTags.styleTags).toEqual(["Space Opera", "one-off"]);
  });

  it("rejects invalid mission tag overrides using the shared campaign tag rules", () => {
    const result = missionGenerationInputSchema.safeParse({
      campaignId,
      mode: "create",
      styleTags: ["Mystery", "mystery"],
    });

    expect(result.success).toBe(false);
  });
});