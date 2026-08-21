import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { ApiPlace } from "@/lib/campaign/types";

export type CampaignPlacesResult = {
  role: "gm" | "player";
  displayName: string;
  places: ApiPlace[];
};

export type CampaignPlaceResult = {
  role: "gm" | "player";
  displayName: string;
  place: ApiPlace;
};

const placeColumns = "id, campaign_id, author_id, parent_place_id, name, kind, description, player_notes_markdown, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

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

export async function getCampaignPlace(campaignId: string, placeId: string): Promise<CampaignPlaceResult | null> {
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
  if (membership.role !== "gm") {
    return { role: membership.role, displayName: membership.displayName, place: placeWithArt };
  }

  const { data: notes, error: notesError } = await context.supabase
    .from("place_gm_notes")
    .select("body_markdown")
    .eq("place_id", placeId)
    .maybeSingle();

  if (notesError) throw new Error(`Unable to read place private notes: ${notesError.message}`);

  return {
    role: membership.role,
    displayName: membership.displayName,
    place: { ...placeWithArt, gm_notes_markdown: notes?.body_markdown ?? "" },
  };
}