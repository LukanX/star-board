import type { MissionGenerationInput, NpcGenerationInput } from "@/lib/validation/ai";

export const ART_STYLE_PREFIX =
  "Original retro-futurist tabletop RPG illustration, synthwave space opera, crisp ink contours, luminous cyan and magenta signal lights, controlled film grain, dramatic rim lighting, readable silhouette, no logos, no text, no watermark.";

export function buildMissionPrompt(input: MissionGenerationInput) {
  return [
    "You are a campaign writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested mission draft fields.",
    `Campaign setting: ${input.setting ?? "A frontier crew navigating the Drift."}`,
    `Campaign style notes: ${input.styleNotes ?? "Tense, strange, character-forward science fantasy."}`,
    `Mode: ${input.mode}`,
    input.title ? `Existing title: ${input.title}` : "",
    input.giver ? `Possible mission giver: ${input.giver}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    "Write a playable hook with a clear complication. Keep player notes spoiler-light and put secrets in gmNotes.",
    "Fields: title, summary, playerNotes, gmNotes, hook, suggestedGiverType, suggestedGiverName.",
  ].filter(Boolean).join("\n");
}

export function buildNpcPrompt(input: NpcGenerationInput) {
  return [
    "You are a campaign writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested NPC draft fields.",
    `Campaign setting: ${input.setting ?? "A frontier crew navigating the Drift."}`,
    `Campaign style notes: ${input.styleNotes ?? "Tense, strange, character-forward science fantasy."}`,
    `Mode: ${input.mode}`,
    input.name ? `Existing name: ${input.name}` : "",
    input.species ? `Species: ${input.species}` : "",
    input.role ? `Role: ${input.role}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    "Write player notes without spoilers and put secrets, leverage, and future reveals in gmNotes.",
    `The visualPrompt must describe the subject using this shared art direction: ${ART_STYLE_PREFIX}`,
    "Fields: name, species, role, shortDescription, playerNotes, gmNotes, motivation, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildArtPrompt(subject: string, campaignStyle?: string) {
  return [ART_STYLE_PREFIX, campaignStyle, subject].filter(Boolean).join(" ");
}
