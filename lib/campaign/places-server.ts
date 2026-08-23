import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { PlaceRelatedRecords, RelatedEpisodeSummary, RelatedFactionSummary, RelatedJobSummary, RelatedNpcSummary, RelatedPlaceSummary } from "@/lib/campaign/detail-types";
import type { ApiPlace } from "@/lib/campaign/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignPlacesResult = {
  role: "gm" | "player";
  displayName: string;
  places: ApiPlace[];
};

export type CampaignPlacesContext = {
  role: "gm" | "player";
  displayName: string;
  places: Array<Pick<ApiPlace, "id" | "name" | "kind" | "parent_place_id">>;
};

export type CampaignPlaceResult = {
  role: "gm" | "player";
  displayName: string;
  place: ApiPlace;
  related: PlaceRelatedRecords;
};

const placeColumns = "id, campaign_id, author_id, parent_place_id, name, kind, description, player_notes_markdown, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

function toPlaceSummary(place: Pick<ApiPlace, "id" | "name" | "kind">): RelatedPlaceSummary {
  return { id: place.id, name: place.name, kind: place.kind };
}

async function getPlaceRelatedRecords(
  supabase: SupabaseClient,
  campaignId: string,
  placeId: string,
  places: CampaignPlacesContext["places"],
): Promise<PlaceRelatedRecords> {
  const [npcsResult, factionsResult, jobsResult, episodesResult] = await Promise.all([
    supabase.from("npcs").select("id, name, species, role").eq("campaign_id", campaignId).eq("place_id", placeId),
    supabase.from("factions").select("id, name, status").eq("campaign_id", campaignId).eq("place_id", placeId),
    supabase.from("jobs").select("id, title, status").eq("campaign_id", campaignId).eq("place_id", placeId),
    supabase.from("episodes").select("id, title, status").eq("campaign_id", campaignId).eq("place_id", placeId),
  ]);

  const failedRelation = [npcsResult, factionsResult, jobsResult, episodesResult].find((result) => result.error);
  if (failedRelation?.error) {
    throw new Error(`Unable to read campaign place relations: ${failedRelation.error.message}`);
  }

  const place = places.find((candidate) => candidate.id === placeId);
  const parent = place?.parent_place_id
    ? places.find((candidate) => candidate.id === place.parent_place_id)
    : undefined;

  return {
    parent: parent ? toPlaceSummary(parent) : null,
    children: places
      .filter((candidate) => candidate.parent_place_id === placeId)
      .map(toPlaceSummary),
    npcs: (npcsResult.data ?? []).map((npc): RelatedNpcSummary => ({
      id: npc.id,
      name: npc.name,
      species: npc.species,
      role: npc.role,
    })),
    factions: (factionsResult.data ?? []).map((faction): RelatedFactionSummary => ({
      id: faction.id,
      name: faction.name,
      status: faction.status,
    })),
    jobs: (jobsResult.data ?? []).map((job): RelatedJobSummary => ({
      id: job.id,
      title: job.title,
      status: job.status as RelatedJobSummary["status"],
    })),
    episodes: (episodesResult.data ?? []).map((episode): RelatedEpisodeSummary => ({
      id: episode.id,
      title: episode.title,
      status: episode.status as RelatedEpisodeSummary["status"],
    })),
  };
}

export async function getCampaignPlaces(campaignId: string): Promise<CampaignPlacesResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("places")
    .select(placeColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Unable to read campaign places: ${error.message}`);

  const placesWithArt = await addCampaignArtUrls(context.supabase, data ?? []);
  if (membership.role !== "gm") {
    return { role: membership.role, displayName: membership.displayName, places: placesWithArt };
  }

  const placeIds = (data ?? []).map((place) => place.id);
  const { data: notes, error: notesError } = placeIds.length
    ? await context.supabase.from("place_gm_notes").select("place_id, body_markdown").in("place_id", placeIds)
    : { data: [], error: null };

  if (notesError) throw new Error(`Unable to read place private notes: ${notesError.message}`);

  const notesByPlace = new Map((notes ?? []).map((note) => [note.place_id, note.body_markdown]));
  return {
    role: membership.role,
    displayName: membership.displayName,
    places: placesWithArt.map((place) => ({ ...place, gm_notes_markdown: notesByPlace.get(place.id) ?? "" })),
  };
}

export async function getCampaignPlace(
  campaignId: string,
  placeId: string,
  placesResultPromise: Promise<CampaignPlacesContext | null>,
): Promise<CampaignPlaceResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("places")
    .select(placeColumns)
    .eq("id", placeId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign place: ${error.message}`);
  if (!data) return null;

  const [placeWithArt] = await addCampaignArtUrls(context.supabase, [data]);
  let place: ApiPlace = placeWithArt;

  if (membership.role === "gm") {
    const { data: notes, error: notesError } = await context.supabase
      .from("place_gm_notes")
      .select("body_markdown")
      .eq("place_id", placeId)
      .maybeSingle();

    if (notesError) throw new Error(`Unable to read place private notes: ${notesError.message}`);
    place = { ...placeWithArt, gm_notes_markdown: notes?.body_markdown ?? "" };
  }

  const placesResult = await placesResultPromise;
  if (!placesResult) return null;

  return {
    role: membership.role,
    displayName: membership.displayName,
    place,
    related: await getPlaceRelatedRecords(context.supabase, campaignId, placeId, placesResult.places),
  };
}