import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  campaignLibraryAccessSchema,
  campaignLibraryEditorResponseSchema,
  campaignLibraryMemberSchema,
  type CampaignLibraryAccess,
  type CampaignLibraryDirectoryPage,
  type CampaignLibraryDirectoryQuery,
} from "@/lib/validation/library-access";

export class LibraryAccessError extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 | 503 = 503) {
    super(message);
    this.name = "LibraryAccessError";
  }
}

function rpcFailure(error: { code?: string }) {
  if (error.code === "42501") return new LibraryAccessError("Campaign library owner or member access is required.", 403);
  if (error.code === "P0002") return new LibraryAccessError("Campaign member not found.", 404);
  if (error.code === "PT409") return new LibraryAccessError("Campaign owner editing access is inherited and cannot be changed here.", 409);
  if (error.code === "22023") return new LibraryAccessError("Campaign library access request is invalid.", 400);
  return new LibraryAccessError("Campaign library access service is unavailable.");
}

export async function loadCampaignLibraryAccess(supabase: SupabaseClient, campaignId: string): Promise<CampaignLibraryAccess> {
  const { data, error } = await supabase.rpc("get_campaign_system_library_access", { p_campaign_id: campaignId });
  if (error) throw rpcFailure(error);
  const parsed = campaignLibraryAccessSchema.safeParse(data);
  if (!parsed.success) throw new LibraryAccessError("Campaign library access returned invalid data.");
  return parsed.data;
}

export async function readCampaignLibraryMembers(
  supabase: SupabaseClient, campaignId: string, query: CampaignLibraryDirectoryQuery,
): Promise<CampaignLibraryDirectoryPage> {
  const { data, error } = await supabase.rpc("list_campaign_system_library_members", {
    p_campaign_id: campaignId,
    p_query: query.q,
    p_limit: query.limit,
    p_after_name: query.cursor?.displayName ?? null,
    p_after_id: query.cursor?.userId ?? null,
  });
  if (error) throw rpcFailure(error);
  const parsed = z.array(campaignLibraryMemberSchema).max(query.limit + 1).safeParse(data);
  if (!parsed.success) throw new LibraryAccessError("Campaign member directory returned invalid data.");
  const members = parsed.data.slice(0, query.limit);
  const last = members.at(-1);
  return {
    members,
    nextCursor: parsed.data.length > query.limit && last
      ? { displayName: last.displayName, userId: last.userId }
      : null,
  };
}

export async function setCampaignLibraryEditor(
  supabase: SupabaseClient, campaignId: string, userId: string, canEdit: boolean,
) {
  const { data, error } = await supabase.rpc("set_campaign_system_library_editor", {
    p_campaign_id: campaignId,
    p_user_id: userId,
    p_can_edit: canEdit,
  });
  if (error) throw rpcFailure(error);
  const parsed = campaignLibraryEditorResponseSchema.safeParse({ member: data });
  if (!parsed.success || parsed.data.member.userId !== userId
    || parsed.data.member.access !== (canEdit ? "editor" : "read-only")) {
    throw new LibraryAccessError("Campaign editor update returned invalid data.");
  }
  return parsed.data.member;
}
