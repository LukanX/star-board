import type { SupabaseClient } from "@supabase/supabase-js";

export type CharacterPortraitAccessFailure = "membership" | "not-found" | "forbidden";

export type CharacterPortraitRecord = {
  id: string;
  campaign_id: string;
  owner_id: string;
  name: string;
  species: string;
  class_name: string;
  level: number;
  backstory_markdown: string;
  physical_description: string;
};

export type CharacterPortraitAccess = {
  character: CharacterPortraitRecord;
  role: "gm" | "player";
  isOwner: boolean;
};

export type CharacterPortraitAccessResult =
  | { access: CharacterPortraitAccess; failure?: never }
  | { access?: never; failure: CharacterPortraitAccessFailure };

export async function loadCharacterPortraitAccess(
  supabase: SupabaseClient,
  campaignId: string,
  characterId: string,
  requesterId: string,
): Promise<CharacterPortraitAccessResult> {
  const [{ data: membership, error: membershipError }, { data: character, error: characterError }] = await Promise.all([
    supabase
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", requesterId)
      .maybeSingle(),
    supabase
      .from("characters")
      .select("id, campaign_id, owner_id, name, species, class_name, level, backstory_markdown, physical_description")
      .eq("campaign_id", campaignId)
      .eq("id", characterId)
      .maybeSingle(),
  ]);

  if (membershipError) throw new Error(`Unable to read campaign membership: ${membershipError.message}`);
  if (characterError) throw new Error(`Unable to read campaign character: ${characterError.message}`);
  if (membership?.role !== "gm" && membership?.role !== "player") return { failure: "membership" };
  if (!character) return { failure: "not-found" };

  const isOwner = character.owner_id === requesterId;
  if (membership.role !== "gm" && !isOwner) return { failure: "forbidden" };

  return {
    access: {
      character: character as CharacterPortraitRecord,
      role: membership.role,
      isOwner,
    },
  };
}

export function canUseCharacterPortraitAi(access: CharacterPortraitAccess, allowPlayerAi: boolean) {
  return access.role === "gm" || (access.isOwner && allowPlayerAi);
}