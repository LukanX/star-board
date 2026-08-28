import { describe, expect, it } from "vitest";
import {
  getImageJobStaleMessage,
  imageJobPendingTimeoutMs,
  imageJobRunningTimeoutMs,
} from "@/lib/ai/image-job-lifecycle";

const statusUpdatedAt = "2026-08-27T12:00:00.000Z";
const statusUpdatedAtMs = Date.parse(statusUpdatedAt);


describe("image job lifecycle policy", () => {
  it("keeps fresh pending and running jobs in progress", () => {
    expect(getImageJobStaleMessage("pending", statusUpdatedAt, statusUpdatedAtMs + imageJobPendingTimeoutMs - 1)).toBeNull();
    expect(getImageJobStaleMessage("running", statusUpdatedAt, statusUpdatedAtMs + imageJobRunningTimeoutMs - 1)).toBeNull();
  });

  it("classifies pending and running jobs after their separate deadlines", () => {
    expect(getImageJobStaleMessage("pending", statusUpdatedAt, statusUpdatedAtMs + imageJobPendingTimeoutMs)).toContain("background worker did not start");
    expect(getImageJobStaleMessage("running", statusUpdatedAt, statusUpdatedAtMs + imageJobRunningTimeoutMs)).toContain("worker time limit");
  });

  it("does not expire jobs without a usable timestamp", () => {
    expect(getImageJobStaleMessage("pending", null, statusUpdatedAtMs + imageJobPendingTimeoutMs * 2)).toBeNull();
    expect(getImageJobStaleMessage("running", "not-a-timestamp", statusUpdatedAtMs + imageJobRunningTimeoutMs * 2)).toBeNull();
  });
});
