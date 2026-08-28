import {
  enemyJobClientDeadlineMs,
  enemyJobInitialPollDelayMs,
  enemyJobMaxTransientFailures,
  enemyJobPollIntervalMs,
  enemyJobStatusRequestTimeoutMs,
  getEnemyJobStaleMessage,
} from "@/lib/ai/enemy-job-lifecycle";
import { enemyAiDraftSchema, type EnemyAiDraft } from "@/lib/validation/enemy";

export type EnemyBackgroundJob = {
  generationRunId: string;
  status: "pending" | "running";
  mode: "create" | "refine";
  model: string;
  createdAt: string;
  statusUpdatedAt?: string;
};

export class EnemyJobCancelledError extends Error {
  constructor() {
    super("Enemy generation was cancelled.");
    this.name = "EnemyJobCancelledError";
  }
}

type EnemyJobStatusResponse = {
  error?: string;
  job?: {
    status: "pending" | "running" | "complete" | "failed";
    statusUpdatedAt?: string;
    model?: string | null;
    createdAt?: string;
    draft?: unknown;
  };
};

type PollOptions = {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  statusRequestTimeoutMs?: number;
};

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new EnemyJobCancelledError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(new EnemyJobCancelledError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new EnemyJobCancelledError();
}

function statusFailureMessage(result: EnemyJobStatusResponse) {
  return result.error ?? "The enemy generation job could not be read.";
}

export async function waitForEnemyBackgroundJob(
  job: EnemyBackgroundJob,
  options: PollOptions = {},
): Promise<EnemyAiDraft> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.wait ?? wait;
  const statusRequestTimeout = options.statusRequestTimeoutMs ?? enemyJobStatusRequestTimeoutMs;
  const deadline = now() + enemyJobClientDeadlineMs;
  let status = job.status;
  let statusUpdatedAt = job.statusUpdatedAt;
  let transientFailures = 0;
  let firstAttempt = true;

  const initialStaleMessage = getEnemyJobStaleMessage(status, statusUpdatedAt, now());
  if (initialStaleMessage) throw new Error(initialStaleMessage);

  while (now() < deadline) {
    throwIfCancelled(options.signal);
    await sleep(firstAttempt ? enemyJobInitialPollDelayMs : enemyJobPollIntervalMs, options.signal);
    firstAttempt = false;
    if (now() >= deadline) break;

    const requestController = new AbortController();
    let requestTimedOut = false;
    let receivedResponse = false;
    const timeoutId = setTimeout(() => {
      requestTimedOut = true;
      requestController.abort();
    }, statusRequestTimeout);
    const forwardAbort = () => requestController.abort();
    options.signal?.addEventListener("abort", forwardAbort, { once: true });

    try {
      const response = await fetchImpl(`/api/ai/enemy/${encodeURIComponent(job.generationRunId)}`, {
        cache: "no-store",
        signal: requestController.signal,
      });
      receivedResponse = true;
      const result = (await response.json().catch(() => ({}))) as EnemyJobStatusResponse;

      if (!response.ok) {
        if (response.status >= 500) {
          transientFailures += 1;
          if (transientFailures >= enemyJobMaxTransientFailures) {
            throw new Error("The enemy generation status could not be reached. Try again shortly.");
          }
          continue;
        }
        throw new Error(statusFailureMessage(result));
      }

      transientFailures = 0;

      if (result.job?.status === "failed") {
        throw new Error(result.error ?? "The enemy draft could not be generated.");
      }

      if (result.job?.status === "complete") {
        const draft = enemyAiDraftSchema.safeParse(result.job.draft);
        if (!draft.success) throw new Error("The completed enemy job has no usable draft.");
        return draft.data;
      }

      if (result.job?.status !== "pending" && result.job?.status !== "running") {
        throw new Error("The enemy generation job returned an invalid status.");
      }

      status = result.job.status;
      statusUpdatedAt = result.job.statusUpdatedAt ?? statusUpdatedAt;
      const staleMessage = getEnemyJobStaleMessage(status, statusUpdatedAt, now());
      if (staleMessage) throw new Error(staleMessage);
    } catch (error: unknown) {
      throwIfCancelled(options.signal);
      if (!receivedResponse || requestTimedOut || requestController.signal.aborted) {
        transientFailures += 1;
        if (transientFailures >= enemyJobMaxTransientFailures) {
          throw new Error("The enemy generation status could not be reached. Try again shortly.");
        }
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  throw new Error("Enemy generation is taking longer than expected. Check the enemy editor again shortly.");
}