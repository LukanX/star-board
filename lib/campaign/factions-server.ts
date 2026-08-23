import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
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

const factionColumns = "id, author_id, name, description, status, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

function toPlaceSummary(place: Pick<ApiPlace, "id" | "name" | "kind">): RelatedPlaceSummary {
  return { id: place.id, name: place.name, kind: place.kind };
}

async function getFactionRelatedRecords(
  supabase: SupabaseClient,
  campaignId: string,
  factionId: string,
  places: CampaignPlacesContext["places"],
  placeId: string | null,
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

  const factions = await addCampaignArtUrls(context.supabase, data ?? []);
  return { role: membership.role, displayName: membership.displayName, factions };
}

export async function getCampaignFaction(
  campaignId: string,
  factionId: string,
  placesResultPromise: Promise<CampaignPlacesContext | null>,
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

  const [faction] = await addCampaignArtUrls(context.supabase, [data]);
  const placesResult = await placesResultPromise;
  if (!placesResult) return null;

  return {
    role: membership.role,
    displayName: membership.displayName,
    faction,
    related: await getFactionRelatedRecords(context.supabase, campaignId, factionId, placesResult.places, faction.place_id),
  };
}