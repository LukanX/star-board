import type { FactionGenerationInput, MissionGenerationInput, NpcGenerationInput } from "@/lib/validation/ai";
import type { CampaignAiContext } from "@/lib/ai/assistance";
import { imagePromptMaxLength } from "@/lib/validation/image";

export const ART_STYLE_PREFIX =
  "Original retro-futurist tabletop RPG illustration, synthwave space opera, crisp ink contours, luminous cyan and magenta signal lights, controlled film grain, dramatic rim lighting, readable silhouette, no logos, no text, no watermark.";

function campaignLines(context?: CampaignAiContext) {
  return context ? [
    `Campaign system: ${context.system}`,
    `Campaign brief: ${context.description || "No campaign brief recorded."}`,
    `Campaign visual style: ${context.artStyleSuffix}`,
  ] : [];
}

export function buildMissionPrompt(input: MissionGenerationInput, context?: CampaignAiContext) {
  return [
    "You are a campaign writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested mission draft fields.",
    ...campaignLines(context),
    `Campaign setting: ${input.setting ?? "A frontier crew navigating the Drift."}`,
    `Campaign style notes: ${input.styleNotes ?? "Tense, strange, character-forward science fantasy."}`,
    `Mode: ${input.mode}`,
    input.title ? `Existing title: ${input.title}` : "",
    input.giver ? `Possible mission giver: ${input.giver}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "Write a playable hook with a clear complication. Keep player notes spoiler-light and put secrets in gmNotes.",
    "thumbnailDescription must describe one compelling, readable scene for a job-board thumbnail. Keep it subject-specific; do not include provider names, image dimensions, logos, or text.",
    "Fields: title, summary, playerNotes, gmNotes, hook, suggestedGiverType, suggestedGiverName, thumbnailDescription.",
  ].filter(Boolean).join("\n");
}

export function buildNpcPrompt(input: NpcGenerationInput, context?: CampaignAiContext) {
  return [
    "You are a campaign writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested NPC draft fields.",
    ...campaignLines(context),
    `Campaign setting: ${input.setting ?? "A frontier crew navigating the Drift."}`,
    `Campaign style notes: ${input.styleNotes ?? "Tense, strange, character-forward science fantasy."}`,
    `Mode: ${input.mode}`,
    input.name ? `Existing name: ${input.name}` : "",
    input.species ? `Species: ${input.species}` : "",
    input.role ? `Role: ${input.role}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "Write player notes without spoilers and put secrets, leverage, and future reveals in gmNotes.",
    "visualPrompt must be a concise, subject-specific portrait description for later image generation. Do not include provider names, image dimensions, logos, or text.",
    "Fields: name, species, role, shortDescription, playerNotes, gmNotes, motivation, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildFactionPrompt(input: FactionGenerationInput, context?: CampaignAiContext) {
  return [
    "You are a campaign writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested faction draft fields.",
    ...campaignLines(context),
    `Mode: ${input.mode}`,
    input.name ? `Existing name: ${input.name}` : "",
    input.status ? `Existing status: ${input.status}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "Write a distinct organization with a clear public identity, operating status, pressure point, and relationship to the campaign. Keep the description suitable for players.",
    "visualPrompt must be a concise, subject-specific description of an emblem, banner, headquarters, or representative faction scene for later image generation. Do not include provider names, image dimensions, logos, or text.",
    "Fields: name, status, description, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildArtPrompt(subject: string, campaignStyle?: string, refinement?: string, currentPrompt?: string) {
  const fixedParts = [
    ART_STYLE_PREFIX,
    refinement ? `Focused refinement request: ${refinement}` : "",
    `Subject: ${subject}`,
  ].filter(Boolean);
  const fixedPrompt = fixedParts.join(" ");
  const campaignStyleBudget = Math.max(0, imagePromptMaxLength - fixedPrompt.length - (campaignStyle ? 1 : 0));
  const boundedCampaignStyle = campaignStyle ? campaignStyle.slice(0, campaignStyleBudget) : "";
  const freshParts = [ART_STYLE_PREFIX, boundedCampaignStyle, ...fixedParts.slice(1)].filter(Boolean);
  const freshPrompt = freshParts.join(" ");
  const currentPromptLabel = "Refine this existing visual direction: ";
  const currentPromptBudget = Math.max(0, imagePromptMaxLength - freshPrompt.length - (currentPrompt ? currentPromptLabel.length + 1 : 0));
  const boundedCurrentPrompt = currentPrompt && currentPromptBudget > 0
    ? `${currentPromptLabel}${currentPrompt.slice(0, currentPromptBudget)}`
    : "";

  return [freshPrompt, boundedCurrentPrompt].filter(Boolean).join(" ").slice(0, imagePromptMaxLength);
}
