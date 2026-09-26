import { describe, expect, it } from "vitest";
import {
  artStudioSessionKey,
  artStudioSessionPrefix,
  clearArtStudioSessions,
  discardNewArtStudioSession,
  emptyArtStudioSession,
  finalizeArtStudioSession,
  readArtStudioSession,
  writeArtStudioSession,
  type ArtStudioIdentity,
  type ArtStudioSession,
} from "@/components/archive/artStudioSession";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const identity: ArtStudioIdentity = {
  campaignId: "campaign-1",
  kind: "place",
  entityId: "place-1",
};

function session(): ArtStudioSession {
  return {
    ...emptyArtStudioSession(),
    refinement: "Keep the violet light and change the angle.",
    selectedStyleId: "style-1",
    styleSelectionChanged: true,
    selectedGenerationRunId: "run-1",
    drafts: [{
      generationRunId: "run-1",
      targetKind: "place",
      purpose: "entity-art",
      mode: "create",
      subject: "A quiet observatory",
      aspectRatio: "1:1",
      size: "1024x1024",
      prompt: "A quiet observatory under violet light",
      provider: "openrouter",
      model: "openai/gpt-image-1",
      createdAt: "2026-09-24T12:00:00.000Z",
      temporaryPath: "campaign-1/user-1/image-run-1.png",
      styleId: "style-1",
      contextPlaceId: null,
    }],
  };
}

describe("art studio session storage", () => {
  it("uses a campaign, kind, and entity-scoped key", () => {
    expect(artStudioSessionKey(identity)).toBe(`${artStudioSessionPrefix}campaign-1:place:place-1`);
    expect(artStudioSessionKey({ ...identity, entityId: null })).toContain(":place:new");
  });

  it("round-trips compact draft metadata and keeps the selected draft valid", () => {
    const storage = new MemoryStorage();
    writeArtStudioSession(identity, session(), storage);

    const storedText = storage.getItem(artStudioSessionKey(identity));
    expect(storedText).not.toContain("base64");
    expect(readArtStudioSession(identity, storage)).toEqual(session());
  });

  it("restores aspect-only drafts without discarding legacy pixel-sized drafts", () => {
    const storage = new MemoryStorage();
    const draftWithoutSize = { ...session().drafts[0] };
    delete draftWithoutSize.size;
    const aspectOnlySession = { ...session(), drafts: [draftWithoutSize] };
    writeArtStudioSession(identity, aspectOnlySession, storage);

    expect(readArtStudioSession(identity, storage)).toEqual(aspectOnlySession);
    expect(readArtStudioSession(identity, storage).drafts[0].size).toBeUndefined();
  });

  it("treats malformed and unknown session data as an empty session", () => {
    const storage = new MemoryStorage();
    storage.setItem(artStudioSessionKey(identity), "{");
    expect(readArtStudioSession(identity, storage)).toEqual(emptyArtStudioSession());
    storage.setItem(artStudioSessionKey(identity), JSON.stringify({ version: 9, drafts: [] }));
    expect(readArtStudioSession(identity, storage)).toEqual(emptyArtStudioSession());
  });

  it("clears saved thumbnails while migrating refinement notes from a new record", () => {
    const storage = new MemoryStorage();
    const newIdentity = { ...identity, entityId: null };
    writeArtStudioSession(newIdentity, session(), storage);

    const temporaryPaths = finalizeArtStudioSession(newIdentity, "place-2", storage);

    expect(temporaryPaths).toEqual(["campaign-1/user-1/image-run-1.png"]);
    expect(readArtStudioSession(newIdentity, storage)).toEqual(emptyArtStudioSession());
    expect(readArtStudioSession({ ...identity, entityId: "place-2" }, storage)).toEqual({
      ...session(),
      styleSelectionChanged: false,
      drafts: [],
      selectedGenerationRunId: null,
    });
  });

  it("discards an abandoned new-record session and returns temporary paths", () => {
    const storage = new MemoryStorage();
    const newIdentity = { ...identity, entityId: null };
    writeArtStudioSession(newIdentity, session(), storage);

    expect(discardNewArtStudioSession(newIdentity, storage)).toEqual(["campaign-1/user-1/image-run-1.png"]);
    expect(readArtStudioSession(newIdentity, storage)).toEqual(emptyArtStudioSession());
  });

  it("clears only Star Board art session keys", () => {
    const storage = new MemoryStorage();
    writeArtStudioSession(identity, session(), storage);
    storage.setItem("other-app:key", "keep");

    clearArtStudioSessions(storage);

    expect(storage.getItem(artStudioSessionKey(identity))).toBeNull();
    expect(storage.getItem("other-app:key")).toBe("keep");
  });
});