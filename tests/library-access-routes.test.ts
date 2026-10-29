import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryAccessError } from "@/lib/references/library-access";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(), loadCampaignLibraryAccess: vi.fn(),
  readCampaignLibraryMembers: vi.fn(), setCampaignLibraryEditor: vi.fn(),
}));
vi.mock("@/lib/auth/permissions", () => mocks);
vi.mock("@/lib/references/library-access", async (original) => ({
  ...await original<typeof import("@/lib/references/library-access")>(), ...mocks,
}));
import { GET } from "@/app/api/campaigns/[campaignId]/system-library-access/route";
import { PUT } from "@/app/api/campaigns/[campaignId]/system-library-access/[userId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const base = { params: Promise.resolve({ campaignId }) };
const target = { params: Promise.resolve({ campaignId, userId }) };
const request = (body: unknown = { canEdit: true }) => new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: userId }, supabase: {} });
  mocks.loadCampaignLibraryAccess.mockResolvedValue({ owner: true, member: true, canEdit: true });
  mocks.readCampaignLibraryMembers.mockResolvedValue({ members: [], nextCursor: null });
  mocks.setCampaignLibraryEditor.mockResolvedValue({ userId, access: "editor" });
});

describe("campaign library access HTTP boundaries", () => {
  it("validates campaign, query, member and mutation inputs before authentication", async () => {
    expect((await GET(new Request("http://localhost?limit=51"), base)).status).toBe(400);
    expect((await GET(new Request("http://localhost?cursor=%7B"), base)).status).toBe(400);
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ campaignId: "invalid" }) })).status).toBe(400);
    expect((await PUT(request({ canEdit: true, owner: true }), target)).status).toBe(400);
    expect((await PUT(new Request("http://localhost", { method: "PUT", body: "{" }), target)).status).toBe(400);
    expect((await PUT(request(), { params: Promise.resolve({ campaignId, userId: "invalid" }) })).status).toBe(400);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
  });
  it("requires authentication for member listing and editor changes", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"), base)).status).toBe(401);
    expect((await PUT(request(), target)).status).toBe(401);
    expect(mocks.readCampaignLibraryMembers).not.toHaveBeenCalled();
    expect(mocks.setCampaignLibraryEditor).not.toHaveBeenCalled();
  });
  it("denies campaign GMs who are not the campaign creator", async () => {
    mocks.loadCampaignLibraryAccess.mockResolvedValue({ owner: false, member: true, canEdit: false });
    expect((await GET(new Request("http://localhost"), base)).status).toBe(403);
    expect((await PUT(request(), target)).status).toBe(403);
    expect(mocks.readCampaignLibraryMembers).not.toHaveBeenCalled();
    expect(mocks.setCampaignLibraryEditor).not.toHaveBeenCalled();
  });
  it("lists only campaign members through the checked helper and returns private responses", async () => {
    const response = await GET(new Request("http://localhost?q=Name&limit=1"), base);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.readCampaignLibraryMembers).toHaveBeenCalledWith({}, campaignId, { q: "Name", limit: 1 });
    expect(await response.json()).toEqual({ members: [], nextCursor: null });
    mocks.loadCampaignLibraryAccess.mockResolvedValue({ owner: true, member: false, canEdit: true });
    expect((await GET(new Request("http://localhost"), base)).status).toBe(200);
  });
  it("returns checked grants and revocations", async () => {
    const saved = await PUT(request({ canEdit: false }), target);
    expect(saved.status).toBe(200);
    expect(saved.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.setCampaignLibraryEditor).toHaveBeenCalledWith({}, campaignId, userId, false);
  });
  it.each([400, 403, 404, 409, 503] as const)("preserves checked RPC failure status %s", async (status) => {
    mocks.setCampaignLibraryEditor.mockRejectedValueOnce(new LibraryAccessError("Checked failure.", status));
    expect((await PUT(request(), target)).status).toBe(status);
  });
  it("reports role and directory storage failures without exposing backend details", async () => {
    mocks.loadCampaignLibraryAccess.mockRejectedValueOnce(new Error("private database detail"));
    const role = await GET(new Request("http://localhost"), base);
    expect(role.status).toBe(503);
    expect(JSON.stringify(await role.json())).not.toContain("private database detail");
    mocks.readCampaignLibraryMembers.mockRejectedValueOnce(new LibraryAccessError("Directory unavailable."));
    expect((await GET(new Request("http://localhost"), base)).status).toBe(503);
  });
});
