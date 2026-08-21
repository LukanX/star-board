import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import type { ApiNpc } from "@/lib/campaign/types";

export type CampaignNpcsResult = {
  role: "gm" | "player";
  displayName: string;
  npcs: ApiNpc[];
};

export type CampaignNpcResult = {
  role: "gm" | "player";
  displayName: string;
  npc: ApiNpc;
};

const npcColumns = "id, author_id, name, species, role, description, player_notes_markdown, place_id, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

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

export async function getCampaignNpc(campaignId: string, npcId: string): Promise<CampaignNpcResult | null> {
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
  if (membership.role !== "gm") {
    return { role: membership.role, displayName: membership.displayName, npc: npcWithArt };
  }

  const { data: notes, error: notesError } = await context.supabase
    .from("npc_gm_notes")
    .select("body_markdown")
    .eq("npc_id", npcId)
    .maybeSingle();

  if (notesError) throw new Error(`Unable to read NPC private notes: ${notesError.message}`);

  return {
    role: membership.role,
    displayName: membership.displayName,
    npc: { ...npcWithArt, gm_notes_markdown: notes?.body_markdown ?? "" },
  };
}