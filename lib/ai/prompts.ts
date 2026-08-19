import type { CharacterGenerationInput, FactionGenerationInput, MissionGenerationInput, NpcGenerationInput, PlaceGenerationInput } from "@/lib/validation/ai";
import type { CampaignAiContext, MissionAiReferences } from "@/lib/ai/assistance";
import type { ImageGenerationInput } from "@/lib/validation/image";
import { imagePromptMaxLength } from "@/lib/validation/image";

export const ART_STYLE_PREFIX =
  "Original retro-futurist tabletop RPG illustration, synthwave space opera, crisp ink contours, luminous cyan and magenta signal lights, controlled film grain, dramatic rim lighting, readable silhouette, no logos, no text, no watermark.";
const FACTION_ART_STYLE_PREFIX =
  "Original retro-futurist tabletop RPG emblem design, synthwave space opera, crisp ink contours, luminous cyan and magenta signal lights, controlled film grain, dramatic rim lighting, readable silhouette, no written text, no watermark.";
const FACTION_ART_INSTRUCTION =
  "Faction artwork must be only one standalone faction symbol or logo: a centered emblem or insignia on a clean field. Do not create characters, creatures, headquarters, landscapes, banners, environments, action scenes, or narrative moments.";

function campaignLines(context?: CampaignAiContext) {
  return context ? [
    `Campaign system: ${context.system}`,
    `Campaign brief: ${context.description || "No campaign brief recorded."}`,
    `Campaign visual style: ${context.artStyleSuffix}`,
  ] : [];
}

function missionReferenceLines(references?: MissionAiReferences) {
  if (!references) return [];

  const lines: string[] = [];

  if (references.giver) {
    lines.push(`Selected mission giver: ${references.giver.type} named ${references.giver.name}`);
    if (references.giver.type === "NPC") {
      lines.push(`Giver species: ${references.giver.species}`);
      lines.push(`Giver role: ${references.giver.role}`);
      lines.push(`Giver description: ${references.giver.description}`);
      lines.push(`Giver player notes: ${references.giver.playerNotes}`);
      lines.push(`Giver GM notes: ${references.giver.gmNotes}`);
    } else {
      lines.push(`Giver status: ${references.giver.status}`);
      lines.push(`Giver description: ${references.giver.description}`);
    }
  }

  if (references.location) {
    lines.push(`Selected mission location: ${references.location.name} (${references.location.kind})`);
    lines.push(`Location hierarchy: ${references.location.hierarchy.map((place) => `${place.name} (${place.kind})`).join(" > ")}`);
    lines.push(`Location description: ${references.location.description}`);
    lines.push(`Location player notes: ${references.location.playerNotes}`);
    lines.push(`Location GM notes: ${references.location.gmNotes}`);
  }

  return lines;
}

export function buildMissionPrompt(input: MissionGenerationInput, context?: CampaignAiContext, references?: MissionAiReferences) {
  return [
    "You are a campaign writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested mission draft fields.",
    ...campaignLines(context),
    ...missionReferenceLines(references),
    `Campaign setting: ${input.setting ?? "A frontier crew navigating the Drift."}`,
    `Campaign style notes: ${input.styleNotes ?? "Tense, strange, character-forward science fantasy."}`,
    `Mode: ${input.mode}`,
    input.title ? `Existing title: ${input.title}` : "",
    input.giver ? `Possible mission giver: ${input.giver}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "Use the selected mission giver and location as authoritative campaign context. Keep player notes spoiler-light and put secrets in gmNotes.",
    "Write a playable hook with a clear complication.",
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

export function buildCharacterPrompt(input: CharacterGenerationInput, context?: CampaignAiContext) {
  return [
    "You are a character portrait prompt writer for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested character visual prompt fields.",
    ...campaignLines(context),
    `Mode: ${input.mode}`,
    input.name ? `Character name: ${input.name}` : "",
    input.species ? `Species: ${input.species}` : "",
    input.className ? `Class: ${input.className}` : "",
    input.level !== undefined ? `Level: ${input.level}` : "",
    `Backstory: ${input.backstoryMarkdown || "No backstory recorded."}`,
    `Physical appearance: ${input.physicalDescription || "No physical appearance recorded."}`,
    input.focus ? `Portrait direction: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "Assess both the backstory and physical appearance together. Treat the physical appearance as authoritative, and use the backstory to suggest lived-in details, clothing, gear, expression, and portrait mood without contradicting the written appearance.",
    "visualPrompt must be a concise, subject-specific portrait description for later image generation. Describe one character, visible traits, clothing, relevant gear, pose or expression, and a fitting setting or lighting cue. Do not include provider names, image dimensions, logos, written text, or watermarks.",
    "Fields: visualPrompt.",
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
    "visualPrompt must be a concise, subject-specific description of one standalone faction symbol or logo for later image generation. Prioritize a centered emblem or insignia on a clean field; do not describe characters, headquarters, landscapes, banners, environments, action scenes, or written text. Do not include provider names or image dimensions.",
    "Fields: name, status, description, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildPlacePrompt(input: PlaceGenerationInput, context?: CampaignAiContext, hierarchy: Array<{ name: string; kind: string }> = []) {
  return [
    "You are a campaign writer for a tabletop campaign manager.",
    "Return only valid JSON matching the requested place draft fields.",
    ...campaignLines(context),
    `Campaign setting: ${input.setting ?? "A richly imagined campaign world shaped by the GM."}`,
    `Campaign style notes: ${input.styleNotes ?? "Distinctive, playable, sensory, and useful at the table."}`,
    `Mode: ${input.mode}`,
    hierarchy.length ? `Place hierarchy: ${hierarchy.map((place) => `${place.name} (${place.kind})`).join(" > ")}` : "This place is a top-level location in the campaign.",
    input.name ? `Existing name: ${input.name}` : "",
    input.kind ? `Existing kind label: ${input.kind}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "The kind field is a campaign-specific label, not a fixed genre category. Write one distinct place that fits its parent context without inventing a whole automatic subtree.",
    "Write player notes without spoilers and put secrets, threats, and future reveals in gmNotes.",
    "visualPrompt must be a concise, subject-specific description for later image generation. Do not include provider names, image dimensions, logos, or text.",
    "Fields: name, kind, description, playerNotes, gmNotes, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildArtPrompt(subject: string, campaignStyle?: string, refinement?: string, currentPrompt?: string, targetKind?: ImageGenerationInput["targetKind"]) {
  const stylePrefix = targetKind === "faction" ? FACTION_ART_STYLE_PREFIX : ART_STYLE_PREFIX;
  const subjectParts = [
    targetKind === "faction" ? FACTION_ART_INSTRUCTION : "",
    refinement ? `Focused refinement request: ${refinement}` : "",
    `Subject: ${subject}`,
  ].filter(Boolean);
  const fixedPrompt = [stylePrefix, ...subjectParts].join(" ");
  const campaignStyleBudget = Math.max(0, imagePromptMaxLength - fixedPrompt.length - (campaignStyle ? 1 : 0));
  const boundedCampaignStyle = campaignStyle ? campaignStyle.slice(0, campaignStyleBudget) : "";
  const freshParts = [stylePrefix, boundedCampaignStyle, ...subjectParts].filter(Boolean);
  const freshPrompt = freshParts.join(" ");
  const currentPromptLabel = "Refine this existing visual direction: ";
  const currentPromptBudget = Math.max(0, imagePromptMaxLength - freshPrompt.length - (currentPrompt ? currentPromptLabel.length + 1 : 0));
  const boundedCurrentPrompt = currentPrompt && currentPromptBudget > 0
    ? `${currentPromptLabel}${currentPrompt.slice(0, currentPromptBudget)}`
    : "";

  return [freshPrompt, boundedCurrentPrompt].filter(Boolean).join(" ").slice(0, imagePromptMaxLength);
}
