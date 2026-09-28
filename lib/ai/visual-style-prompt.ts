import type { VisualStyleGenerationInput } from "@/lib/validation/visual-style";

export type VisualStylePromptContext = {
  system: string;
  description: string;
  currentVisualStyle?: string;
};

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

const directionLabels: Record<VisualStyleGenerationInput["artDirection"], string> = {
  "choose-for-me": "Choose a direction that best fits the campaign.",
  "inked-illustration": "Favor confident ink lines, readable silhouettes, and illustrated texture.",
  painterly: "Favor visible brushwork, layered paint, and atmospheric color transitions.",
  "cinematic-realism": "Favor grounded materials, believable light, and cinematic composition.",
  "graphic-design": "Favor bold shapes, controlled palettes, and a graphic visual system.",
};

export function buildVisualStylePrompt(input: VisualStyleGenerationInput, context: VisualStylePromptContext) {
  return [
    "You are a visual art director for a Starfinder 2e campaign manager.",
    "Return only valid JSON matching the requested visual style draft fields.",
    "Create a reusable visual language for future campaign images, not a description of one subject or scene.",
    "Avoid living artist names, copyrighted franchise names, brand names, logos, watermarks, signatures, and image-generation model or provider jargon.",
    `Campaign system: ${truncate(context.system, 240)}`,
    `Campaign brief: ${truncate(context.description || "No campaign brief recorded.", 1600)}`,
    context.currentVisualStyle ? `Current applied style to improve or replace: ${truncate(context.currentVisualStyle, 1200)}` : "No current applied style is available.",
    input.campaignVibe ? `General campaign vibe: ${input.campaignVibe}` : "General campaign vibe: choose a coherent direction from the campaign context.",
    `Art direction: ${directionLabels[input.artDirection]}`,
    input.directionNotes ? `Additional art direction: ${input.directionNotes}` : "",
    "Describe the palette, medium or surface treatment, lighting, texture, atmosphere, and composition. State one concise focal-point or silhouette rule and one concise continuity rule.",
    "Keep visualStyle to approximately 500-700 characters. Select the strongest repeatable cues; do not echo the campaign brief, describe a subject, repeat safety rules, or restate the same visual idea.",
    "Name the style with a memorable but practical campaign-library label.",
    "The visualStyle field must be a standalone prompt fragment suitable for applying separately to future image subjects. Do not include a subject, action, character, location, written text, or output dimensions.",
    "Fields: name, visualStyle, rationale.",
  ].filter(Boolean).join("\n");
}
