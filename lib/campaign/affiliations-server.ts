import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import type { RelatedFactionSummary, RelatedNpcSummary } from "@/lib/campaign/detail-types";

export type CampaignAffiliationNpc = RelatedNpcSummary & {
  factionId: string | null;
};

export type CampaignAffiliationContext = {
  role: "gm" | "player";
  displayName: string;
  factions: RelatedFactionSummary[];
  npcs: CampaignAffiliationNpc[];
};

export async function getCampaignAffiliationContext(campaignId: string): Promise<CampaignAffiliationContext | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const [npcsResult, factionsResult] = await Promise.all([
    context.supabase
      .from("npcs")
      .select("id, name, species, role, faction_id")
      .eq("campaign_id", campaignId)
      .order("name", { ascending: true }),
    context.supabase
      .from("factions")
      .select("id, name, status")
      .eq("campaign_id", campaignId)
      .order("name", { ascending: true }),
  ]);

  if (npcsResult.error) throw new Error(`Unable to read campaign NPC affiliations: ${npcsResult.error.message}`);
  if (factionsResult.error) throw new Error(`Unable to read campaign faction affiliations: ${factionsResult.error.message}`);

  return {
    role: membership.role,
    displayName: membership.displayName,
    factions: (factionsResult.data ?? []).map((faction): RelatedFactionSummary => ({
      id: faction.id,
      name: faction.name,
      status: faction.status,
    })),
    npcs: (npcsResult.data ?? []).map((npc): CampaignAffiliationNpc => ({
      id: npc.id,
      name: npc.name,
      species: npc.species,
      role: npc.role,
      factionId: npc.faction_id,
    })),
  };
}