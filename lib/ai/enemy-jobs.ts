import { createHmac, timingSafeEqual } from "node:crypto";
import { enemyBackgroundJobSchema, type EnemyBackgroundJob } from "@/lib/validation/enemy";

export const enemyBackgroundFunctionName = "generate-enemy-background";

export function createEnemyBackgroundSignature(job: EnemyBackgroundJob, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify(job)).digest("hex");
}

export function verifyEnemyBackgroundSignature(job: EnemyBackgroundJob, signature: string | null, secret: string) {
  if (!signature) return false;

  const expected = createEnemyBackgroundSignature(job, secret);
  const received = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");

  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}

export async function dispatchEnemyBackgroundJob(requestUrl: string, job: EnemyBackgroundJob, secret: string) {
  const response = await fetch(new URL(`/.netlify/functions/${enemyBackgroundFunctionName}`, requestUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Star-Board-Enemy-Signature": createEnemyBackgroundSignature(job, secret),
    },
    body: JSON.stringify(job),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Enemy background function returned HTTP ${response.status}.`);
  }
}

export function parseEnemyBackgroundJob(body: unknown) {
  return enemyBackgroundJobSchema.safeParse(body);
}