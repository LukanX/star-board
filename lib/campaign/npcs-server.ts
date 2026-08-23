import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { NpcRelatedRecords, RelatedJobSummary, RelatedPlaceSummary } from "@/lib/campaign/detail-types";
import type { CampaignPlacesContext } from "@/lib/campaign/places-server";
import type { ApiPlace } from "@/lib/campaign/types";
import type { ApiNpc } from "@/lib/campaign/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignNpcsResult = {
  role: "gm" | "player";
  displayName: string;
  npcs: ApiNpc[];
};

export type CampaignNpcResult = {
  role: "gm" | "player";
  displayName: string;
  npc: ApiNpc;
  related: NpcRelatedRecords;
};

const npcColumns = "id, author_id, name, species, role, description, player_notes_markdown, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

function toPlaceSummary(place: Pick<ApiPlace, "id" | "name" | "kind">): RelatedPlaceSummary {
  return { id: place.id, name: place.name, kind: place.kind };
}

async function getNpcRelatedRecords(
  supabase: SupabaseClient,
  campaignId: string,
  npcId: string,
  places: CampaignPlacesContext["places"],
  placeId: string | null,
): Promise<NpcRelatedRecords> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("campaign_id", campaignId)
    .eq("giver_npc_id", npcId);

  if (error) throw new Error(`Unable to read NPC related jobs: ${error.message}`);

  return {
    place: placeId
      ? places.find((place) => place.id === placeId)
        ? toPlaceSummary(places.find((place) => place.id === placeId)!)
        : null
      : null,
    jobs: (data ?? []).map((job): RelatedJobSummary => ({
      id: job.id,
      title: job.title,
      status: job.status as RelatedJobSummary["status"],
    })),
  };
}

export async function getCampaignNpcs(campaignId: string): Promise<CampaignNpcsResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("npcs")
    .select(npcColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to read campaign NPCs: ${error.message}`);

  const npcsWithArt = await addCampaignArtUrls(context.supabase, data ?? []);
  if (membership.role !== "gm") {
    return { role: membership.role, displayName: membership.displayName, npcs: npcsWithArt };
  }

  const npcIds = (data ?? []).map((npc) => npc.id);
  const { data: notes, error: notesError } = npcIds.length
    ? await context.supabase.from("npc_gm_notes").select("npc_id, body_markdown").in("npc_id", npcIds)
    : { data: [], error: null };

  if (notesError) throw new Error(`Unable to read NPC private notes: ${notesError.message}`);

  const notesByNpc = new Map((notes ?? []).map((note) => [note.npc_id, note.body_markdown]));
  return {
    role: membership.role,
    displayName: membership.displayName,
    npcs: npcsWithArt.map((npc) => ({ ...npc, gm_notes_markdown: notesByNpc.get(npc.id) ?? "" })),
  };
}

export async function getCampaignNpc(
  campaignId: string,
  npcId: string,
  placesResultPromise: Promise<CampaignPlacesContext | null>,
): Promise<CampaignNpcResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("npcs")
    .select(npcColumns)
    .eq("id", npcId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign NPC: ${error.message}`);
  if (!data) return null;

  const [npcWithArt] = await addCampaignArtUrls(context.supabase, [data]);
  let npc: ApiNpc = npcWithArt;

  if (membership.role === "gm") {
    const { data: notes, error: notesError } = await context.supabase
      .from("npc_gm_notes")
      .select("body_markdown")
      .eq("npc_id", npcId)
      .maybeSingle();

    if (notesError) throw new Error(`Unable to read NPC private notes: ${notesError.message}`);
    npc = { ...npcWithArt, gm_notes_markdown: notes?.body_markdown ?? "" };
  }

  const placesResult = await placesResultPromise;
  if (!placesResult) return null;

  return {
    role: membership.role,
    displayName: membership.displayName,
    npc,
    related: await getNpcRelatedRecords(context.supabase, campaignId, npcId, placesResult.places, npc.place_id),
  };
}