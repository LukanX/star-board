import { describe, expect, it, vi } from "vitest";
import { createImageBackgroundSignature, dispatchImageBackgroundJob, parseImageBackgroundJob, verifyImageBackgroundSignature } from "@/lib/ai/image-jobs";

const job = {
  generationRunId: "00000000-0000-4000-8000-000000000003",
  prompt: "A masked station broker",
  model: "openai/gpt-image-1",
  aspectRatio: "16:9" as const,
  size: "2048x1152" as const,
};

describe("image background jobs", () => {
  it("accepts an unchanged signed job and rejects a modified payload", () => {
    const signature = createImageBackgroundSignature(job, "worker-secret");

    expect(verifyImageBackgroundSignature(job, signature, "worker-secret")).toBe(true);
    expect(verifyImageBackgroundSignature({ ...job, model: "other/model" }, signature, "worker-secret")).toBe(false);
    expect(verifyImageBackgroundSignature(job, null, "worker-secret")).toBe(false);
  });

  it("validates the worker payload before dispatch", () => {
    expect(parseImageBackgroundJob(job).success).toBe(true);
    expect(parseImageBackgroundJob({ ...job, size: "1024x1024" }).success).toBe(false);
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
});