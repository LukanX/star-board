import { describe, expect, it, vi } from "vitest";
import {
  addCampaignArtUrls,
  createCampaignArtSignedUrl,
  createCampaignArtSignedUrlForCampaign,
  isExternalArtPath,
  removeCampaignArtIfUnreferenced,
  validateCampaignArtPath,
} from "@/lib/storage/campaign-art";

const campaignId = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";
const validPath = `${campaignId}/${ownerId}/npc-art.png`;
const enemyPath = `${campaignId}/${ownerId}/enemy-art.png`;

function createStorageClient(signedUrl = "https://storage.example/signed-art") {
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl }, error: null });
  const from = vi.fn().mockReturnValue({ createSignedUrl });

  return {
    client: { storage: { from } },
    createSignedUrl,
    from,
  };
}

describe("campaign art storage helpers", () => {
  it("accepts only paths scoped to the requested campaign", () => {
    expect(validateCampaignArtPath(campaignId, validPath)).toBe(true);
    expect(validateCampaignArtPath("00000000-0000-4000-8000-000000000003", validPath)).toBe(false);
    expect(validateCampaignArtPath(campaignId, `${campaignId}/${ownerId}/../secret.png`)).toBe(false);
    expect(validateCampaignArtPath(campaignId, `${campaignId}/not-a-user/art.png`)).toBe(false);
  });

  it("passes external art URLs through without a Storage call", async () => {
    const { client, from } = createStorageClient();
    const externalUrl = "https://cdn.example/art.png";

    expect(isExternalArtPath(externalUrl)).toBe(true);
    await expect(createCampaignArtSignedUrl(client as never, externalUrl)).resolves.toBe(externalUrl);
    expect(from).not.toHaveBeenCalled();
  });

  it("creates signed URLs from the private campaign-art bucket", async () => {
    const { client, from, createSignedUrl } = createStorageClient();

    await expect(createCampaignArtSignedUrl(client as never, validPath, 900)).resolves.toBe("https://storage.example/signed-art");
    expect(from).toHaveBeenCalledWith("campaign-art");
    expect(createSignedUrl).toHaveBeenCalledWith(validPath, 900);
  });

  it("caps enemy artwork signed URLs at the short-lived preview lifetime", async () => {
    const { client, createSignedUrl } = createStorageClient();

    await expect(createCampaignArtSignedUrl(client as never, enemyPath)).resolves.toBe("https://storage.example/signed-art");
    expect(createSignedUrl).toHaveBeenCalledWith(enemyPath, 600);
  });

  it("caps enemy artwork with a custom filename when the caller supplies enemy context", async () => {
    const { client, createSignedUrl } = createStorageClient();
    const customEnemyPath = `${campaignId}/${ownerId}/custom-hidden-art.png`;

    await expect(createCampaignArtSignedUrl(client as never, customEnemyPath, 3600, true)).resolves.toBe("https://storage.example/signed-art");
    expect(createSignedUrl).toHaveBeenCalledWith(customEnemyPath, 600);
  });

  it("detects custom-named enemy artwork before signing a campaign path", async () => {
    const { client, createSignedUrl } = createStorageClient();
    const customEnemyPath = `${campaignId}/${ownerId}/custom-hidden-art.png`;
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "enemy-id" }], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    (client as { from?: unknown }).from = vi.fn().mockReturnValue(query);

    await expect(createCampaignArtSignedUrlForCampaign(client as never, campaignId, customEnemyPath)).resolves.toEqual({
      signedUrl: "https://storage.example/signed-art",
      expiresIn: 600,
    });
    expect(createSignedUrl).toHaveBeenCalledWith(customEnemyPath, 600);
  });

  it("returns null URLs when an individual asset cannot be signed", async () => {
    const createSignedUrl = vi.fn()
      .mockResolvedValueOnce({ data: { signedUrl: "https://storage.example/signed-art" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "missing object" } });
    const client = { storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } };

    const result = await addCampaignArtUrls(client as never, [
      { art_path: validPath },
      { art_path: `${campaignId}/${ownerId}/missing.png` },
      { art_path: null },
    ]);

    expect(result).toEqual([
      { art_path: validPath, art_url: "https://storage.example/signed-art" },
      { art_path: `${campaignId}/${ownerId}/missing.png`, art_url: null },
      { art_path: null, art_url: null },
    ]);
  });

  it("removes an unreferenced private asset after all campaign tables are checked", async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const from = vi.fn((table: string) => table === "campaign-art" ? { remove } : query);
    const client = { from, storage: { from } };

    await expect(removeCampaignArtIfUnreferenced(client as never, campaignId, validPath)).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("campaign-art");
    expect(remove).toHaveBeenCalledWith([validPath]);
    expect(query.limit).toHaveBeenCalledTimes(6);
  });

  it("keeps an asset when another campaign record still references it", async () => {
    const remove = vi.fn();
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [{ art_path: validPath }], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const from = vi.fn((table: string) => table === "campaign-art" ? { remove } : query);
    const client = { from, storage: { from } };

    await expect(removeCampaignArtIfUnreferenced(client as never, campaignId, validPath)).resolves.toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});