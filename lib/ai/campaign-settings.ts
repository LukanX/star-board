import type { SupabaseClient } from "@supabase/supabase-js";
import { aiCapabilities, fallbackAiModels, type AiCapability, type AiModelReference } from "@/lib/ai/model-catalog";

export const defaultEnabledAiModelIds = fallbackAiModels.map((model) => model.id);

export type CampaignAiSettings = {
  enabledModelIds: string[];
};

export async function loadCampaignAiSettings(supabase: SupabaseClient, campaignId: string, availableModelIds: readonly string[] = defaultEnabledAiModelIds): Promise<{ settings: CampaignAiSettings } | { error: string }> {
  const { data, error } = await supabase
    .from("campaign_ai_settings")
    .select("enabled_model_ids")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) return { error: "Campaign AI settings could not be loaded." };

  const knownModelIds = [...new Set(availableModelIds)];
  const configuredIds = Array.isArray(data?.enabled_model_ids)
    ? data.enabled_model_ids.filter((modelId): modelId is string => typeof modelId === "string")
    : data
      ? knownModelIds
      : [];
  const enabledModelIds = knownModelIds.filter((modelId) => configuredIds.includes(modelId));

  return {
    settings: {
      enabledModelIds,
    },
  };
}

export function validateEnabledAiModelIds(modelIds: string[], availableModels: readonly AiModelReference[] = fallbackAiModels): { enabledModelIds: string[] } | { error: string } {
  const uniqueIds = [...new Set(modelIds)];
  const knownIds = new Set<string>(availableModels.map((model) => model.id));

  if (uniqueIds.length !== modelIds.length) return { error: "Each AI model can only be enabled once." };
  if (uniqueIds.some((modelId) => !knownIds.has(modelId))) return { error: "Only compatible models from the OpenRouter catalog can be enabled." };

  for (const capability of aiCapabilities) {
    if (!uniqueIds.some((modelId) => availableModels.some((model) => model.id === modelId && model.capability === capability))) {
      return { error: `Enable at least one ${capability === "image" ? "image" : "structured text"} model.` };
    }
  }

  const enabledIdsInCatalogOrder = availableModels.map((model) => model.id).filter((modelId) => uniqueIds.includes(modelId));
  return { enabledModelIds: [...new Set(enabledIdsInCatalogOrder)] };
}

export function isAiModelEnabled(settings: CampaignAiSettings, modelId: string) {
  return settings.enabledModelIds.includes(modelId);
}

export function getEnabledAiModelIdsForCapability(settings: CampaignAiSettings, capability: AiCapability) {
  return settings.enabledModelIds.filter((modelId) => fallbackAiModels.some((model) => model.id === modelId && model.capability === capability));
}
