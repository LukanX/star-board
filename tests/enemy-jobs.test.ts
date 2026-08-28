import { describe, expect, it, vi } from "vitest";
import {
  createEnemyBackgroundSignature,
  dispatchEnemyBackgroundJob,
  parseEnemyBackgroundJob,
  verifyEnemyBackgroundSignature,
} from "@/lib/ai/enemy-jobs";
import {
  enemyJobPendingTimeoutMs,
  enemyJobRunningTimeoutMs,
  getEnemyJobStaleMessage,
} from "@/lib/ai/enemy-job-lifecycle";

const job = {
  generationRunId: "00000000-0000-4000-8000-000000000003",
  prompt: "A complete enemy stat block",
  model: "openai/gpt-4o-mini",
};

describe("enemy background jobs", () => {
  it("accepts an unchanged signed job and rejects a modified payload", () => {
    const signature = createEnemyBackgroundSignature(job, "worker-secret");

    expect(verifyEnemyBackgroundSignature(job, signature, "worker-secret")).toBe(true);
    expect(verifyEnemyBackgroundSignature({ ...job, model: "other/model" }, signature, "worker-secret")).toBe(false);
    expect(verifyEnemyBackgroundSignature(job, null, "worker-secret")).toBe(false);
  });

  it("validates the worker payload before dispatch", () => {
    expect(parseEnemyBackgroundJob(job).success).toBe(true);
    expect(parseEnemyBackgroundJob({ ...job, prompt: "" }).success).toBe(false);
  });

  it("dispatches to the Netlify background endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await dispatchEnemyBackgroundJob("https://star-board.netlify.app/api/ai/enemy", job, "worker-secret");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(url.toString()).toBe("https://star-board.netlify.app/.netlify/functions/generate-enemy-background");
    expect(options.method).toBe("POST");
    expect(headers["X-Star-Board-Enemy-Signature"]).toBe(createEnemyBackgroundSignature(job, "worker-secret"));
    expect(options.body).toBe(JSON.stringify(job));
  });

  it("classifies stale pending and running jobs", () => {
    const statusUpdatedAt = "2026-08-27T12:00:00.000Z";
    const statusUpdatedAtMs = Date.parse(statusUpdatedAt);

    expect(getEnemyJobStaleMessage("pending", statusUpdatedAt, statusUpdatedAtMs + enemyJobPendingTimeoutMs)).toContain("background worker did not start");
    expect(getEnemyJobStaleMessage("running", statusUpdatedAt, statusUpdatedAtMs + enemyJobRunningTimeoutMs)).toContain("worker time limit");
    expect(getEnemyJobStaleMessage("pending", null, statusUpdatedAtMs + enemyJobPendingTimeoutMs * 2)).toBeNull();
  });
});