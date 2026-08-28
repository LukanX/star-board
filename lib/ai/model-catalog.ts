export const aiCapabilities = ["structured-text", "image"] as const;
export type AiCapability = (typeof aiCapabilities)[number];

export type AiModelTier = "economy" | "balanced" | "quality";

export type CuratedAiModel = {
  id: string;
  label: string;
  tier: AiModelTier;
  capability: AiCapability;
  description: string;
};

export type AiModelReference = {
  id: string;
  capability: AiCapability;
};

export const fallbackAiModels = [
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    tier: "economy",
    capability: "structured-text",
    description: "Fast, economical drafts for routine campaign building.",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "balanced",
    capability: "structured-text",
    description: "A balanced choice for detailed, responsive campaign drafts.",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    tier: "quality",
    capability: "structured-text",
    description: "Higher-quality prose and richer connections between details.",
  },
  {
    id: "openai/gpt-image-1",
    label: "GPT Image 1",
    tier: "balanced",
    capability: "image",
    description: "Consistent square campaign art with broad prompt coverage.",
  },
  {
    id: "google/gemini-2.5-flash-image",
    label: "Gemini 2.5 Flash Image",
    tier: "balanced",
    capability: "image",
    description: "Fast image drafts suited to iterative visual exploration.",
  },
  {
    id: "bytedance-seed/seedream-4.5",
    label: "Seedream 4.5",
    tier: "quality",
    capability: "image",
    description: "A quality-focused alternative for distinctive campaign art.",
  },
  {
    id: "bytedance-seed/seedream-5-0-lite",
    label: "Seedream 5.0 Lite",
    tier: "balanced",
    capability: "image",
    description: "A fast Seedream option for iterative campaign art.",
  },
  {
    id: "bytedance-seed/seedream-5-0-pro",
    label: "Seedream 5.0 Pro",
    tier: "quality",
    capability: "image",
    description: "A high-quality Seedream option for finished campaign art.",
  },
] as const satisfies readonly CuratedAiModel[];

export const curatedAiModels = fallbackAiModels;

export class AiModelSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiModelSelectionError";
  }
}

export function getCuratedAiModels(capability?: AiCapability) {
  return capability ? curatedAiModels.filter((model) => model.capability === capability) : curatedAiModels;
}

export function resolveAiModel(capability: AiCapability, requestedModel: string | undefined, configuredDefault: string, enabledModelIds: readonly string[] = fallbackAiModels.map((model) => model.id), availableModels: readonly AiModelReference[] = fallbackAiModels): AiModelReference {
  const enabledModels = availableModels.filter((candidate) => candidate.capability === capability && enabledModelIds.includes(candidate.id));

  if (!enabledModels.length) {
    throw new AiModelSelectionError("No models are enabled for this generation capability in the campaign.");
  }

  const configuredModel = configuredDefault.trim();
  const modelId = requestedModel?.trim() || (enabledModels.some((candidate) => candidate.id === configuredModel) ? configuredModel : enabledModels[0].id);
  const model = availableModels.find((candidate) => candidate.id === modelId);

  if (!model) {
    throw new AiModelSelectionError("The selected AI model is not available in the Star Board catalog.");
  }

  if (model.capability !== capability) {
    throw new AiModelSelectionError("The selected AI model cannot perform this generation.");
  }

  if (!enabledModelIds.includes(model.id)) {
    throw new AiModelSelectionError("The selected AI model is disabled for this campaign.");
  }

  return model;
}