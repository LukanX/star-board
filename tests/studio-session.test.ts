import { describe, expect, it } from "vitest";
import { clearCampaignStudioSessions, deleteStudioCheckpoint, freshStudioInputs, readStudioCheckpoint, readStudioRecovery, saveStudioCheckpoint, studioJobSchema, studioStorageEpoch, studioStorageKeys, writeStudioRecovery, type StudioJob } from "@/components/ai-studio/studioSession";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const identity = { campaignId: "campaign", userId: "gm" };
const job: StudioJob = {
  generationRunId: "dff51509-f1ca-4ebc-b1bc-b6afbb292a25", status: "pending", targetKind: "scene", purpose: "studio-art", mode: "create",
  subject: "An immutable request", prompt: "Exact provider prompt", aspectRatio: "16:9", model: "test/image", createdAt: "2026-09-24T12:00:00Z",
  studioManifest: { composition: { subjects: [], grid: "gridless", useCampaignStyle: true }, direction: "An immutable request", sources: [], references: [], style: "Ink" },
};

describe("explicit campaign Studio sessions", () => {
  it("creates independent, mode-specific fresh defaults", () => {
    const art = freshStudioInputs();
    art.form.composition.subjects.push({ kind: "place", id: job.generationRunId, useImage: true });
    expect(freshStudioInputs().form.composition.subjects).toEqual([]);
    expect(freshStudioInputs("battlemap").form.composition.useCampaignStyle).toBe(false);
    expect(freshStudioInputs("battlemap").form.composition.grid).toBe("gridless");
  });
  it("saves one scoped input checkpoint without review or transient payloads", () => {
    const storage = new MemoryStorage();
    const inputs = freshStudioInputs();
    inputs.form.direction = "Explicit checkpoint";
    inputs.model = "test/image"; inputs.textModel = "test/text"; inputs.aspectRatio = "16:9";
    const workingState = { ...inputs, image: { url: "secret signed URL" }, error: "old error" };
    saveStudioCheckpoint(identity, workingState, storage);
    expect(readStudioCheckpoint(identity, storage)?.inputs).toEqual(inputs);
    expect(readStudioCheckpoint({ ...identity, userId: "other" }, storage)).toBeNull();
    expect(storage.getItem(studioStorageKeys(identity).checkpoint)).not.toContain("secret signed URL");
    saveStudioCheckpoint(identity, freshStudioInputs("battlemap"), storage);
    expect(storage.length).toBe(1);
    deleteStudioCheckpoint(identity, storage);
    expect(readStudioCheckpoint(identity, storage)).toBeNull();
  });
  it("migrates known legacy jobs but never reads or applies a legacy form", () => {
    const storage = new MemoryStorage();
    storage.setItem(studioStorageKeys(identity).legacy, JSON.stringify({ form: { invalid: "abandoned inputs" }, jobs: [{ ...job, image: { url: "expired" }, temporaryPath: "not persisted" }] }));
    expect(readStudioRecovery(identity, storage)).toEqual({ jobs: [job], outcomeUnknown: false });
    expect(readStudioCheckpoint(identity, storage)).toBeNull();
    expect(storage.getItem(studioStorageKeys(identity).legacy)).toBeNull();
    expect(storage.getItem(studioStorageKeys(identity).recovery)).not.toContain("expired");
  });
  it("preserves unknown-charge warnings separately and enforces the recovery bound", () => {
    const storage = new MemoryStorage();
    writeStudioRecovery(identity, { jobs: [job], outcomeUnknown: true }, storage);
    expect(readStudioRecovery(identity, storage).outcomeUnknown).toBe(true);
    expect(() => writeStudioRecovery(identity, { jobs: Array.from({ length: 21 }, () => job), outcomeUnknown: false }, storage)).toThrow();
  });
  it("preserves native resolution in explicit checkpoints and recoverable jobs", () => {
    const storage = new MemoryStorage();
    saveStudioCheckpoint(identity, { ...freshStudioInputs(), resolution: "2K" }, storage);
    expect(readStudioCheckpoint(identity, storage)?.inputs.resolution).toBe("2K");
    const parsedJob = studioJobSchema.parse({ ...job, resolution: "4K" });
    writeStudioRecovery(identity, { jobs: [parsedJob], outcomeUnknown: false }, storage);
    expect(readStudioRecovery(identity, storage).jobs[0].resolution).toBe("4K");
  });
  it("surfaces storage corruption and failures rather than pretending to save", () => {
    const storage = new MemoryStorage();
    storage.setItem(studioStorageKeys(identity).checkpoint, "{invalid");
    expect(() => readStudioCheckpoint(identity, storage)).toThrow();
    storage.setItem(studioStorageKeys(identity).recovery, JSON.stringify({ jobs: [{ invalid: true }] }));
    expect(() => readStudioRecovery(identity, storage)).toThrow();
    storage.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
    expect(() => saveStudioCheckpoint(identity, freshStudioInputs(), storage)).toThrow("Full");
  });
  it("clears only campaign Studio prefixes on sign out", () => {
    const storage = new MemoryStorage();
    saveStudioCheckpoint(identity, freshStudioInputs(), storage);
    writeStudioRecovery(identity, { jobs: [job], outcomeUnknown: false }, storage);
    storage.setItem(studioStorageKeys({ campaignId: "another", userId: "gm" }).legacy, "{}");
    storage.setItem("unrelated", "keep");
    const previousEpoch = studioStorageEpoch();
    clearCampaignStudioSessions(storage);
    expect(studioStorageEpoch()).not.toBe(previousEpoch);
    expect(storage.length).toBe(1);
    expect(storage.getItem("unrelated")).toBe("keep");
  });
  it("checkpoints assistance provenance without changing legacy checkpoint or job inputs", () => {
    const storage = new MemoryStorage();
    const inputs = freshStudioInputs();
    inputs.form.direction = "Assisted direction"; inputs.form.directionAssisted = true;
    saveStudioCheckpoint(identity, inputs, storage);
    expect(readStudioCheckpoint(identity, storage)?.inputs.form.directionAssisted).toBe(true);
    const legacy = { ...inputs, form: { ...inputs.form } };
    delete legacy.form.directionAssisted;
    saveStudioCheckpoint(identity, legacy, storage);
    expect(readStudioCheckpoint(identity, storage)?.inputs.form.directionAssisted).toBeUndefined();
    expect(freshStudioInputs().form.directionAssisted).toBeUndefined();
    writeStudioRecovery(identity, { jobs: [job], outcomeUnknown: false }, storage);
    expect(readStudioRecovery(identity, storage).jobs).toEqual([job]);
  });
});
