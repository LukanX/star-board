import { z } from "zod";
import { studioCompositionSchema, studioManifestSchema } from "@/lib/validation/studio";
import { imageOperations } from "@/lib/validation/image";
import { defaultImageAspectRatio, imageResolutionValues } from "@/lib/ai/image-options";

const formSchema = z.object({
  kind: z.enum(["scene", "battlemap"]),
  direction: z.string().max(1200),
  composition: studioCompositionSchema,
  names: z.record(z.string(), z.string().max(160)),
  styleId: z.string().default(""),
  directionAssisted: z.boolean().optional(),
});
const inputsSchema = z.object({
  form: formSchema,
  model: z.string().max(160).nullable(),
  textModel: z.string().max(160).nullable(),
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "16:9"]),
  resolution: z.enum(imageResolutionValues).optional(),
});
export const studioJobSchema = z.object({
  generationRunId: z.string().uuid(),
  status: z.enum(["pending", "running"]),
  targetKind: z.enum(["scene", "battlemap"]),
  purpose: z.literal("studio-art"),
  mode: z.enum(["create", "refine"]),
  operation: z.enum(imageOperations).optional(),
  parentRunId: z.string().uuid().optional(),
  subject: z.string().max(1200),
  prompt: z.string().max(3000),
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "16:9"]),
  resolution: z.enum(imageResolutionValues).optional(),
  model: z.string().max(160),
  createdAt: z.string(),
  studioManifest: studioManifestSchema,
});
const checkpointSchema = z.object({ version: z.literal(2), savedAt: z.string(), inputs: inputsSchema });
const recoverySchema = z.object({ jobs: z.array(studioJobSchema).max(20), outcomeUnknown: z.boolean() });

export type StudioForm = z.infer<typeof formSchema>;
export type StudioInputs = z.infer<typeof inputsSchema>;
export type StudioCheckpoint = z.infer<typeof checkpointSchema>;
export type StudioJob = z.infer<typeof studioJobSchema>;
export type StudioRecovery = z.infer<typeof recoverySchema>;
export type StudioIdentity = { campaignId: string; userId: string };
export const studioSessionPrefixes = [
  "star-board:campaign-studio:v1:",
  "star-board:campaign-studio:checkpoint:v2:",
  "star-board:campaign-studio:jobs:v2:",
] as const;
let storageEpoch = 0;

export function studioStorageEpoch() { return storageEpoch; }

export function freshStudioInputs(kind: StudioForm["kind"] = "scene"): StudioInputs {
  return {
    form: { kind, direction: "", composition: { subjects: [], grid: "gridless", useCampaignStyle: kind === "scene" }, names: {}, styleId: "" },
    model: null, textModel: null, aspectRatio: defaultImageAspectRatio,
  };
}

export function studioStorageKeys({ campaignId, userId }: StudioIdentity) {
  const scope = `${campaignId}:${userId}`;
  return { legacy: `${studioSessionPrefixes[0]}${scope}`, checkpoint: `${studioSessionPrefixes[1]}${scope}`, recovery: `${studioSessionPrefixes[2]}${scope}` };
}

export function readStudioCheckpoint(identity: StudioIdentity, storage: Storage): StudioCheckpoint | null {
  const value = storage.getItem(studioStorageKeys(identity).checkpoint);
  return value === null ? null : checkpointSchema.parse(JSON.parse(value));
}

export function saveStudioCheckpoint(identity: StudioIdentity, inputs: StudioInputs, storage: Storage): StudioCheckpoint {
  const checkpoint = checkpointSchema.parse({ version: 2, savedAt: new Date().toISOString(), inputs });
  storage.setItem(studioStorageKeys(identity).checkpoint, JSON.stringify(checkpoint));
  return checkpoint;
}

export function deleteStudioCheckpoint(identity: StudioIdentity, storage: Storage) {
  storage.removeItem(studioStorageKeys(identity).checkpoint);
}

export function writeStudioRecovery(identity: StudioIdentity, recovery: StudioRecovery, storage: Storage) {
  const value = recoverySchema.parse(recovery);
  storage.setItem(studioStorageKeys(identity).recovery, JSON.stringify(value));
}

export function forgetStoredStudioRecovery(identity: StudioIdentity, storage: Storage) {
  const keys = studioStorageKeys(identity);
  storage.removeItem(keys.legacy);
  storage.removeItem(keys.recovery);
}

export function readStudioRecovery(identity: StudioIdentity, storage: Storage): StudioRecovery {
  const keys = studioStorageKeys(identity);
  const stored = storage.getItem(keys.recovery);
  const recovery = stored === null ? { jobs: [], outcomeUnknown: false } : recoverySchema.parse(JSON.parse(stored));
  const legacy = storage.getItem(keys.legacy);
  if (legacy !== null) {
    // Migrate only immutable request metadata, never the abandoned working form.
    const previous = z.object({ jobs: z.array(studioJobSchema).max(20) }).parse(JSON.parse(legacy));
    const jobs = [...new Map([...previous.jobs, ...recovery.jobs].map((job) => [job.generationRunId, job])).values()];
    const migrated = recoverySchema.parse({ ...recovery, jobs });
    writeStudioRecovery(identity, migrated, storage);
    storage.removeItem(keys.legacy);
    return migrated;
  }
  return recovery;
}

export function clearCampaignStudioSessions(storage: Storage) {
  // Late request acknowledgements must not recreate a signed-out user's recovery data.
  storageEpoch++;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && studioSessionPrefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
