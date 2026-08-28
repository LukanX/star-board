export const enemyJobPendingTimeoutMs = 4 * 60 * 1000;
export const enemyJobProviderTimeoutMs = 12 * 60 * 1000;
export const enemyJobRunningTimeoutMs = 14 * 60 * 1000;
export const enemyJobClientDeadlineMs = 15 * 60 * 1000;
export const enemyJobStatusRequestTimeoutMs = 10 * 1000;
export const enemyJobInitialPollDelayMs = 750;
export const enemyJobPollIntervalMs = 2500;
export const enemyJobMaxTransientFailures = 3;

export type EnemyJobInProgressStatus = "pending" | "running";

export function getEnemyJobStaleMessage(
  status: EnemyJobInProgressStatus,
  statusUpdatedAt: string | null | undefined,
  now = Date.now(),
) {
  const updatedAt = Date.parse(statusUpdatedAt ?? "");
  if (!Number.isFinite(updatedAt) || updatedAt > now) return null;

  const timeout = status === "pending" ? enemyJobPendingTimeoutMs : enemyJobRunningTimeoutMs;
  if (now - updatedAt < timeout) return null;

  return status === "pending"
    ? "The enemy background worker did not start. Check the Netlify function deployment and try again."
    : "Enemy generation exceeded the worker time limit. Try again shortly.";
}