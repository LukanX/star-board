import { describe, expect, it, vi } from "vitest";
import { waitForImageBackgroundJob, ImageJobCancelledError, type ImageBackgroundJob } from "@/lib/ai/image-job-polling";

const job: ImageBackgroundJob = {
  generationRunId: "00000000-0000-4000-8000-000000000003",
  status: "pending",
  targetKind: "npc",
  mode: "create",
  subject: "A masked station broker",
  aspectRatio: "1:1",
  size: "1024x1024",
  prompt: "A masked station broker in a neon port",
  model: "openai/gpt-image-1",
  createdAt: "2026-08-27T12:00:00.000Z",
  statusUpdatedAt: "2026-08-27T12:00:00.000Z",
};

const waitImmediately = vi.fn().mockResolvedValue(undefined);
const freshNow = () => Date.parse(job.statusUpdatedAt!) + 1000;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("image background polling", () => {
  it("resolves a complete image draft", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      job: {
        status: "complete",
        model: job.model,
        createdAt: "2026-08-27T12:01:00.000Z",
        temporaryPath: "campaign/user/image-run.png",
        image: { base64: null, url: "https://storage.example/image.png", mediaType: "image/png" },
      },
    }));

    await expect(waitForImageBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: freshNow })).resolves.toMatchObject({
      generationRunId: job.generationRunId,
      image: { url: "https://storage.example/image.png" },
    });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining(job.generationRunId), expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("stops on an explicit failed job", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ job: { status: "failed" }, error: "Provider unavailable" }));

    await expect(waitForImageBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: freshNow })).rejects.toThrow("Provider unavailable");
  });

  it("allows three transient failures before stopping", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(response({ job: { status: "pending", statusUpdatedAt: job.statusUpdatedAt } }, 503))
      .mockResolvedValueOnce(response({ job: { status: "pending", statusUpdatedAt: job.statusUpdatedAt } }, 503));

    await expect(waitForImageBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: freshNow })).rejects.toThrow("status could not be reached");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects a stale pending job before polling", async () => {
    const fetchImpl = vi.fn();
    const now = Date.parse(job.statusUpdatedAt!) + 4 * 60 * 1000;

    await expect(waitForImageBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: () => now })).rejects.toThrow("background worker did not start");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("cancels while waiting without treating cancellation as a generation error", async () => {
    const controller = new AbortController();
    const wait = vi.fn((_milliseconds: number, signal?: AbortSignal) => {
      controller.abort();
      return signal?.aborted ? Promise.reject(new ImageJobCancelledError()) : Promise.resolve();
    });

    await expect(waitForImageBackgroundJob(job, { signal: controller.signal, wait, now: freshNow })).rejects.toBeInstanceOf(ImageJobCancelledError);
  });
});
