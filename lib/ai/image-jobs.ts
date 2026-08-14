import { createHmac, timingSafeEqual } from "node:crypto";
import { imageBackgroundJobSchema, type ImageBackgroundJob } from "@/lib/validation/image";

export const imageBackgroundFunctionName = "generate-image-background";

export function createImageBackgroundSignature(job: ImageBackgroundJob, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify(job)).digest("hex");
}

export function verifyImageBackgroundSignature(job: ImageBackgroundJob, signature: string | null, secret: string) {
  if (!signature) return false;

  const expected = createImageBackgroundSignature(job, secret);
  const received = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");

  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}

export async function dispatchImageBackgroundJob(requestUrl: string, job: ImageBackgroundJob, secret: string) {
  const response = await fetch(new URL(`/.netlify/functions/${imageBackgroundFunctionName}`, requestUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Star-Board-Image-Signature": createImageBackgroundSignature(job, secret),
    },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Image background function returned HTTP ${response.status}.`);
  }
}

export function parseImageBackgroundJob(body: unknown) {
  return imageBackgroundJobSchema.safeParse(body);
}