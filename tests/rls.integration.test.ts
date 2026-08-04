import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const env = loadEnv("test", process.cwd(), "");
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const isLoopback = supabaseUrl.length > 0 && new URL(supabaseUrl).hostname === "127.0.0.1";
const isEnabled = process.env.RUN_LOCAL_SUPABASE_TESTS === "1" && isLoopback && publishableKey.length > 0;
const describeLocal = describe.skipIf(!isEnabled);

const campaignName = "Star Board local RLS verification";
const password = "local-rls-test-password-2026";
const gmEmail = "star-board-rls-gm@local.test";
const playerEmail = "star-board-rls-player@local.test";
const joinToken = "local-rls-join-token-with-more-than-20-chars";

let gmClient: SupabaseClient;
let playerClient: SupabaseClient;
let campaignId: string;
let playerId: string;

async function authenticate(email: string) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (!signedIn.error && signedIn.data.session) {
    return client;
  }

  const signedUp = await client.auth.signUp({ email, password });

  if (signedUp.error || !signedUp.data.session) {
    throw new Error(`Unable to authenticate local RLS test user: ${signedUp.error?.message ?? signedIn.error?.message ?? "no session"}`);
  }

  return client;
}

describeLocal("local Supabase RLS boundaries", () => {
  beforeAll(async () => {
    gmClient = await authenticate(gmEmail);
    playerClient = await authenticate(playerEmail);
    const playerUser = (await playerClient.auth.getUser()).data.user;

    if (!playerUser) {
      throw new Error("The local RLS player session has no user.");
    }

    playerId = playerUser.id;

    const { data: existingCampaigns, error: existingError } = await gmClient
      .from("campaigns")
      .select("id")
      .eq("name", campaignName);

    if (existingError) {
      throw existingError;
    }

    for (const existingCampaign of existingCampaigns ?? []) {
      await gmClient.from("campaigns").delete().eq("id", existingCampaign.id);
    }

    const { data, error } = await gmClient.rpc("create_campaign", {
      campaign_name: campaignName,
      campaign_description: "Created by the local RLS integration suite.",
    });

    if (error || !data) {
      throw error ?? new Error("The local RLS test campaign was not created.");
    }

    campaignId = data;
  });

  afterAll(async () => {
    if (campaignId) {
      await gmClient.from("campaigns").delete().eq("id", campaignId);
    }

    await Promise.all([gmClient?.auth.signOut(), playerClient?.auth.signOut()]);
  });

  it("allows members to read a campaign but blocks player mutation", async () => {
    const gmRead = await gmClient.from("campaigns").select("id, description").eq("id", campaignId).single();
    expect(gmRead.error).toBeNull();
    expect(gmRead.data?.description).toContain("local RLS integration suite");

    const playerRead = await playerClient.from("campaigns").select("id").eq("id", campaignId);
    expect(playerRead.error).toBeNull();
    expect(playerRead.data).toEqual([]);

    const unchanged = await gmClient.from("campaigns").select("description").eq("id", campaignId).single();
    expect(unchanged.data?.description).toContain("local RLS integration suite");
  });

  it("keeps join links GM-only and redeems one into player membership", async () => {
    const tokenHash = createHash("sha256").update(joinToken).digest("hex");
    const blockedInsert = await playerClient.from("campaign_join_links").insert({
      campaign_id: campaignId,
      created_by: playerId,
      token_hash: "player-insert-should-be-blocked",
      max_uses: 1,
    });
    expect(blockedInsert.error).not.toBeNull();

    const gmUser = (await gmClient.auth.getUser()).data.user;
    const createdLink = await gmClient.from("campaign_join_links").insert({
      campaign_id: campaignId,
      created_by: gmUser?.id,
      token_hash: tokenHash,
      max_uses: 1,
    });
    expect(createdLink.error).toBeNull();

    const hiddenLink = await playerClient.from("campaign_join_links").select("id").eq("campaign_id", campaignId);
    expect(hiddenLink.error).toBeNull();
    expect(hiddenLink.data).toEqual([]);

    const redeemed = await playerClient.rpc("redeem_campaign_join_link", { join_token_hash: tokenHash });
    expect(redeemed.error).toBeNull();
    expect(redeemed.data).toBe(campaignId);

    const membership = await playerClient
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", playerId)
      .maybeSingle();
    expect(membership.error).toBeNull();
    expect(membership.data?.role).toBe("player");

    const playerRead = await playerClient.from("campaigns").select("id").eq("id", campaignId).single();
    expect(playerRead.error).toBeNull();
    expect(playerRead.data?.id).toBe(campaignId);

    const blockedUpdate = await playerClient
      .from("campaigns")
      .update({ description: "player mutation should be blocked" })
      .eq("id", campaignId)
      .select("description");
    expect(blockedUpdate.error).toBeNull();
    expect(blockedUpdate.data).toEqual([]);

    const unchanged = await gmClient.from("campaigns").select("description").eq("id", campaignId).single();
    expect(unchanged.data?.description).toContain("local RLS integration suite");
  });

  it("enforces authenticated campaign-art ownership in Storage", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    const blockedPath = `${campaignId}/${gmUser?.id}/player-upload-should-be-blocked.png`;
    const ownedPath = `${campaignId}/${playerId}/player-upload.png`;
    const image = new Blob(["local storage test"], { type: "image/png" });

    const blockedUpload = await playerClient.storage.from("campaign-art").upload(blockedPath, image, {
      contentType: "image/png",
      upsert: false,
    });
    expect(blockedUpload.error).not.toBeNull();

    try {
      const upload = await playerClient.storage.from("campaign-art").upload(ownedPath, image, {
        contentType: "image/png",
        upsert: false,
      });
      expect(upload.error).toBeNull();

      const gmDownload = await gmClient.storage.from("campaign-art").download(ownedPath);
      expect(gmDownload.error).toBeNull();
      expect(await gmDownload.data?.text()).toBe("local storage test");
    } finally {
      const cleanup = await playerClient.storage.from("campaign-art").remove([ownedPath]);
      expect(cleanup.error).toBeNull();
    }
  });

  it("limits character mutations to the owner or campaign GM", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    const gmCharacter = await gmClient.from("characters").insert({
      campaign_id: campaignId,
      owner_id: gmUser?.id,
      name: "GM Character",
    }).select("id, name").single();
    expect(gmCharacter.error).toBeNull();
    expect(gmCharacter.data?.name).toBe("GM Character");

    const playerCharacter = await playerClient.from("characters").insert({
      campaign_id: campaignId,
      owner_id: playerId,
      name: "Player Character",
    }).select("id, name").single();
    expect(playerCharacter.error).toBeNull();
    expect(playerCharacter.data?.name).toBe("Player Character");

    const blockedUpdate = await playerClient
      .from("characters")
      .update({ name: "Player Cannot Rename GM Character" })
      .eq("id", gmCharacter.data?.id)
      .eq("campaign_id", campaignId)
      .select("name");
    expect(blockedUpdate.error).toBeNull();
    expect(blockedUpdate.data).toEqual([]);

    const blockedDelete = await playerClient
      .from("characters")
      .delete()
      .eq("id", gmCharacter.data?.id)
      .eq("campaign_id", campaignId)
      .select("id");
    expect(blockedDelete.error).toBeNull();
    expect(blockedDelete.data).toEqual([]);

    const ownerUpdate = await playerClient
      .from("characters")
      .update({ name: "Player Character Updated" })
      .eq("id", playerCharacter.data?.id)
      .eq("campaign_id", campaignId)
      .select("name")
      .single();
    expect(ownerUpdate.error).toBeNull();
    expect(ownerUpdate.data?.name).toBe("Player Character Updated");

    const gmUpdate = await gmClient
      .from("characters")
      .update({ name: "GM Renamed Player Character" })
      .eq("id", playerCharacter.data?.id)
      .eq("campaign_id", campaignId)
      .select("name")
      .single();
    expect(gmUpdate.error).toBeNull();
    expect(gmUpdate.data?.name).toBe("GM Renamed Player Character");
  });
});