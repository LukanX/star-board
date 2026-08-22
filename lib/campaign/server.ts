import type { CampaignRecord } from "@/lib/campaign/types";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { getCampaignCharacters, type CampaignCharactersResult } from "@/lib/campaign/characters-server";
import { getCampaignEpisodes, type CampaignEpisodesResult } from "@/lib/campaign/episodes-server";
import { getCampaignFactions, type CampaignFactionsResult } from "@/lib/campaign/factions-server";
import { getCampaignJobs, type CampaignJobsResult } from "@/lib/campaign/jobs-server";
import { getCampaignMembers, type CampaignMembersResult } from "@/lib/campaign/members-server";
import { getCampaignNpcs, type CampaignNpcsResult } from "@/lib/campaign/npcs-server";
import { getCampaignNotes, type CampaignNotesResult } from "@/lib/campaign/notes-server";
import { getCampaignPlaces, type CampaignPlacesResult } from "@/lib/campaign/places-server";

export type CampaignRouteAccess = {
  campaign: CampaignRecord;
  role: "gm" | "player";
  displayName: string;
};

export type CampaignOverviewResult = {
  campaign: CampaignRecord;
  role: CampaignRouteAccess["role"];
  displayName: string;
  jobs: CampaignJobsResult["jobs"];
  characters: CampaignCharactersResult["characters"];
  npcs: CampaignNpcsResult["npcs"];
  factions: CampaignFactionsResult["factions"];
  places: CampaignPlacesResult["places"];
  notes: CampaignNotesResult["notes"];
  episodes: CampaignEpisodesResult["episodes"];
  members: CampaignMembersResult["members"];
};

export async function getCampaignRouteAccess(campaignId: string): Promise<CampaignRouteAccess | null> {
  const context = await getAuthenticatedUser();

  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("campaigns")
    .select("id, name, system, description, created_by")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read campaign route: ${error.message}`);
  }

  if (!data) return null;

  return {
    campaign: data as CampaignRecord,
    role: membership.role,
    displayName: membership.displayName,
  };
}

export async function getCampaignOverview(campaignId: string): Promise<CampaignOverviewResult | null> {
  const access = await getCampaignRouteAccess(campaignId);
  if (!access) return null;

  const [jobsResult, charactersResult, npcsResult, factionsResult, placesResult, notesResult, episodesResult, membersResult] = await Promise.all([
    getCampaignJobs(campaignId),
    getCampaignCharacters(campaignId),
    getCampaignNpcs(campaignId),
    getCampaignFactions(campaignId),
    getCampaignPlaces(campaignId),
    getCampaignNotes(campaignId),
    getCampaignEpisodes(campaignId),
    getCampaignMembers(campaignId),
  ]);

  if (!jobsResult || !charactersResult || !npcsResult || !factionsResult || !placesResult || !notesResult || !episodesResult || !membersResult) {
    return null;
  }

  return {
    campaign: access.campaign,
    role: access.role,
    displayName: access.displayName,
    jobs: jobsResult.jobs,
    characters: charactersResult.characters,
    npcs: npcsResult.npcs,
    factions: factionsResult.factions,
    places: placesResult.places,
    notes: notesResult.notes,
    episodes: episodesResult.episodes,
    members: membersResult.members,
  };
}