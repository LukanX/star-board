export const narrativeStylePresets = [
  "Space Opera",
  "Hard Sci-Fi",
  "Cyberpunk",
  "Science Fantasy",
  "Exploration",
  "First Contact",
  "Political Intrigue",
  "Mystery",
  "Survival",
  "Hopeful",
  "Gritty",
  "Cosmic Horror",
] as const;

export const maxNarrativeStyleTags = 8;
export const maxNarrativeStyleTagLength = 32;
export const maxCampaignSettingLength = 1200;

export function canonicalizeNarrativeStyleTag(tag: string) {
  const trimmed = tag.trim();
  return narrativeStylePresets.find((preset) => preset.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}