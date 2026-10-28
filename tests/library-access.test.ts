import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignLibraryAccess, readCampaignLibraryMembers, setCampaignLibraryEditor } from "@/lib/references/library-access";
import { campaignLibraryDirectoryQuerySchema, campaignLibraryEditorInputSchema } from "@/lib/validation/library-access";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const member = { userId, displayName: "Campaign member", campaignRole: "player", access: "editor", editorGrantedAt: "2026-10-22T12:00:00+00:00" };
let access = { owner: false, member: true, canEdit: false };
let body: unknown;
let failure = false;
const fetchMock = vi.fn<typeof fetch>(async (input) => {
  if (failure) return Response.json({ code: "XX000", message: "private database detail" }, { status: 400 });
  const url = String(input);
  if (url.includes("get_campaign_system_library_access")) return Response.json(access);
  return Response.json(body);
});
const client = createClient("http://127.0.0.1:55421", "unit-test-key", {
  global: { fetch: fetchMock }, auth: { persistSession: false },
});

beforeEach(() => { access = { owner: false, member: true, canEdit: false }; body = undefined; failure = false; fetchMock.mockClear(); });

describe("campaign System library access contracts", () => {
  it("loads campaign owner, membership, and editor access as separate facts", async () => {
    expect(await loadCampaignLibraryAccess(client, campaignId)).toEqual({ owner: false, member: true, canEdit: false });
    access = { owner: true, member: true, canEdit: true };
    expect(await loadCampaignLibraryAccess(client, campaignId)).toEqual({ owner: true, member: true, canEdit: true });
    access = { owner: true, member: false, canEdit: true };
    expect(await loadCampaignLibraryAccess(client, campaignId)).toEqual({ owner: true, member: false, canEdit: true });
    failure = true;
    await expect(loadCampaignLibraryAccess(client, campaignId)).rejects.toThrow("unavailable");
  });
  it("validates bounded member-search input and excludes roles outside editor assignment", () => {
    expect(campaignLibraryDirectoryQuerySchema.parse({})).toEqual({ q: "", limit: 25 });
    expect(campaignLibraryDirectoryQuerySchema.parse({
      cursor: JSON.stringify({ displayName: "Member", userId }), limit: "1",
    }).cursor?.userId).toBe(userId);
    for (const input of [
      { limit: 0 }, { limit: 51 }, { q: "x".repeat(161) },
      { cursor: "{" }, { cursor: "{}" }, { owner: true },
    ]) expect(campaignLibraryDirectoryQuerySchema.safeParse(input).success).toBe(false);
    expect(campaignLibraryEditorInputSchema.safeParse({ canEdit: true }).success).toBe(true);
    expect(campaignLibraryEditorInputSchema.safeParse({ canEdit: true, owner: true }).success).toBe(false);
    expect(campaignLibraryEditorInputSchema.safeParse({ canEdit: "true" }).success).toBe(false);
  });
  it("uses the campaign and literal search, and derives the next cursor from the last visible member", async () => {
    body = [member, { ...member, userId: "00000000-0000-4000-8000-000000000003", displayName: "Another member" }];
    expect(await readCampaignLibraryMembers(client, campaignId, { q: "%_", limit: 1 })).toEqual({
      members: [member], nextCursor: { displayName: member.displayName, userId },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      p_campaign_id: campaignId, p_query: "%_", p_limit: 1, p_after_name: null, p_after_id: null,
    });
    body = [];
    expect(await readCampaignLibraryMembers(client, campaignId, { q: "missing", limit: 25 })).toEqual({ members: [], nextCursor: null });
  });
  it("rejects malformed directory data and mismatched grant/revoke results", async () => {
    body = [{ ...member, email: "unexpected" }];
    await expect(readCampaignLibraryMembers(client, campaignId, { q: "", limit: 1 })).rejects.toThrow("invalid data");
    body = [member, member, member];
    await expect(readCampaignLibraryMembers(client, campaignId, { q: "", limit: 1 })).rejects.toThrow("invalid data");
    body = { ...member, access: "owner" };
    await expect(setCampaignLibraryEditor(client, campaignId, userId, true)).rejects.toThrow("invalid data");
    body = member;
    expect(await setCampaignLibraryEditor(client, campaignId, userId, true)).toEqual(member);
    await expect(setCampaignLibraryEditor(client, campaignId, userId, false)).rejects.toThrow("invalid data");
    failure = true;
    await expect(readCampaignLibraryMembers(client, campaignId, { q: "", limit: 1 })).rejects.toThrow("unavailable");
  });
});
