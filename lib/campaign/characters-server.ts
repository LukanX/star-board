import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { getCampaignCredentialForGeneration } from "@/lib/ai/campaign-credentials";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { ApiCharacter } from "@/lib/campaign/types";

export type CampaignCharactersResult = {
  role: "gm" | "player";
  displayName: string;
  characters: ApiCharacter[];
};

const characterColumns = "id, owner_id, name, species, class_name, level, backstory_markdown, physical_description, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

async function portraitCapability(campaignId: string, character: { owner_id: string }, membership: { role: "gm" | "player" }, userId: string) {
  const portraitAiRole = membership.role === "gm" ? "gm" : character.owner_id === userId ? "player" : null;
  if (!portraitAiRole) return { can_generate_portrait: false, portrait_ai_role: null } as const;

  try {
    const credential = await getCampaignCredentialForGeneration(campaignId);
    return {
      can_generate_portrait: portraitAiRole === "gm" || credential.status.allowPlayerAi,
      portrait_ai_role: portraitAiRole,
    } as const;
  } catch {
    return { can_generate_portrait: false, portrait_ai_role: null } as const;
  }
}

export async function getCampaignCharacters(campaignId: string): Promise<CampaignCharactersResult | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("characters")
    .select(characterColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Unable to read campaign characters: ${error.message}`);

  const characters = await addCampaignArtUrls(context.supabase, data ?? []);
  return {
    role: membership.role,
    displayName: membership.displayName,
    characters: characters.map((character) => ({
      ...character,
      can_edit: membership.role === "gm" || character.owner_id === context.user.id,
    })),
  };
}

export async function getCampaignCharacter(campaignId: string, characterId: string): Promise<ApiCharacter | null> {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  const { data, error } = await context.supabase
    .from("characters")
    .select(characterColumns)
    .eq("campaign_id", campaignId)
    .eq("id", characterId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign character: ${error.message}`);
  if (!data) return null;

  const [character] = await addCampaignArtUrls(context.supabase, [data]);
  const capability = await portraitCapability(campaignId, character, membership, context.user.id);
  return {
    ...character,
    can_edit: membership.role === "gm" || character.owner_id === context.user.id,
    ...capability,
  };
}