import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImageBackgroundSignature } from "@/lib/ai/image-jobs";
import {
  imageJobPendingTimeoutMs,
  imageJobProviderTimeoutMs,
} from "@/lib/ai/image-job-lifecycle";

const mocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
  getServerEnv: vi.fn(),
  getSupabaseServiceRoleClient: vi.fn(),
  getAiProviderFailure: vi.fn(),
  logAiProviderFailure: vi.fn(),
  getCampaignCredentialForGeneration: vi.fn(),
  loadCharacterPortraitAccess: vi.fn(),
  loadEditSourceImage: vi.fn(),
  canUseCharacterPortraitAi: vi.fn((access: { role: string; isOwner: boolean }, allowPlayerAi: boolean) => access.role === "gm" || (access.isOwner && allowPlayerAi)),
}));

vi.mock("@/lib/ai/client", () => ({ generateImage: mocks.generateImage }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/supabase/service", () => ({ getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient }));
vi.mock("@/lib/ai/errors", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai/errors")>(),
  getAiProviderFailure: mocks.getAiProviderFailure,
  logAiProviderFailure: mocks.logAiProviderFailure,
}));
vi.mock("@/lib/ai/campaign-credentials", () => ({ getCampaignCredentialForGeneration: mocks.getCampaignCredentialForGeneration }));
vi.mock("@/lib/ai/image-edit", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai/image-edit")>(),
  loadEditSourceImage: mocks.loadEditSourceImage,
}));
vi.mock("@/lib/ai/character-portrait-access", () => ({ loadCharacterPortraitAccess: mocks.loadCharacterPortraitAccess, canUseCharacterPortraitAi: mocks.canUseCharacterPortraitAi }));

import handler, { config } from "@/netlify/functions/generate-image-background";

const secret = "worker-secret";
const job = {
  generationRunId: "00000000-0000-4000-8000-000000000003",
  prompt: "A masked station broker",
  model: "openai/gpt-image-1",
  aspectRatio: "16:9" as const,
  size: "3840x2160" as const,
};

function createQuery(result: { data?: unknown; error?: Error | null }) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

function createSupabaseMock(options: {
  claim?: { data?: unknown; error?: Error | null };
  completion?: { data?: unknown; error?: Error | null };
  failure?: { data?: unknown; error?: Error | null };
} = {}) {
  const claimQuery = createQuery(options.claim ?? {
    data: {
      id: job.generationRunId,
      campaign_id: "00000000-0000-4000-8000-000000000001",
      requested_by: "00000000-0000-4000-8000-000000000002",
    },
  });
  const completionQuery = createQuery(options.completion ?? { data: { id: job.generationRunId } });
  const failureQuery = createQuery(options.failure ?? { data: { id: job.generationRunId } });
  const membershipQuery = createQuery({ data: { role: "gm" } });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const runQueries = [claimQuery, completionQuery, failureQuery];
  const from = vi.fn((table: string) => table === "campaign_members" ? membershipQuery : runQueries.shift() ?? failureQuery);
  const supabase = {
    from,
    storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
  };

  return { supabase, claimQuery, completionQuery, failureQuery, upload, remove };
}

function createRequest() {
  return new Request("https://star-board.test/.netlify/functions/generate-image-background", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Star-Board-Image-Signature": createImageBackgroundSignature(job, secret),
    },
    body: JSON.stringify(job),
  });
}

describe("generate-image-background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      SUPABASE_SECRET_KEY: secret,
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example",
    });
    mocks.getCampaignCredentialForGeneration.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: true } });
    mocks.getAiProviderFailure.mockImplementation((error: unknown, fallback: string) => ({
      message: error instanceof Error ? error.message : fallback,
    }));
    mocks.generateImage.mockResolvedValue({
      image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" },
      model: job.model,
      generationId: "image-generation-1",
    });
  });

  it("declares an explicit Netlify background function", () => {
    expect(config).toEqual({ background: true });
  });

  it("rejects malformed jobs before accessing provider storage", async () => {
    const response = await handler(new Request("https://star-board.test/.netlify/functions/generate-image-background", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));

    expect(response.status).toBe(400);
    expect(mocks.getServerEnv).not.toHaveBeenCalled();
    expect(mocks.getSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects a job with an invalid dispatch signature", async () => {
    const request = createRequest();
    request.headers.set("X-Star-Board-Image-Signature", "0".repeat(64));

    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(mocks.getSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns a bounded configuration failure when environment parsing fails", async () => {
    mocks.getServerEnv.mockImplementation(() => {
      throw new Error("Invalid environment configuration.");
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Image background storage is not configured." });
    expect(mocks.getSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("claims, generates, stores, and completes a job", async () => {
    const { supabase, claimQuery, completionQuery, upload } = createSupabaseMock();
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(claimQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "running", status_updated_at: expect.any(String) }));
    expect(claimQuery.gte).toHaveBeenCalledWith("status_updated_at", expect.any(String));
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", job.prompt, job.model, {
      aspectRatio: job.aspectRatio,
      size: job.size,
      timeoutMs: imageJobProviderTimeoutMs,
    });
    expect(upload).toHaveBeenCalled();
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", status_updated_at: expect.any(String) }));
  });

  it("sends a native resolution to the worker provider without a fixed pixel size", async () => {
    const { supabase } = createSupabaseMock();
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    const nativeJob = { ...job, size: undefined, resolution: "4K" as const, supportedParameters: ["resolution"] };
    const response = await handler(new Request("https://star-board.test/.netlify/functions/generate-image-background", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Star-Board-Image-Signature": createImageBackgroundSignature(nativeJob, secret) },
      body: JSON.stringify(nativeJob),
    }));
    expect(response.status).toBe(202);
    expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", job.prompt, job.model, expect.objectContaining({ resolution: "4K" }));
    expect(mocks.generateImage.mock.calls[0][3]).not.toHaveProperty("size");
  });

  describe("image edits", () => {
    const campaignId = "00000000-0000-4000-8000-000000000001";
    const userId = "00000000-0000-4000-8000-000000000002";
    const editJob = {
      ...job,
      editSource: { path: `${campaignId}/${userId}/npc-source.png` },
      referenceProviders: ["openai"],
    };
    const signedRequest = (value: typeof editJob) => new Request("https://star-board.test/.netlify/functions/generate-image-background", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Star-Board-Image-Signature": createImageBackgroundSignature(value, secret) },
      body: JSON.stringify(value),
    });

    it("loads the source image and sends it as the only provider reference", async () => {
      const { supabase } = createSupabaseMock({ claim: { data: { id: job.generationRunId, campaign_id: campaignId, requested_by: userId, operation: "edit" } } });
      mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
      mocks.loadEditSourceImage.mockResolvedValue([{ dataUrl: "data:image/png;base64,c291cmNl" }]);

      expect((await handler(signedRequest(editJob))).status).toBe(202);

      expect(mocks.loadEditSourceImage).toHaveBeenCalledWith(supabase, campaignId, editJob.editSource.path);
      expect(mocks.generateImage).toHaveBeenCalledWith("campaign-key", job.prompt, job.model, expect.objectContaining({
        imageReferences: [{ dataUrl: "data:image/png;base64,c291cmNl" }], referenceProviders: ["openai"],
      }));
    });

    it("refuses an edit source on a run that was not recorded as an edit", async () => {
      const { supabase, completionQuery } = createSupabaseMock({ claim: { data: { id: job.generationRunId, campaign_id: campaignId, requested_by: userId, operation: "generate" } } });
      mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);

      expect((await handler(signedRequest(editJob))).status).toBe(202);

      expect(mocks.loadEditSourceImage).not.toHaveBeenCalled();
      expect(mocks.generateImage).not.toHaveBeenCalled();
      expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    });

    it("rejects an unsigned edit source", async () => {
      const request = signedRequest(editJob);
      request.headers.set("X-Star-Board-Image-Signature", createImageBackgroundSignature(job, secret));
      expect((await handler(request)).status).toBe(401);
    });
  });

  it("marks provider failures as terminal failures", async () => {
    const { supabase, completionQuery } = createSupabaseMock();
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    mocks.generateImage.mockRejectedValue(new Error("OpenRouter timed out"));

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", status_updated_at: expect.any(String), error_message: "OpenRouter timed out" }));
    expect(mocks.logAiProviderFailure).toHaveBeenCalled();
  });

  it("records an uncertain, potentially billed image instead of a definite provider failure", async () => {
    const { supabase, completionQuery } = createSupabaseMock();
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    mocks.generateImage.mockRejectedValue(new Error("The socket closed after the provider accepted the request"));
    mocks.getAiProviderFailure.mockReturnValueOnce({ message: "fetch failed", outcomeUnknown: true });

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      error_message: expect.stringContaining("may have been billed"),
    }));
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
  });

  it("does not start a job that was already claimed or missed its pending deadline", async () => {
    const { supabase } = createSupabaseMock({ claim: { data: null } });
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(imageJobPendingTimeoutMs).toBe(4 * 60 * 1000);
  });

  it("fails a character job whose saved target has disappeared", async () => {
    const { supabase, completionQuery } = createSupabaseMock({
      claim: {
        data: {
          id: job.generationRunId,
          campaign_id: "00000000-0000-4000-8000-000000000001",
          requested_by: "00000000-0000-4000-8000-000000000002",
          purpose: "entity-art",
          kind: "image",
          target_kind: "character",
          target_character_id: "00000000-0000-4000-8000-000000000004",
        },
      },
    });
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    mocks.loadCharacterPortraitAccess.mockResolvedValue({ failure: "not-found" });

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error_message: "The saved character for this image job is no longer available." }));
  });

  it("checks Player AI again before a queued owner portrait reaches the provider", async () => {
    const characterId = "00000000-0000-4000-8000-000000000004";
    const { supabase, completionQuery } = createSupabaseMock({
      claim: {
        data: {
          id: job.generationRunId,
          campaign_id: "00000000-0000-4000-8000-000000000001",
          requested_by: "00000000-0000-4000-8000-000000000002",
          purpose: "entity-art",
          kind: "image",
          target_kind: "character",
          target_character_id: characterId,
        },
      },
    });
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    mocks.loadCharacterPortraitAccess.mockResolvedValue({ access: { character: { id: characterId }, role: "player", isOwner: true } });
    mocks.getCampaignCredentialForGeneration.mockResolvedValue({ apiKey: "campaign-key", status: { allowPlayerAi: false } });

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error_message: "Player AI assistance is no longer enabled for this campaign." }));
  });

  it("does not generate a Studio image after the requesting GM loses access", async () => {
    const { supabase, claimQuery, completionQuery } = createSupabaseMock({
      claim: { data: { id: job.generationRunId, campaign_id: "00000000-0000-4000-8000-000000000001", requested_by: "00000000-0000-4000-8000-000000000002", purpose: "studio-art", kind: "image", target_kind: "scene" } },
    });
    const membership = createQuery({ data: { role: "player" } });
    supabase.from.mockReset().mockImplementation((table: string) => {
      if (table === "campaign_members") return membership;
      return supabase.from.mock.calls.filter(([name]) => name === "ai_generation_runs").length === 1 ? claimQuery : completionQuery;
    });
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);
    const response = await handler(createRequest());
    expect(response.status).toBe(202);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.getCampaignCredentialForGeneration).not.toHaveBeenCalled();
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", error_message: "GM access for this Studio job is no longer available." }));
  });
});
