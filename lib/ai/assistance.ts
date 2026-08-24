import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignAiContext = {
  system: string;
  description: string;
  artStyleSuffix: string;
};

export type MissionAiReferences = {
  giver?:
    | {
        type: "NPC";
        name: string;
        species: string;
        role: string;
        description: string;
        playerNotes: string;
        gmNotes: string;
      }
    | {
        type: "FACTION";
        name: string;
        status: string;
        description: string;
      };
  location?: {
    name: string;
    kind: string;
    hierarchy: Array<{ name: string; kind: string }>;
    description: string;
    playerNotes: string;
    gmNotes: string;
  };
};

type MissionAiReferenceInput = {
  giverType?: "npc" | "faction";
  giverId?: string;
  placeId?: string | null;
};

type GenerationStatus = "complete" | "failed";
type GenerationKind = "mission" | "npc" | "faction" | "place" | "character" | "image" | "enemy";

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

export async function loadMissionAiReferences(supabase: SupabaseClient, campaignId: string, input: MissionAiReferenceInput) {
  let giverResult: { data: Record<string, string> | null; error: unknown } | null = null;
  let placeResult: { data: Record<string, string> | null; error: unknown } | null = null;
  let placeTreeResult: { data: Array<Record<string, string | null>> | null; error: unknown } | null = null;

  if (input.giverType && input.giverId) {
    giverResult = await supabase
      .from(input.giverType === "npc" ? "npcs" : "factions")
      .select(input.giverType === "npc" ? "name, species, role, description, player_notes_markdown" : "name, status, description")
      .eq("id", input.giverId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
  }

  if (input.placeId) {
    [placeResult, placeTreeResult] = await Promise.all([
      supabase
        .from("places")
        .select("id, parent_place_id, name, kind, description, player_notes_markdown")
        .eq("id", input.placeId)
        .eq("campaign_id", campaignId)
        .maybeSingle(),
      supabase
        .from("places")
        .select("id, parent_place_id, name, kind")
        .eq("campaign_id", campaignId),
    ]);
  }

  if (giverResult?.error || placeResult?.error || placeTreeResult?.error) {
    return { error: "Selected mission context could not be loaded.", unavailable: true as const };
  }

  if (giverResult && !giverResult.data) {
    return { error: "Selected mission giver was not found in this campaign.", notFound: true as const };
  }

  if (placeResult && !placeResult.data) {
    return { error: "Selected mission location was not found in this campaign.", notFound: true as const };
  }

  const references: MissionAiReferences = {};

  if (giverResult?.data && input.giverType === "npc") {
    const { data: notes, error: notesError } = await supabase
      .from("npc_gm_notes")
      .select("body_markdown")
      .eq("npc_id", input.giverId)
      .maybeSingle();

    if (notesError) return { error: "Selected mission context could not be loaded.", unavailable: true as const };

    references.giver = {
      type: "NPC",
      name: giverResult.data.name ?? "",
      species: giverResult.data.species ?? "",
      role: giverResult.data.role ?? "",
      description: giverResult.data.description ?? "",
      playerNotes: giverResult.data.player_notes_markdown ?? "",
      gmNotes: notes?.body_markdown ?? "",
    };
  }

  if (giverResult?.data && input.giverType === "faction") {
    references.giver = {
      type: "FACTION",
      name: giverResult.data.name ?? "",
      status: giverResult.data.status ?? "",
      description: giverResult.data.description ?? "",
    };
  }

  if (placeResult?.data && placeTreeResult?.data) {
    const placesById = new Map(placeTreeResult.data.map((place) => [place.id, place]));
    const hierarchy: Array<{ name: string; kind: string }> = [];
    const visited = new Set<string>();
    let current: Record<string, string | null> | undefined = placeResult.data;

    while (current && !visited.has(current.id ?? "")) {
      visited.add(current.id ?? "");
      hierarchy.unshift({ name: current.name ?? "", kind: current.kind ?? "" });
      current = current.parent_place_id ? placesById.get(current.parent_place_id) : undefined;
    }

    const { data: notes, error: notesError } = await supabase
      .from("place_gm_notes")
      .select("body_markdown")
      .eq("place_id", input.placeId)
      .maybeSingle();

    if (notesError) return { error: "Selected mission context could not be loaded.", unavailable: true as const };

    references.location = {
      name: placeResult.data.name ?? "",
      kind: placeResult.data.kind ?? "",
      hierarchy,
      description: placeResult.data.description ?? "",
      playerNotes: placeResult.data.player_notes_markdown ?? "",
      gmNotes: notes?.body_markdown ?? "",
    };
  }

  return { references };
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