import type { CharacterGenerationInput, EnemyBriefGenerationInput, EnemyGenerationInput, FactionGenerationInput, MissionGenerationInput, NpcGenerationInput, PlaceGenerationInput } from "@/lib/validation/ai";
import type { CampaignAiContext, MissionAiReferences, PlaceAiContext } from "@/lib/ai/assistance";
import type { ImageGenerationInput } from "@/lib/validation/image";
import { imagePromptMaxLength } from "@/lib/validation/image";

export const ART_STYLE_PREFIX =
  "Original retro-futurist tabletop RPG illustration, synthwave space opera, crisp ink contours, luminous cyan and magenta signal lights, controlled film grain, dramatic rim lighting, readable silhouette, no logos, no text, no watermark.";
const FACTION_ART_STYLE_PREFIX =
  "Original retro-futurist tabletop RPG emblem design, synthwave space opera, crisp ink contours, luminous cyan and magenta signal lights, controlled film grain, dramatic rim lighting, readable silhouette, no written text, no watermark.";
const FACTION_ART_INSTRUCTION =
  "Faction artwork must be only one standalone faction symbol or logo: a centered emblem or insignia on a clean field. Do not create characters, creatures, headquarters, landscapes, banners, environments, action scenes, or narrative moments.";
const ENEMY_ART_INSTRUCTION =
  "Enemy artwork must show one readable creature subject with a clear silhouette and a context-appropriate pose. Do not create a group, encounter scene, stat block, written text, or logos.";

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

function placeContextLines(context?: PlaceAiContext) {
  if (!context) return [];

  return [
    `Place hierarchy: ${context.hierarchy.map((place) => `${place.name} (${place.kind})`).join(" > ")}`,
    `Immediate parent: ${context.parent.name} (${context.parent.kind})`,
    `Immediate parent description: ${context.parent.description || "No public description recorded."}`,
    `Immediate parent player notes: ${context.parent.playerNotes || "No public player notes recorded."}`,
  ];
}

function truncatePromptPart(value: string, maxLength: number) {
  if (maxLength <= 0) return "";
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 3))}...`
    : value;
}

function boundedPlaceArtContext(context: PlaceAiContext | undefined, maxLength: number) {
  if (!context || maxLength <= 0) return "";

  const fixedLines = [
    context.hierarchy.length ? `Place hierarchy: ${context.hierarchy.map((place) => `${place.name} (${place.kind})`).join(" > ")}` : "",
    `Immediate parent: ${context.parent.name} (${context.parent.kind})`,
    "Make sure to keep the child place as the focal subject while making it visibly belong within the immediate parent's architecture, materials, atmosphere, and scale.",
  ].filter(Boolean);
  const fixedPrompt = fixedLines.join(" ");

  if (fixedPrompt.length >= maxLength) return truncatePromptPart(fixedPrompt, maxLength);

  const descriptionLabel = "Immediate parent description: ";
  const playerNotesLabel = "Immediate parent player notes: ";
  const dynamicBudget = Math.max(0, maxLength - fixedPrompt.length - 2);
  const descriptionBudget = Math.ceil(dynamicBudget / 2);
  const playerNotesBudget = Math.floor(dynamicBudget / 2);
  const description = truncatePromptPart(`${descriptionLabel}${context.parent.description || "No public description recorded."}`, descriptionBudget);
  const playerNotes = truncatePromptPart(`${playerNotesLabel}${context.parent.playerNotes || "No public player notes recorded."}`, playerNotesBudget);

  return [fixedPrompt, description, playerNotes].filter(Boolean).join(" ").slice(0, maxLength);
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
    "Write player notes without spoilers and put secrets, leverage, and future reveals in gmNotes. Do not invent or discuss the faction's linked NPC roster.",
    "visualPrompt must be a concise, subject-specific description of one standalone faction symbol or logo for later image generation. Prioritize a centered emblem or insignia on a clean field; do not describe characters, headquarters, landscapes, banners, environments, action scenes, or written text. Do not include provider names or image dimensions.",
    "Fields: name, status, description, playerNotes, gmNotes, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildPlacePrompt(input: PlaceGenerationInput, context?: CampaignAiContext, placeContext?: PlaceAiContext) {
  return [
    "You are a campaign writer for a tabletop campaign manager.",
    "Return only valid JSON matching the requested place draft fields.",
    ...campaignLines(context),
    `Campaign setting: ${input.setting ?? "A richly imagined campaign world shaped by the GM."}`,
    `Campaign style notes: ${input.styleNotes ?? "Distinctive, playable, sensory, and useful at the table."}`,
    `Mode: ${input.mode}`,
    ...(placeContext ? placeContextLines(placeContext) : ["This place is a top-level location in the campaign."]),
    input.name ? `Existing name: ${input.name}` : "",
    input.kind ? `Existing kind label: ${input.kind}` : "",
    input.focus ? `GM focus: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft: ${JSON.stringify(input.currentDraft)}` : "",
    "The kind field is a campaign-specific label, not a fixed genre category. Treat the selected hierarchy and immediate parent's public context as authoritative. Write one distinct child that fits the parent without copying it or inventing a whole automatic subtree.",
    "Preserve visible continuity with the immediate parent through compatible architecture, materials, atmosphere, and scale while adding child-specific detail.",
    "Write player notes without spoilers and put secrets, threats, and future reveals in gmNotes.",
    "visualPrompt must be a concise, subject-specific description for later image generation. Do not include provider names, image dimensions, logos, or text.",
    "Fields: name, kind, description, playerNotes, gmNotes, visualPrompt.",
  ].filter(Boolean).join("\n");
}

export function buildEnemyPrompt(input: EnemyGenerationInput, context?: CampaignAiContext) {
  return [
    "You are a Starfinder 2e creature stat-block writer for a GM campaign manager.",
    "Return only valid JSON matching every requested enemy draft field. Do not return markdown, commentary, or a group of creatures.",
    ...campaignLines(context),
    `Mode: ${input.mode}`,
    input.name ? `Creature name: ${input.name}` : "Create a distinctive creature name.",
    input.level !== undefined ? `Creature level: ${input.level}` : "Choose an appropriate creature level.",
    input.size ? `Size: ${input.size}` : "Choose a supported creature size.",
    input.rarity ? `Rarity: ${input.rarity}` : "Choose a rarity.",
    input.traits?.length ? `Traits: ${input.traits.join(", ")}` : "Choose concise rules-relevant traits.",
    input.family ? `Creature family: ${input.family}` : "",
    input.focus ? `GM direction: ${input.focus}` : "",
    input.currentDraft ? `Current editor draft to refine: ${JSON.stringify(input.currentDraft)}` : "",
    "Produce one complete, internally consistent creature stat block. Include perception and senses, languages, skills, all six ability modifiers, items, AC, saving throws, HP, immunities, resistances, weaknesses, movement, melee/ranged strikes, spellcasting groups, and passive/defensive/offensive special abilities when appropriate.",
    "Use empty arrays or null only when a field genuinely does not apply. Never invent a second creature, encounter, family roster, or sidebar.",
    "Keep gmNotesMarkdown private and spoiler-safe playerDescription brief. artSubject must describe one standalone creature for later artwork and must not include text, logos, stat blocks, or a group.",
    "Fields: name, playerDescription, level, size, rarity, traits, family, statBlock, gmNotesMarkdown, artSubject.",
  ].filter(Boolean).join("\n");
}

export function buildEnemyBriefPrompt(input: EnemyBriefGenerationInput, context?: CampaignAiContext) {
  return [
    "You are a spoiler-safe copy editor for a GM campaign manager.",
    "Return only valid JSON with exactly playerDescription and artSubject.",
    ...campaignLines(context),
    `Mode: ${input.mode}`,
    input.name ? `Creature name: ${input.name}` : "",
    input.level !== undefined ? `Creature level: ${input.level}` : "",
    input.size ? `Creature size: ${input.size}` : "",
    input.rarity ? `Creature rarity: ${input.rarity}` : "",
    input.traits?.length ? `Creature traits: ${input.traits.join(", ")}` : "",
    input.currentDraft ? `GM-only draft context: ${JSON.stringify(input.currentDraft)}` : "",
    input.focus ? `GM direction: ${input.focus}` : "",
    "playerDescription is the only player-visible prose: describe appearance, broad identity, and an immediately useful impression without revealing tactics, exact numbers, weaknesses, resistances, spells, secret motivations, or GM notes.",
    "artSubject must describe only one readable creature subject for artwork. Do not include a group, encounter scene, stat block, written text, logos, or provider names.",
    "Fields: playerDescription, artSubject.",
  ].filter(Boolean).join("\n");
}

export function buildArtPrompt(subject: string, campaignStyle?: string, refinement?: string, currentPrompt?: string, targetKind?: ImageGenerationInput["targetKind"], placeContext?: PlaceAiContext) {
  const stylePrefix = targetKind === "faction" ? FACTION_ART_STYLE_PREFIX : ART_STYLE_PREFIX;
  const subjectParts = [
    targetKind === "faction" ? FACTION_ART_INSTRUCTION : "",
    targetKind === "enemy" ? ENEMY_ART_INSTRUCTION : "",
    refinement ? `Focused refinement request: ${refinement}` : "",
    `Subject: ${subject}`,
  ].filter(Boolean);
  const fixedPrompt = [stylePrefix, ...subjectParts].join(" ");
  const placeContextBudget = Math.max(0, imagePromptMaxLength - fixedPrompt.length - 1);
  const boundedPlaceContext = targetKind === "place" ? boundedPlaceArtContext(placeContext, placeContextBudget) : "";
  const campaignStyleBudget = Math.max(0, imagePromptMaxLength - fixedPrompt.length - (boundedPlaceContext ? boundedPlaceContext.length + 1 : 0) - (campaignStyle ? 1 : 0));
  const boundedCampaignStyle = campaignStyle ? campaignStyle.slice(0, campaignStyleBudget) : "";
  const freshParts = [stylePrefix, boundedPlaceContext, boundedCampaignStyle, ...subjectParts].filter(Boolean);
  const freshPrompt = freshParts.join(" ");
  const currentPromptLabel = "Refine this existing visual direction: ";
  const currentPromptBudget = Math.max(0, imagePromptMaxLength - freshPrompt.length - (currentPrompt ? currentPromptLabel.length + 1 : 0));
  const boundedCurrentPrompt = currentPrompt && currentPromptBudget > 0
    ? `${currentPromptLabel}${currentPrompt.slice(0, currentPromptBudget)}`
    : "";

  return [freshPrompt, boundedCurrentPrompt].filter(Boolean).join(" ").slice(0, imagePromptMaxLength);
}
