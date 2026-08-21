import { afterEach, describe, expect, it, vi } from "vitest";

describe("deleteCampaignCharacter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes a character through the campaign-scoped API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { deleteCampaignCharacter } = await import("@/lib/campaign/client/characters");

    await expect(deleteCampaignCharacter("campaign one", "character one")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/campaigns/campaign%20one/characters/character%20one", { method: "DELETE" });
  });
});