import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignAiContext = {
  system: string;
  description: string;
  artStyleSuffix: string;
};

type GenerationStatus = "complete" | "failed";
type GenerationKind = "mission" | "npc" | "faction" | "image";

export async function loadCampaignAiContext(supabase: SupabaseClient, campaignId: string) {
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("system, description, art_style_suffix")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) return { error: "Campaign context could not be loaded." as const };
  if (!campaign) return { error: "Campaign was not found." as const, notFound: true as const };

  return {
    campaign: {
      system: campaign.system,
      description: campaign.description,
      artStyleSuffix: campaign.art_style_suffix,
    },
  };
}

export async function recordAiGeneration(supabase: SupabaseClient, payload: { campaignId: string; userId: string; kind: GenerationKind; mode: "create" | "refine"; model: string; promptHash: string; status: GenerationStatus; provider?: string; effectiveModel?: string; generationId?: string; inputTokens?: number; outputTokens?: number; costUsd?: number }) {
  return supabase.from("ai_generation_runs").insert({
    campaign_id: payload.campaignId,
    requested_by: payload.userId,
    kind: payload.kind,
    mode: payload.mode,
    model: payload.model,
    prompt_hash: payload.promptHash,
    ...(payload.provider ? { provider: payload.provider } : {}),
    ...(payload.effectiveModel ? { effective_model: payload.effectiveModel } : {}),
    ...(payload.generationId ? { generation_id: payload.generationId } : {}),
    ...(payload.inputTokens !== undefined ? { input_tokens: payload.inputTokens } : {}),
    ...(payload.outputTokens !== undefined ? { output_tokens: payload.outputTokens } : {}),
    ...(payload.costUsd !== undefined ? { cost_usd: payload.costUsd } : {}),
    status: payload.status,
  });
}