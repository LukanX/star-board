import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getCampaignMembership: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getCampaignMembership: mocks.getCampaignMembership,
}));

import { DELETE, GET, POST } from "@/app/api/campaigns/[campaignId]/art/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const validPath = `${campaignId}/${userId}/npc-art.png`;

function createSupabaseMock() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.example/signed-art" }, error: null });
  const storageFrom = vi.fn().mockReturnValue({ upload, remove, createSignedUrl });
  const tableQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  tableQuery.select.mockReturnValue(tableQuery);
  tableQuery.eq.mockReturnValue(tableQuery);
  const from = vi.fn().mockReturnValue(tableQuery);

  return {
    supabase: { from, storage: { from: storageFrom } },
    upload,
    remove,
    createSignedUrl,
  };
}

function params() {
  return { params: Promise.resolve({ campaignId }) };
}

describe("campaign art routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication before signing a valid campaign path", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(new Request(`http://localhost/api/campaigns/${campaignId}/art?path=${encodeURIComponent(validPath)}`), params());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication is required.");
  });

  it("rejects an unsupported upload MIME type before touching Storage", async () => {
    const { supabase, upload } = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Captain" });

    const formData = new FormData();
    formData.append("kind", "npc");
    formData.append("file", new Blob(["not an image"], { type: "text/plain" }), "notes.txt");
    const response = await POST(new Request("http://localhost/api/campaigns/art", { method: "POST", body: formData }), params());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Only JPEG, PNG, WebP, and GIF images are supported.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads a member asset and returns a signed URL", async () => {
    const { supabase, upload, createSignedUrl } = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const formData = new FormData();
    formData.append("kind", "npc");
    formData.append("file", new Blob(["fake png bytes"], { type: "image/png" }), "npc.png");
    const response = await POST(new Request("http://localhost/api/campaigns/art", { method: "POST", body: formData }), params());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.asset).toMatchObject({
      signedUrl: "https://storage.example/signed-art",
      contentType: "image/png",
      kind: "npc",
    });
    expect(payload.asset.path).toMatch(new RegExp(`^${campaignId}/${userId}/npc-[0-9a-f-]+\\.png$`));
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${campaignId}/${userId}/npc-`)), expect.any(File), {
      cacheControl: "31536000",
      contentType: "image/png",
      upsert: false,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(payload.asset.path, 3600);
  });

  it("rejects enemy artwork uploads from players", async () => {
    const { upload } = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase: { storage: { from: vi.fn().mockReturnValue({ upload }) } }, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "player", displayName: "Pilot" });

    const formData = new FormData();
    formData.append("kind", "enemy");
    formData.append("file", new Blob(["fake png bytes"], { type: "image/png" }), "enemy.png");
    const response = await POST(new Request("http://localhost/api/campaigns/art", { method: "POST", body: formData }), params());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe("GM access is required for enemy artwork.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not remove an asset that is already referenced by a campaign record", async () => {
    const { supabase, remove } = createSupabaseMock();
    const referencedQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [{ art_path: validPath }], error: null }),
    };
    referencedQuery.select.mockReturnValue(referencedQuery);
    referencedQuery.eq.mockReturnValue(referencedQuery);
    supabase.from.mockReturnValue(referencedQuery);
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Captain" });

    const response = await DELETE(new Request(`http://localhost/api/campaigns/${campaignId}/art?path=${encodeURIComponent(validPath)}`, { method: "DELETE" }), params());

    expect(response.status).toBe(204);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes an unreferenced member asset", async () => {
    const { supabase, remove } = createSupabaseMock();
    mocks.getAuthenticatedUser.mockResolvedValue({ supabase, user: { id: userId } });
    mocks.getCampaignMembership.mockResolvedValue({ role: "gm", displayName: "Captain" });

    const response = await DELETE(new Request(`http://localhost/api/campaigns/${campaignId}/art?path=${encodeURIComponent(validPath)}`, { method: "DELETE" }), params());

    expect(response.status).toBe(204);
    expect(remove).toHaveBeenCalledWith([validPath]);
  });
});