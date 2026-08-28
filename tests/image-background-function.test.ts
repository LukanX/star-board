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
}));

vi.mock("@/lib/ai/client", () => ({ generateImage: mocks.generateImage }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/supabase/service", () => ({ getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient }));
vi.mock("@/lib/ai/errors", () => ({
  getAiProviderFailure: mocks.getAiProviderFailure,
  logAiProviderFailure: mocks.logAiProviderFailure,
}));

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
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn()
    .mockReturnValueOnce(claimQuery)
    .mockReturnValueOnce(completionQuery)
    .mockReturnValueOnce(failureQuery);
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
      OPENROUTER_API_KEY: "test-key",
    });
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
    expect(mocks.generateImage).toHaveBeenCalledWith(job.prompt, job.model, {
      aspectRatio: job.aspectRatio,
      size: job.size,
      timeoutMs: imageJobProviderTimeoutMs,
    });
    expect(upload).toHaveBeenCalled();
    expect(completionQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "complete", status_updated_at: expect.any(String) }));
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

  it("does not start a job that was already claimed or missed its pending deadline", async () => {
    const { supabase } = createSupabaseMock({ claim: { data: null } });
    mocks.getSupabaseServiceRoleClient.mockReturnValue(supabase);

    const response = await handler(createRequest());

    expect(response.status).toBe(202);
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(imageJobPendingTimeoutMs).toBe(4 * 60 * 1000);
  });
});
