import {
  getImageJobStaleMessage,
  imageJobClientDeadlineMs,
  imageJobInitialPollDelayMs,
  imageJobMaxTransientFailures,
  imageJobPollIntervalMs,
  imageJobStatusRequestTimeoutMs,
} from "@/lib/ai/image-job-lifecycle";
import type { ImageAspectRatio, ImageSize } from "@/lib/ai/image-options";

export type ImageJobTargetKind = "character" | "npc" | "faction" | "job" | "place" | "enemy";

export type ImageDraft = {
  generationRunId: string;
  targetKind: ImageJobTargetKind;
  mode: "create" | "refine";
  subject: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  prompt: string;
  provider: "openrouter";
  model: string;
  image: {
    base64: string | null;
    url: string | null;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
  };
  createdAt: string;
  temporaryPath?: string;
};

export type ImageBackgroundJob = {
  generationRunId: string;
  status: "pending" | "running";
  targetKind: ImageJobTargetKind;
  mode: "create" | "refine";
  subject: string;
  aspectRatio: ImageAspectRatio;
  size: ImageSize;
  prompt: string;
  model: string;
  createdAt: string;
  statusUpdatedAt?: string;
};

export class ImageJobCancelledError extends Error {
  constructor() {
    super("Image generation was cancelled.");
    this.name = "ImageJobCancelledError";
  }
}

type ImageJobStatusResponse = {
  error?: string;
  job?: {
    status: "pending" | "running" | "complete" | "failed";
    statusUpdatedAt?: string;
    model?: string;
    createdAt?: string;
    temporaryPath?: string;
    image?: ImageDraft["image"];
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
      reject(new ImageJobCancelledError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(new ImageJobCancelledError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ImageJobCancelledError();
}

function statusFailureMessage(result: ImageJobStatusResponse) {
  return result.error ?? "The image generation job could not be read.";
}

export async function waitForImageBackgroundJob(
  job: ImageBackgroundJob,
  options: PollOptions = {},
): Promise<ImageDraft> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.wait ?? wait;
  const statusRequestTimeout = options.statusRequestTimeoutMs ?? imageJobStatusRequestTimeoutMs;
  const deadline = now() + imageJobClientDeadlineMs;
  let status = job.status;
  let statusUpdatedAt = job.statusUpdatedAt;
  let transientFailures = 0;
  let firstAttempt = true;

  const initialStaleMessage = getImageJobStaleMessage(status, statusUpdatedAt, now());
  if (initialStaleMessage) throw new Error(initialStaleMessage);

  while (now() < deadline) {
    throwIfCancelled(options.signal);
    await sleep(firstAttempt ? imageJobInitialPollDelayMs : imageJobPollIntervalMs, options.signal);
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
      const response = await fetchImpl(`/api/ai/image/${encodeURIComponent(job.generationRunId)}`, {
        cache: "no-store",
        signal: requestController.signal,
      });
      receivedResponse = true;
      const result = (await response.json().catch(() => ({}))) as ImageJobStatusResponse;

      if (!response.ok) {
        if (response.status >= 500) {
          transientFailures += 1;
          if (transientFailures >= imageJobMaxTransientFailures) {
            throw new Error("The image generation status could not be reached. Try again shortly.");
          }
          continue;
        }
        throw new Error(statusFailureMessage(result));
      }

      transientFailures = 0;

      if (result.job?.status === "failed") {
        throw new Error(result.error ?? "The image draft could not be generated.");
      }

      if (result.job?.status === "complete") {
        if (!result.job.image?.url || !result.job.createdAt) {
          throw new Error("The completed image job has no usable image data.");
        }

        return {
          generationRunId: job.generationRunId,
          targetKind: job.targetKind,
          mode: job.mode,
          subject: job.subject,
          aspectRatio: job.aspectRatio,
          size: job.size,
          prompt: job.prompt,
          provider: "openrouter",
          model: result.job.model ?? job.model,
          image: result.job.image,
          createdAt: result.job.createdAt,
          temporaryPath: result.job.temporaryPath,
        };
      }

      if (result.job?.status !== "pending" && result.job?.status !== "running") {
        throw new Error("The image generation job returned an invalid status.");
      }

      status = result.job.status;
      statusUpdatedAt = result.job.statusUpdatedAt ?? statusUpdatedAt;
      const staleMessage = getImageJobStaleMessage(status, statusUpdatedAt, now());
      if (staleMessage) throw new Error(staleMessage);
    } catch (error: unknown) {
      throwIfCancelled(options.signal);
      if (!receivedResponse || requestTimedOut || requestController.signal.aborted) {
        transientFailures += 1;
        if (transientFailures >= imageJobMaxTransientFailures) {
          throw new Error("The image generation status could not be reached. Try again shortly.");
        }
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  throw new Error("Image generation is taking longer than expected. Check the art studio again shortly.");
}
