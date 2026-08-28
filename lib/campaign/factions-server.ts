import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { CampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import type { FactionRelatedRecords, RelatedJobSummary, RelatedPlaceSummary } from "@/lib/campaign/detail-types";
import type { CampaignPlacesContext } from "@/lib/campaign/places-server";
import type { ApiPlace } from "@/lib/campaign/types";
import type { ApiFaction } from "@/lib/campaign/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignFactionsResult = {
  role: "gm" | "player";
  displayName: string;
  factions: ApiFaction[];
};

export type CampaignFactionResult = {
  role: "gm" | "player";
  displayName: string;
  faction: ApiFaction;
  related: FactionRelatedRecords;
};

const factionColumns = "id, author_id, name, description, status, player_notes_markdown, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

function toPlaceSummary(place: Pick<ApiPlace, "id" | "name" | "kind">): RelatedPlaceSummary {
  return { id: place.id, name: place.name, kind: place.kind };
}

async function getFactionRelatedRecords(
  supabase: SupabaseClient,
  campaignId: string,
  factionId: string,
  places: CampaignPlacesContext["places"],
  placeId: string | null,
  affiliations: CampaignAffiliationContext | null,
): Promise<FactionRelatedRecords> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("campaign_id", campaignId)
    .eq("giver_faction_id", factionId);

  if (error) throw new Error(`Unable to read Faction related jobs: ${error.message}`);

  return {
    place: placeId
      ? places.find((place) => place.id === placeId)
        ? toPlaceSummary(places.find((place) => place.id === placeId)!)
        : null
      : null,
    npcs: (affiliations?.npcs ?? [])
      .filter((npc) => npc.factionId === factionId)
      .map(({ id, name, species, role }) => ({ id, name, species, role })),
    jobs: (data ?? []).map((job): RelatedJobSummary => ({
      id: job.id,
      title: job.title,
      status: job.status as RelatedJobSummary["status"],
    })),
  };
}

export async function getCampaignFactions(campaignId: string): Promise<CampaignFactionsResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("factions")
    .select(factionColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to read campaign factions: ${error.message}`);

  const factionsWithArt = await addCampaignArtUrls(context.supabase, data ?? []);
  if (membership.role !== "gm") {
    return { role: membership.role, displayName: membership.displayName, factions: factionsWithArt };
  }

  const factionIds = (data ?? []).map((faction) => faction.id);
  const { data: notes, error: notesError } = factionIds.length
    ? await context.supabase.from("faction_gm_notes").select("faction_id, body_markdown").in("faction_id", factionIds)
    : { data: [], error: null };

  if (notesError) throw new Error(`Unable to read faction private notes: ${notesError.message}`);

  const notesByFaction = new Map((notes ?? []).map((note) => [note.faction_id, note.body_markdown]));
  return {
    role: membership.role,
    displayName: membership.displayName,
    factions: factionsWithArt.map((faction) => ({ ...faction, gm_notes_markdown: notesByFaction.get(faction.id) ?? "" })),
  };
}

export async function getCampaignFaction(
  campaignId: string,
  factionId: string,
  placesResultPromise: Promise<CampaignPlacesContext | null>,
  affiliationsResultPromise: Promise<CampaignAffiliationContext | null> = Promise.resolve(null),
): Promise<CampaignFactionResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("factions")
    .select(factionColumns)
    .eq("id", factionId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign faction: ${error.message}`);
  if (!data) return null;

  const [factionWithArt] = await addCampaignArtUrls(context.supabase, [data]);
  let faction: ApiFaction = factionWithArt;
  if (membership.role === "gm") {
    const { data: notes, error: notesError } = await context.supabase
      .from("faction_gm_notes")
      .select("body_markdown")
      .eq("faction_id", factionId)
      .maybeSingle();

    if (notesError) throw new Error(`Unable to read faction private notes: ${notesError.message}`);
    faction = { ...factionWithArt, gm_notes_markdown: notes?.body_markdown ?? "" };
  }

  const placesResult = await placesResultPromise;
  if (!placesResult) return null;
  const affiliations = await affiliationsResultPromise;

  return {
    role: membership.role,
    displayName: membership.displayName,
    faction,
    related: await getFactionRelatedRecords(context.supabase, campaignId, factionId, placesResult.places, faction.place_id, affiliations),
  };
}