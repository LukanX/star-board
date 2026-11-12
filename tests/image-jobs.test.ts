import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const mocks = vi.hoisted(() => ({ getSupabaseServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient }));
import { createImageBackgroundSignature, dispatchImageBackgroundJob, markImageBackgroundDispatchFailed, parseImageBackgroundJob, verifyImageBackgroundSignature } from "@/lib/ai/image-jobs";
import { librarySource } from "./support/library-reference";

const job = {
  generationRunId: "00000000-0000-4000-8000-000000000003",
  prompt: "A masked station broker",
  model: "openai/gpt-image-1",
  aspectRatio: "16:9" as const,
  size: "3840x2160" as const,
};

describe("image background jobs", () => {
  it("covers reference provenance with the worker signature", () => {
    const references = [librarySource];
    const groundedJob = { ...job, references };
    const signature = createImageBackgroundSignature(groundedJob, "worker-secret");
    expect(verifyImageBackgroundSignature(parseImageBackgroundJob(groundedJob).data!, signature, "worker-secret")).toBe(true);
    expect(verifyImageBackgroundSignature(groundedJob, signature, "worker-secret")).toBe(true);
    expect(verifyImageBackgroundSignature({ ...groundedJob, references: [] }, signature, "worker-secret")).toBe(false);
  });
  it("accepts an unchanged signed job and rejects a modified payload", () => {
    const signature = createImageBackgroundSignature(job, "worker-secret");
    const legacyCanonicalJob = JSON.stringify({
      generationRunId: job.generationRunId,
      prompt: job.prompt,
      model: job.model,
      purpose: "entity-art",
      aspectRatio: job.aspectRatio,
      size: job.size,
    });

    expect(signature).toBe(createHmac("sha256", "worker-secret").update(legacyCanonicalJob).digest("hex"));
    expect(verifyImageBackgroundSignature(job, signature, "worker-secret")).toBe(true);
    expect(verifyImageBackgroundSignature({ ...job, model: "other/model" }, signature, "worker-secret")).toBe(false);
    expect(verifyImageBackgroundSignature(job, null, "worker-secret")).toBe(false);
  });

  it("signs aspect-only resolution options without a pixel size", () => {
    const aspectOnlyJob = {
      generationRunId: job.generationRunId,
      prompt: job.prompt,
      model: "x-ai/grok-imagine-image-2.0",
      aspectRatio: "16:9" as const,
      resolution: "1K" as const,
      supportedParameters: ["aspect_ratio", "resolution"],
    };
    const signature = createImageBackgroundSignature(aspectOnlyJob, "worker-secret");

    expect(parseImageBackgroundJob(aspectOnlyJob).success).toBe(true);
    expect(verifyImageBackgroundSignature(aspectOnlyJob, signature, "worker-secret")).toBe(true);
    expect(verifyImageBackgroundSignature({ ...aspectOnlyJob, resolution: "2K" }, signature, "worker-secret")).toBe(false);
  });

  it("validates the worker payload before dispatch", () => {
    expect(parseImageBackgroundJob(job).success).toBe(true);
    expect(parseImageBackgroundJob({ ...job, size: "1024x1024" }).success).toBe(false);
  });

  it("signs the edit source and requires verified provider routing for it", () => {
    const editJob = { ...job, editSource: { path: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/npc-a.png" }, referenceProviders: ["openai"] };
    const signature = createImageBackgroundSignature(editJob, "worker-secret");

    expect(parseImageBackgroundJob(editJob).success).toBe(true);
    expect(verifyImageBackgroundSignature(editJob, signature, "worker-secret")).toBe(true);
    expect(verifyImageBackgroundSignature({ ...editJob, editSource: { path: "a/b/c.png" } }, signature, "worker-secret")).toBe(false);
    expect(verifyImageBackgroundSignature({ ...editJob, editSource: undefined }, signature, "worker-secret")).toBe(false);
    expect(parseImageBackgroundJob({ ...editJob, referenceProviders: undefined }).success).toBe(false);
    expect(parseImageBackgroundJob({ ...editJob, editSource: { path: "../x" } }).success).toBe(false);
  });

  it("dispatches to the Netlify background endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchImageBackgroundJob("https://star-board.netlify.app/api/ai/image", job, "worker-secret");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(url.toString()).toBe("https://star-board.netlify.app/.netlify/functions/generate-image-background");
    expect(options.method).toBe("POST");
    expect(headers["X-Star-Board-Image-Signature"]).toBe(createImageBackgroundSignature(job, "worker-secret"));
    expect(options.body).toBe(JSON.stringify(job));
  });

  it("persists ambiguous dispatch failures as potentially billed", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), is: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    mocks.getSupabaseServiceRoleClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });

    await markImageBackgroundDispatchFailed({
      campaignId: "00000000-0000-4000-8000-000000000001",
      generationRunId: job.generationRunId,
      requestedBy: "00000000-0000-4000-8000-000000000002",
      targetCharacterId: null,
    });

    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      error_message: "The image request may have been billed; check OpenRouter activity before generating again.",
    }));
  });
});