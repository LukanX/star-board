import { createHash, randomUUID } from "node:crypto";
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
let secondaryCampaignId: string;
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

    if (secondaryCampaignId) {
      await gmClient.from("campaigns").delete().eq("id", secondaryCampaignId);
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

  it("keeps visual styles GM-only and applies a ready style to the campaign snapshot", async () => {
    const originalCampaign = await gmClient.from("campaigns").select("visual_style").eq("id", campaignId).single();
    expect(originalCampaign.error).toBeNull();

    const styleName = `RLS Visual Style ${Date.now()}`;
    let styleId: string | null = null;

    try {
      const playerRead = await playerClient.from("campaign_visual_styles").select("id").eq("campaign_id", campaignId);
      expect(playerRead.error).toBeNull();
      expect(playerRead.data).toEqual([]);

      const created = await gmClient.rpc("create_campaign_visual_style", {
        p_campaign_id: campaignId,
        p_name: styleName,
        p_visual_style: "Crisp ink, cyan edge light, and restrained amber accents.",
        p_status: "ready",
        p_wizard_inputs: { artDirection: "inked-illustration" },
      });
      expect(created.error).toBeNull();
      expect(created.data).toBeTruthy();
      styleId = created.data;

      const playerApply = await playerClient.rpc("apply_campaign_visual_style", { p_campaign_id: campaignId, p_style_id: styleId });
      expect(playerApply.error).not.toBeNull();

      const applied = await gmClient.rpc("apply_campaign_visual_style", { p_campaign_id: campaignId, p_style_id: styleId });
      expect(applied.error).toBeNull();

      const campaignAfterApply = await gmClient.from("campaigns").select("visual_style").eq("id", campaignId).single();
      expect(campaignAfterApply.data?.visual_style).toBe("Crisp ink, cyan edge light, and restrained amber accents.");

      const staleUpdate = await gmClient.rpc("update_campaign_visual_style", {
        p_style_id: styleId,
        p_name: styleName,
        p_visual_style: "A stale update should not win.",
        p_status: "ready",
        p_wizard_inputs: { artDirection: "inked-illustration" },
        p_expected_revision: 99,
      });
      expect(staleUpdate.error).not.toBeNull();
    } finally {
      if (styleId) await gmClient.rpc("delete_campaign_visual_style", { p_style_id: styleId });
      if (originalCampaign.data?.visual_style !== undefined) {
        await gmClient.from("campaigns").update({ visual_style: originalCampaign.data.visual_style }).eq("id", campaignId);
      }
    }
  });

  it("retains a completed visual style preview through the attach RPC", async () => {
    const campaign = await gmClient.from("campaigns").select("created_by").eq("id", campaignId).single();
    expect(campaign.error).toBeNull();

    const gmUserId = campaign.data?.created_by;
    if (!gmUserId) throw new Error("The local RLS campaign has no creator.");

    const styleName = `RLS Preview Style ${Date.now()}`;
    const previewPrompt = "A lone courier skiff crossing a luminous dust storm above a frontier moon";
    const previewStyle = "Crisp ink, cyan edge light, and restrained amber accents.";
    let styleId: string | null = null;
    let generationRunId: string | null = null;

    try {
      const created = await gmClient.rpc("create_campaign_visual_style", {
        p_campaign_id: campaignId,
        p_name: styleName,
        p_visual_style: previewStyle,
        p_status: "ready",
        p_wizard_inputs: { artDirection: "inked-illustration" },
      });
      expect(created.error).toBeNull();
      expect(created.data).toBeTruthy();
      styleId = created.data;

      generationRunId = randomUUID();
      const previewPath = `${campaignId}/${gmUserId}/style-preview-${generationRunId}.png`;
      const generationRun = await gmClient.from("ai_generation_runs").insert({
        id: generationRunId,
        campaign_id: campaignId,
        requested_by: gmUserId,
        kind: "image",
        mode: "create",
        model: "test/image-model",
        prompt_hash: createHash("sha256").update(previewPrompt).digest("hex"),
        purpose: "style-preview",
        visual_style_hash: createHash("sha256").update(previewStyle).digest("hex"),
        image_subject: previewPrompt,
        provider: "openrouter",
        effective_model: "test/image-model",
        target_kind: "visual-style",
        aspect_ratio: "1:1",
        size: "1024x1024",
        image_path: previewPath,
        image_media_type: "image/png",
        status: "complete",
      }).select("id").single();
      expect(generationRun.error).toBeNull();
      expect(generationRun.data?.id).toBe(generationRunId);

      const attached = await gmClient.rpc("attach_campaign_visual_style_preview", {
        p_style_id: styleId,
        p_generation_run_id: generationRunId,
        p_prompt: previewPrompt,
        p_style_hash: createHash("sha256").update(previewStyle).digest("hex"),
        p_expected_revision: 1,
      });
      expect(attached.error).toBeNull();

      const retained = await gmClient
        .from("campaign_visual_styles")
        .select("revision, preview_generation_run_id, preview_path, preview_media_type, preview_prompt, preview_provider, preview_model, preview_subject, preview_aspect_ratio, preview_size, preview_style_hash")
        .eq("id", styleId)
        .single();
      expect(retained.error).toBeNull();
      expect(retained.data).toMatchObject({
        revision: 2,
        preview_generation_run_id: generationRunId,
        preview_path: previewPath,
        preview_media_type: "image/png",
        preview_prompt: previewPrompt,
        preview_provider: "openrouter",
        preview_model: "test/image-model",
        preview_subject: previewPrompt,
        preview_aspect_ratio: "1:1",
        preview_size: "1024x1024",
        preview_style_hash: createHash("sha256").update(previewStyle).digest("hex"),
      });
    } finally {
      if (styleId) await gmClient.rpc("delete_campaign_visual_style", { p_style_id: styleId });
      if (generationRunId) await gmClient.from("ai_generation_runs").delete().eq("id", generationRunId);
    }
  });

  it("saves visual style text and preview metadata atomically", async () => {
    const campaign = await gmClient.from("campaigns").select("created_by").eq("id", campaignId).single();
    expect(campaign.error).toBeNull();

    const gmUserId = campaign.data?.created_by;
    if (!gmUserId) throw new Error("The local RLS campaign has no creator.");

    const firstStyle = "Crisp ink, cyan edge light, and restrained amber accents.";
    const firstPrompt = "A first generated style preview";
    const secondStyle = "Painterly nebula haze, bright hull highlights, and controlled amber accents.";
    const secondPrompt = "A replacement generated style preview";
    const failedStyle = "This update must roll back when preview attachment fails.";
    const failedPrompt = "A failed generated style preview";
    const firstRunId = randomUUID();
    const secondRunId = randomUUID();
    const failedRunId = randomUUID();
    const firstPath = `${campaignId}/${gmUserId}/style-preview-${firstRunId}.png`;
    const secondPath = `${campaignId}/${gmUserId}/style-preview-${secondRunId}.png`;
    const failedPath = `${campaignId}/${gmUserId}/style-preview-${failedRunId}.png`;
    let styleId: string | null = null;

    const insertPreviewRun = async (runId: string, path: string, prompt: string, style: string) => {
      const result = await gmClient.from("ai_generation_runs").insert({
        id: runId,
        campaign_id: campaignId,
        requested_by: gmUserId,
        kind: "image",
        mode: "create",
        model: "test/image-model",
        prompt_hash: createHash("sha256").update(prompt).digest("hex"),
        purpose: "style-preview",
        visual_style_hash: createHash("sha256").update(style).digest("hex"),
        image_subject: prompt,
        provider: "openrouter",
        effective_model: "test/image-model",
        target_kind: "visual-style",
        aspect_ratio: "1:1",
        size: "1024x1024",
        image_path: path,
        image_media_type: "image/png",
        status: "complete",
      }).select("id").single();
      expect(result.error).toBeNull();
    };

    try {
      await insertPreviewRun(firstRunId, firstPath, firstPrompt, firstStyle);
      const created = await gmClient.rpc("create_campaign_visual_style_with_preview", {
        p_campaign_id: campaignId,
        p_name: `Atomic Preview Style ${Date.now()}`,
        p_visual_style: firstStyle,
        p_status: "ready",
        p_wizard_inputs: { artDirection: "inked-illustration" },
        p_generation_run_id: firstRunId,
        p_prompt: firstPrompt,
      });
      expect(created.error).toBeNull();
      expect(created.data).toBeTruthy();
      styleId = created.data;

      const createdRow = await gmClient.from("campaign_visual_styles")
        .select("revision, visual_style, preview_generation_run_id, preview_path")
        .eq("id", styleId)
        .single();
      expect(createdRow.error).toBeNull();
      expect(createdRow.data).toMatchObject({ revision: 2, visual_style: firstStyle, preview_generation_run_id: firstRunId, preview_path: firstPath });

      await insertPreviewRun(secondRunId, secondPath, secondPrompt, secondStyle);
      const updated = await gmClient.rpc("update_campaign_visual_style_with_preview", {
        p_style_id: styleId,
        p_name: "Atomic Preview Style Updated",
        p_visual_style: secondStyle,
        p_status: "ready",
        p_wizard_inputs: { artDirection: "painterly" },
        p_expected_revision: 2,
        p_generation_run_id: secondRunId,
        p_prompt: secondPrompt,
      });
      expect(updated.error).toBeNull();

      const updatedRow = await gmClient.from("campaign_visual_styles")
        .select("revision, visual_style, preview_generation_run_id, preview_path")
        .eq("id", styleId)
        .single();
      expect(updatedRow.error).toBeNull();
      expect(updatedRow.data).toMatchObject({ revision: 4, visual_style: secondStyle, preview_generation_run_id: secondRunId, preview_path: secondPath });

      await insertPreviewRun(failedRunId, failedPath, failedPrompt, firstStyle);
      const failedUpdate = await gmClient.rpc("update_campaign_visual_style_with_preview", {
        p_style_id: styleId,
        p_name: "Should Roll Back",
        p_visual_style: failedStyle,
        p_status: "ready",
        p_wizard_inputs: { artDirection: "painterly" },
        p_expected_revision: 4,
        p_generation_run_id: failedRunId,
        p_prompt: failedPrompt,
      });
      expect(failedUpdate.error).not.toBeNull();
      expect(failedUpdate.error?.code).toBe("22023");

      const unchanged = await gmClient.from("campaign_visual_styles")
        .select("revision, visual_style, preview_generation_run_id, preview_path")
        .eq("id", styleId)
        .single();
      expect(unchanged.error).toBeNull();
      expect(unchanged.data).toMatchObject({ revision: 4, visual_style: secondStyle, preview_generation_run_id: secondRunId, preview_path: secondPath });
    } finally {
      if (styleId) await gmClient.rpc("delete_campaign_visual_style", { p_style_id: styleId });
      await gmClient.from("ai_generation_runs").delete().in("id", [firstRunId, secondRunId, failedRunId]);
    }
  });

  it("keeps unrevealed enemy details private and saves parent/detail rows atomically", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    const sourceHash = "a".repeat(64);
    const sourceSnapshot = {
      provider: "aon",
      system: "Starfinder 2e",
      externalId: 987654,
      canonicalUrl: "https://2e.aonsrd.com/creatures/987654-rls-enemy",
      sourceTitle: "RLS Enemy",
      sourcePage: "Archives of Nethys",
      rulesStatus: "current",
      parserVersion: "aon-v1",
      schemaVersion: 1,
      retrievedAt: "2026-08-23T12:00:00.000Z",
      contentHash: sourceHash,
      parsedPayload: { name: "RLS Enemy", level: 3, size: "medium", rarity: "common", traits: ["humanoid"], family: null, statBlock: { schemaVersion: 1 } },
    };
    const details = {
      level: 3,
      size: "medium",
      rarity: "common",
      traits: ["humanoid"],
      family: null,
      statBlock: { schemaVersion: 1 },
      gmNotesMarkdown: "The hidden patrol knows the access code.",
      origin: "aon",
      artSubject: null,
      artPrompt: null,
      artProvider: null,
      sourceSnapshot,
    };

    const created = await gmClient.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "RLS Enemy", playerDescription: "A revealed patrol enemy.", isRevealed: false, artPath: null },
      p_details: details,
    });
    expect(created.error).toBeNull();
    expect(created.data).toBeTruthy();

    const mismatchedUrlSnapshot = { ...sourceSnapshot, externalId: 987655 };
    const mismatchedUrlCreate = await gmClient.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "RLS Enemy", playerDescription: "A mismatched source URL.", isRevealed: false, artPath: null },
      p_details: { ...details, sourceSnapshot: mismatchedUrlSnapshot },
    });
    expect(mismatchedUrlCreate.error).not.toBeNull();

    const hidden = await playerClient.from("enemies").select("id, name").eq("id", created.data);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);

    const hiddenDetails = await playerClient.from("enemy_details").select("enemy_id").eq("enemy_id", created.data);
    expect(hiddenDetails.error).toBeNull();
    expect(hiddenDetails.data).toEqual([]);

    const blockedMutation = await playerClient.from("enemies").update({ name: "Player Cannot Rename Enemy" }).eq("id", created.data).select("id");
    expect(blockedMutation.error).toBeNull();
    expect(blockedMutation.data).toEqual([]);

    const revealed = await gmClient.from("enemies").update({ is_revealed: true }).eq("id", created.data).select("id").single();
    expect(revealed.error).toBeNull();

    const visible = await playerClient.from("enemies").select("id, name, player_description, is_revealed").eq("id", created.data).single();
    expect(visible.error).toBeNull();
    expect(visible.data).toMatchObject({ id: created.data, name: "RLS Enemy", is_revealed: true });

    const privateAfterReveal = await playerClient.from("enemy_details").select("enemy_id, gm_notes_markdown").eq("enemy_id", created.data);
    expect(privateAfterReveal.error).toBeNull();
    expect(privateAfterReveal.data).toEqual([]);

    const duplicate = await gmClient.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "Duplicate RLS Enemy", playerDescription: "", isRevealed: false, artPath: null },
      p_details: details,
    });
    expect(duplicate.error).not.toBeNull();

    const failedAtomicCreate = await gmClient.rpc("create_enemy_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "Should Roll Back", playerDescription: "", isRevealed: false, artPath: null },
      p_details: { ...details, statBlock: null },
    });
    expect(failedAtomicCreate.error).not.toBeNull();
    const rolledBack = await gmClient.from("enemies").select("id").eq("campaign_id", campaignId).eq("name", "Should Roll Back");
    expect(rolledBack.error).toBeNull();
    expect(rolledBack.data).toEqual([]);

    const gmDetail = await gmClient.from("enemy_details").select("gm_notes_markdown, stat_block").eq("enemy_id", created.data).single();
    expect(gmDetail.error).toBeNull();
    expect(gmDetail.data?.gm_notes_markdown).toContain("access code");
    expect(gmDetail.data?.stat_block).toEqual({ schemaVersion: 1 });

    const deleted = await gmClient.from("enemies").delete().eq("id", created.data).select("id").single();
    expect(deleted.error).toBeNull();
  });

  it("allows both GMs and players to vote on open jobs", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    const npc = await gmClient.from("npcs").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      name: "Vote Test Contact",
    }).select("id").single();
    expect(npc.error).toBeNull();

    const job = await gmClient.from("jobs").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      title: "Vote Test Job",
      giver_npc_id: npc.data?.id,
      status: "open",
    }).select("id").single();
    expect(job.error).toBeNull();

    const gmVote = await gmClient.rpc("cast_job_vote", { target_campaign_id: campaignId, target_job_id: job.data?.id });
    expect(gmVote.error).toBeNull();
    expect(gmVote.data?.user_id).toBe(gmUser?.id);

    const playerVote = await playerClient.rpc("cast_job_vote", { target_campaign_id: campaignId, target_job_id: job.data?.id });
    expect(playerVote.error).toBeNull();
    expect(playerVote.data?.user_id).toBe(playerId);
  });

  it("enforces Places visibility, hierarchy rules, and link cleanup", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    const root = await gmClient.from("places").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      name: "RLS Root Place",
      kind: "planet",
      description: "A visible root.",
    }).select("id, parent_place_id").single();
    expect(root.error).toBeNull();
    expect(root.data?.parent_place_id).toBeNull();

    const child = await gmClient.from("places").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      parent_place_id: root.data?.id,
      name: "RLS Child Place",
      kind: "city",
    }).select("id, parent_place_id").single();
    expect(child.error).toBeNull();

    const grandchild = await gmClient.from("places").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      parent_place_id: child.data?.id,
      name: "RLS Grandchild Place",
      kind: "room",
    }).select("id, parent_place_id").single();
    expect(grandchild.error).toBeNull();

    const duplicateRoot = await gmClient.from("places").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      name: "rls root place",
      kind: "moon",
    });
    expect(duplicateRoot.error).not.toBeNull();

    const selfParent = await gmClient.from("places")
      .update({ parent_place_id: root.data?.id })
      .eq("id", root.data?.id)
      .select("id");
    expect(selfParent.error).not.toBeNull();

    const indirectCycle = await gmClient.from("places")
      .update({ parent_place_id: grandchild.data?.id })
      .eq("id", root.data?.id)
      .select("id");
    expect(indirectCycle.error).not.toBeNull();

    const privateNotes = await gmClient.from("place_gm_notes").insert({
      place_id: root.data?.id,
      body_markdown: "GM-only route beneath the root.",
      updated_by: gmUser?.id,
    });
    expect(privateNotes.error).toBeNull();

    const playerPlaces = await playerClient.from("places").select("id, name").eq("campaign_id", campaignId);
    expect(playerPlaces.error).toBeNull();
    expect(playerPlaces.data?.some((place) => place.id === root.data?.id)).toBe(true);

    const playerPrivateNotes = await playerClient.from("place_gm_notes").select("place_id").eq("place_id", root.data?.id);
    expect(playerPrivateNotes.error).toBeNull();
    expect(playerPrivateNotes.data).toEqual([]);

    const blockedPlayerInsert = await playerClient.from("places").insert({
      campaign_id: campaignId,
      author_id: playerId,
      name: "Player Place Should Be Blocked",
    });
    expect(blockedPlayerInsert.error).not.toBeNull();

    const npc = await gmClient.from("npcs").insert({
      campaign_id: campaignId,
      author_id: gmUser?.id,
      name: "RLS Linked Contact",
      place_id: root.data?.id,
    }).select("id, place_id").single();
    expect(npc.error).toBeNull();
    expect(npc.data?.place_id).toBe(root.data?.id);

    const deletedRoot = await gmClient.from("places").delete().eq("id", root.data?.id).select("id").single();
    expect(deletedRoot.error).toBeNull();

    const survivingChild = await gmClient.from("places").select("parent_place_id").eq("id", child.data?.id).single();
    expect(survivingChild.error).toBeNull();
    expect(survivingChild.data?.parent_place_id).toBeNull();

    const unlinkedNpc = await gmClient.from("npcs").select("place_id").eq("id", npc.data?.id).single();
    expect(unlinkedNpc.error).toBeNull();
    expect(unlinkedNpc.data?.place_id).toBeNull();
  });

  it("enforces faction note privacy, atomic rosters, campaign boundaries, and deletion cleanup", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    if (!gmUser) throw new Error("The local RLS GM session has no user.");

    const firstNpc = await gmClient.from("npcs").insert({
      campaign_id: campaignId,
      author_id: gmUser.id,
      name: "Faction Roster Contact One",
    }).select("id, faction_id").single();
    const secondNpc = await gmClient.from("npcs").insert({
      campaign_id: campaignId,
      author_id: gmUser.id,
      name: "Faction Roster Contact Two",
    }).select("id, faction_id").single();
    expect(firstNpc.error).toBeNull();
    expect(secondNpc.error).toBeNull();

    const created = await gmClient.rpc("create_faction_with_details", {
      p_campaign_id: campaignId,
      p_public: {
        name: "RLS Faction One",
        description: "A public faction record.",
        status: "active",
        playerNotesMarkdown: "Members know the public charter.",
      },
      p_details: { gmNotesMarkdown: "The faction is secretly compromised." },
      p_member_npc_ids: [firstNpc.data?.id, secondNpc.data?.id],
    });
    expect(created.error).toBeNull();
    expect(created.data).toBeTruthy();

    const factionId = created.data as string;
    const playerFaction = await playerClient.from("factions").select("id, player_notes_markdown").eq("id", factionId).single();
    expect(playerFaction.error).toBeNull();
    expect(playerFaction.data?.player_notes_markdown).toContain("public charter");

    const playerRoster = await playerClient.from("npcs").select("id, faction_id").in("id", [firstNpc.data?.id, secondNpc.data?.id]);
    expect(playerRoster.error).toBeNull();
    expect(playerRoster.data?.every((npc) => npc.faction_id === factionId)).toBe(true);

    const hiddenFactionNotes = await playerClient.from("faction_gm_notes").select("faction_id, body_markdown").eq("faction_id", factionId);
    expect(hiddenFactionNotes.error).toBeNull();
    expect(hiddenFactionNotes.data).toEqual([]);

    const blockedFactionMutation = await playerClient.from("factions").update({ name: "Player Cannot Rename Faction" }).eq("id", factionId).select("id");
    expect(blockedFactionMutation.error).toBeNull();
    expect(blockedFactionMutation.data).toEqual([]);

    const blockedPrivateNoteInsert = await playerClient.from("faction_gm_notes").insert({
      faction_id: factionId,
      body_markdown: "Player private note attempt.",
      updated_by: playerId,
    });
    expect(blockedPrivateNoteInsert.error).not.toBeNull();

    const blockedRpc = await playerClient.rpc("update_faction_with_details", {
      p_campaign_id: campaignId,
      p_faction_id: factionId,
      p_public: { name: "Player RPC Cannot Rename Faction" },
      p_details: { gmNotesMarkdown: "Player RPC private note attempt." },
      p_member_npc_ids: [],
    });
    expect(blockedRpc.error).not.toBeNull();

    const visibleFactionNote = await gmClient.from("faction_gm_notes").select("body_markdown").eq("faction_id", factionId).single();
    expect(visibleFactionNote.error).toBeNull();
    expect(visibleFactionNote.data?.body_markdown).toContain("compromised");

    const invalidNpcId = "00000000-0000-4000-8000-000000009999";
    const failedAtomicCreate = await gmClient.rpc("create_faction_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "RLS Atomic Rollback Faction" },
      p_details: { gmNotesMarkdown: "This must roll back." },
      p_member_npc_ids: [firstNpc.data?.id, invalidNpcId],
    });
    expect(failedAtomicCreate.error).not.toBeNull();

    const rolledBackFaction = await gmClient.from("factions").select("id").eq("campaign_id", campaignId).eq("name", "RLS Atomic Rollback Faction");
    expect(rolledBackFaction.error).toBeNull();
    expect(rolledBackFaction.data).toEqual([]);

    const secondaryCampaign = await gmClient.rpc("create_campaign", {
      campaign_name: "RLS Faction Boundary Campaign",
      campaign_description: "Used to verify faction campaign boundaries.",
    });
    expect(secondaryCampaign.error).toBeNull();
    expect(secondaryCampaign.data).toBeTruthy();
    secondaryCampaignId = secondaryCampaign.data as string;

    const foreignNpc = await gmClient.from("npcs").insert({
      campaign_id: secondaryCampaignId,
      author_id: gmUser.id,
      name: "Foreign Faction Contact",
    }).select("id").single();
    expect(foreignNpc.error).toBeNull();

    const rejectedForeignRoster = await gmClient.rpc("update_faction_with_details", {
      p_campaign_id: campaignId,
      p_faction_id: factionId,
      p_public: {},
      p_details: {},
      p_member_npc_ids: [foreignNpc.data?.id],
    });
    expect(rejectedForeignRoster.error).not.toBeNull();

    const unchangedRoster = await gmClient.from("npcs").select("id, faction_id").in("id", [firstNpc.data?.id, secondNpc.data?.id]);
    expect(unchangedRoster.error).toBeNull();
    expect(unchangedRoster.data?.every((npc) => npc.faction_id === factionId)).toBe(true);

    const transferFaction = await gmClient.rpc("create_faction_with_details", {
      p_campaign_id: campaignId,
      p_public: { name: "RLS Faction Two" },
      p_details: {},
      p_member_npc_ids: [],
    });
    expect(transferFaction.error).toBeNull();
    expect(transferFaction.data).toBeTruthy();

    const transferFactionId = transferFaction.data as string;
    const transferred = await gmClient.rpc("update_faction_with_details", {
      p_campaign_id: campaignId,
      p_faction_id: transferFactionId,
      p_public: {},
      p_details: {},
      p_member_npc_ids: [firstNpc.data?.id],
    });
    expect(transferred.error).toBeNull();

    const afterTransfer = await gmClient.from("npcs").select("id, faction_id").in("id", [firstNpc.data?.id, secondNpc.data?.id]);
    expect(afterTransfer.error).toBeNull();
    expect(afterTransfer.data).toEqual(expect.arrayContaining([
      { id: firstNpc.data?.id, faction_id: transferFactionId },
      { id: secondNpc.data?.id, faction_id: factionId },
    ]));

    const removed = await gmClient.rpc("update_faction_with_details", {
      p_campaign_id: campaignId,
      p_faction_id: transferFactionId,
      p_public: {},
      p_details: {},
      p_member_npc_ids: [],
    });
    expect(removed.error).toBeNull();
    const afterRemoval = await gmClient.from("npcs").select("faction_id").eq("id", firstNpc.data?.id).single();
    expect(afterRemoval.error).toBeNull();
    expect(afterRemoval.data?.faction_id).toBeNull();

    const reassignedBeforeDelete = await gmClient.rpc("update_faction_with_details", {
      p_campaign_id: campaignId,
      p_faction_id: transferFactionId,
      p_public: {},
      p_details: {},
      p_member_npc_ids: [firstNpc.data?.id],
    });
    expect(reassignedBeforeDelete.error).toBeNull();

    const deletedFaction = await gmClient.from("factions").delete().eq("id", transferFactionId).select("id").single();
    expect(deletedFaction.error).toBeNull();
    const unlinkedAfterDelete = await gmClient.from("npcs").select("faction_id").eq("id", firstNpc.data?.id).single();
    expect(unlinkedAfterDelete.error).toBeNull();
    expect(unlinkedAfterDelete.data?.faction_id).toBeNull();
  });

  it("enforces authenticated campaign-art ownership in Storage", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    const blockedPath = `${campaignId}/${gmUser?.id}/player-upload-should-be-blocked.png`;
    const ownedPath = `${campaignId}/${playerId}/player-upload.png`;
    const enemyPath = `${campaignId}/${playerId}/enemy-player-upload.png`;
    const image = new Blob(["local storage test"], { type: "image/png" });

    const blockedUpload = await playerClient.storage.from("campaign-art").upload(blockedPath, image, {
      contentType: "image/png",
      upsert: false,
    });
    expect(blockedUpload.error).not.toBeNull();

    const blockedEnemyUpload = await playerClient.storage.from("campaign-art").upload(enemyPath, image, {
      contentType: "image/png",
      upsert: false,
    });
    expect(blockedEnemyUpload.error).not.toBeNull();

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

  it("keeps hidden enemy art private by exact reference and limits temporary AI art to its requesting GM", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    if (!gmUser) throw new Error("The local RLS GM session has no user.");

    const hiddenPath = `${campaignId}/${gmUser.id}/custom-hidden-art.png`;
    const temporaryPath = `${campaignId}/${gmUser.id}/image-local-rls-temporary.png`;
    const image = new Blob(["private enemy art"], { type: "image/png" });
    let enemyId: string | null = null;
    let runId: string | null = null;

    try {
      const hiddenUpload = await gmClient.storage.from("campaign-art").upload(hiddenPath, image, {
        contentType: "image/png",
        upsert: false,
      });
      expect(hiddenUpload.error).toBeNull();

      const created = await gmClient.rpc("create_enemy_with_details", {
        p_campaign_id: campaignId,
        p_public: {
          name: "Exact Reference Hidden Enemy",
          playerDescription: "A hidden enemy with private artwork.",
          isRevealed: false,
          artPath: hiddenPath,
        },
        p_details: {
          level: 4,
          size: "medium",
          rarity: "common",
          traits: ["aberration"],
          family: null,
          statBlock: { schemaVersion: 1 },
          gmNotesMarkdown: "Keep the custom filename private.",
          origin: "manual",
          artSubject: null,
          artPrompt: null,
          artProvider: null,
          sourceSnapshot: null,
        },
      });
      expect(created.error).toBeNull();
      expect(created.data).toBeTruthy();

      enemyId = created.data;

      const hiddenDownload = await playerClient.storage.from("campaign-art").download(hiddenPath);
      expect(hiddenDownload.error).not.toBeNull();
      const hiddenSigned = await playerClient.storage.from("campaign-art").createSignedUrl(hiddenPath, 60);
      expect(hiddenSigned.error).not.toBeNull();

      const revealed = await gmClient.from("enemies").update({ is_revealed: true }).eq("id", enemyId).select("id").single();
      expect(revealed.error).toBeNull();

      const visibleDownload = await playerClient.storage.from("campaign-art").download(hiddenPath);
      expect(visibleDownload.error).toBeNull();
      expect(await visibleDownload.data?.text()).toBe("private enemy art");

      const temporaryUpload = await gmClient.storage.from("campaign-art").upload(temporaryPath, image, {
        contentType: "image/png",
        upsert: false,
      });
      expect(temporaryUpload.error).toBeNull();

      const run = await gmClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: gmUser.id,
        kind: "image",
        mode: "create",
        target_kind: "enemy",
        status: "complete",
        image_path: temporaryPath,
        image_media_type: "image/png",
      }).select("id, status_updated_at").single();
      expect(run.error).toBeNull();
      expect(run.data?.id).toBeTruthy();
      expect(run.data?.status_updated_at).toBeTruthy();
      runId = run.data?.id ?? null;

      const temporaryForPlayer = await playerClient.storage.from("campaign-art").download(temporaryPath);
      expect(temporaryForPlayer.error).not.toBeNull();
      const temporaryForGm = await gmClient.storage.from("campaign-art").download(temporaryPath);
      expect(temporaryForGm.error).toBeNull();
    } finally {
      if (runId) await gmClient.from("ai_generation_runs").delete().eq("id", runId);
      if (enemyId) await gmClient.from("enemies").delete().eq("id", enemyId);
      await gmClient.storage.from("campaign-art").remove([hiddenPath, temporaryPath]);
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

  it("scopes character portrait AI runs to GMs and the saved character owner", async () => {
    const gmUser = (await gmClient.auth.getUser()).data.user;
    if (!gmUser) throw new Error("The local RLS GM session has no user.");

    const membership = await playerClient
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", playerId)
      .maybeSingle();
    expect(membership.error).toBeNull();

    if (!membership.data) {
      const token = `portrait-${randomUUID()}-local-rls-token`;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const link = await gmClient.from("campaign_join_links").insert({
        campaign_id: campaignId,
        created_by: gmUser.id,
        token_hash: tokenHash,
        max_uses: 1,
      });
      expect(link.error).toBeNull();

      const redeemed = await playerClient.rpc("redeem_campaign_join_link", { join_token_hash: tokenHash });
      expect(redeemed.error).toBeNull();
    }

    let ownerCharacterId: string | null = null;
    let gmCharacterId: string | null = null;
    let foreignCampaignId: string | null = null;
    let foreignCharacterId: string | null = null;
    const runIds: string[] = [];
    const runBase = {
      kind: "image",
      mode: "create",
      model: "test/image-model",
      prompt_hash: "a".repeat(64),
      purpose: "entity-art",
      target_kind: "character",
      aspect_ratio: "1:1",
      size: "1024x1024",
      image_subject: "A saved character portrait.",
      status: "pending",
    };

    try {
      const ownerCharacter = await playerClient.from("characters").insert({
        campaign_id: campaignId,
        owner_id: playerId,
        name: "Portrait Owner Character",
      }).select("id").single();
      expect(ownerCharacter.error).toBeNull();
      ownerCharacterId = ownerCharacter.data?.id ?? null;
      if (!ownerCharacterId) throw new Error("The portrait owner character was not created.");

      const ownerRun = await gmClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: gmUser.id,
        target_character_id: ownerCharacterId,
        ...runBase,
      }).select("id, requested_by, target_character_id").single();
      expect(ownerRun.error).toBeNull();
      const ownerRunId = ownerRun.data?.id;
      if (!ownerRunId) throw new Error("The GM-created portrait run was not created.");
      runIds.push(ownerRunId);

      const ownerRead = await playerClient
        .from("ai_generation_runs")
        .select("id, requested_by, target_character_id")
        .eq("id", ownerRunId)
        .single();
      expect(ownerRead.error).toBeNull();
      expect(ownerRead.data).toMatchObject({ id: ownerRunId, requested_by: gmUser.id, target_character_id: ownerCharacterId });

      const forgedRequester = await playerClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: gmUser.id,
        target_character_id: ownerCharacterId,
        ...runBase,
      });
      expect(forgedRequester.error).not.toBeNull();

      const disabledPlayerRun = await playerClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: playerId,
        target_character_id: ownerCharacterId,
        ...runBase,
      });
      expect(disabledPlayerRun.error).not.toBeNull();

      const gmCharacter = await gmClient.from("characters").insert({
        campaign_id: campaignId,
        owner_id: gmUser.id,
        name: "GM Portrait Character",
      }).select("id").single();
      expect(gmCharacter.error).toBeNull();
      gmCharacterId = gmCharacter.data?.id ?? null;
      if (!gmCharacterId) throw new Error("The GM portrait character was not created.");

      const gmTargetRun = await gmClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: gmUser.id,
        target_character_id: gmCharacterId,
        ...runBase,
      }).select("id").single();
      expect(gmTargetRun.error).toBeNull();
      const gmTargetRunId = gmTargetRun.data?.id;
      if (!gmTargetRunId) throw new Error("The GM-targeted portrait run was not created.");
      runIds.push(gmTargetRunId);

      const hiddenFromOtherPlayer = await playerClient
        .from("ai_generation_runs")
        .select("id")
        .eq("id", gmTargetRunId);
      expect(hiddenFromOtherPlayer.error).toBeNull();
      expect(hiddenFromOtherPlayer.data).toEqual([]);

      const blockedUpdate = await playerClient
        .from("ai_generation_runs")
        .update({ status: "failed" })
        .eq("id", ownerRunId)
        .select("id");
      expect(blockedUpdate.error).toBeNull();
      expect(blockedUpdate.data).toEqual([]);

      const stylePreviewTarget = await gmClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: gmUser.id,
        target_character_id: ownerCharacterId,
        ...runBase,
        purpose: "style-preview",
      });
      expect(stylePreviewTarget.error).not.toBeNull();

      const foreignCampaign = await gmClient.rpc("create_campaign", {
        campaign_name: `RLS Portrait Boundary ${Date.now()}`,
        campaign_description: "Used to verify portrait target boundaries.",
      });
      expect(foreignCampaign.error).toBeNull();
      foreignCampaignId = foreignCampaign.data as string;

      const foreignCharacter = await gmClient.from("characters").insert({
        campaign_id: foreignCampaignId,
        owner_id: gmUser.id,
        name: "Foreign Portrait Character",
      }).select("id").single();
      expect(foreignCharacter.error).toBeNull();
      foreignCharacterId = foreignCharacter.data?.id ?? null;
      if (!foreignCharacterId) throw new Error("The foreign portrait character was not created.");

      const crossCampaignTarget = await gmClient.from("ai_generation_runs").insert({
        campaign_id: campaignId,
        requested_by: gmUser.id,
        target_character_id: foreignCharacterId,
        ...runBase,
      });
      expect(crossCampaignTarget.error).not.toBeNull();

      const deletedOwner = await playerClient
        .from("characters")
        .delete()
        .eq("id", ownerCharacterId)
        .eq("campaign_id", campaignId)
        .select("id")
        .single();
      expect(deletedOwner.error).toBeNull();

      const hiddenAfterDelete = await playerClient
        .from("ai_generation_runs")
        .select("id")
        .eq("id", ownerRunId);
      expect(hiddenAfterDelete.error).toBeNull();
      expect(hiddenAfterDelete.data).toEqual([]);
    } finally {
      if (runIds.length) await gmClient.from("ai_generation_runs").delete().in("id", runIds);
      if (ownerCharacterId) await gmClient.from("characters").delete().eq("id", ownerCharacterId);
      if (gmCharacterId) await gmClient.from("characters").delete().eq("id", gmCharacterId);
      if (foreignCharacterId) await gmClient.from("characters").delete().eq("id", foreignCharacterId);
      if (foreignCampaignId) await gmClient.from("campaigns").delete().eq("id", foreignCampaignId);
    }
  });
});