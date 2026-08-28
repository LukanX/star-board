export const imageJobPendingTimeoutMs = 4 * 60 * 1000;
export const imageJobProviderTimeoutMs = 12 * 60 * 1000;
export const imageJobRunningTimeoutMs = 14 * 60 * 1000;
export const imageJobClientDeadlineMs = 15 * 60 * 1000;
export const imageGenerationRequestTimeoutMs = 3 * 60 * 1000;
export const imageJobStatusRequestTimeoutMs = 10 * 1000;
export const imageJobInitialPollDelayMs = 750;
export const imageJobPollIntervalMs = 2500;
export const imageJobMaxTransientFailures = 3;

export type ImageJobInProgressStatus = "pending" | "running";

export function getImageJobStaleMessage(
  status: ImageJobInProgressStatus,
  statusUpdatedAt: string | null | undefined,
  now = Date.now(),
) {
  const updatedAt = Date.parse(statusUpdatedAt ?? "");
  if (!Number.isFinite(updatedAt) || updatedAt > now) return null;

  const timeout = status === "pending" ? imageJobPendingTimeoutMs : imageJobRunningTimeoutMs;
  if (now - updatedAt < timeout) return null;

  return status === "pending"
    ? "The image background worker did not start. Check the Netlify function deployment and try again."
    : "Image generation exceeded the worker time limit. Try again shortly.";
}
