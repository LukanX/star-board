import type { ImageDraft } from "@/lib/ai/image-job-polling";
import { imageAspectRatioValues, imageSizeValues } from "@/lib/ai/image-options";

export type ArtStudioKind = Exclude<ImageDraft["targetKind"], "visual-style">;
export type ArtStudioIdentity = {
  campaignId: string;
  kind: ArtStudioKind;
  entityId?: string | null;
};

export type ArtStudioDraftMetadata = Omit<ImageDraft, "image"> & {
  styleId: string | null;
  contextPlaceId: string | null;
};

export type ArtStudioSession = {
  version: 1;
  refinement: string;
  selectedStyleId: string | null;
  styleSelectionChanged: boolean;
  selectedGenerationRunId: string | null;
  drafts: ArtStudioDraftMetadata[];
};

export const artStudioSessionPrefix = "star-board:art-studio:v1:";
export const artStudioSessionEvent = "star-board:art-studio-session-change";

export function artStudioSessionKey(identity: ArtStudioIdentity) {
  const entityId = identity.entityId || "new";
  return `${artStudioSessionPrefix}${encodeURIComponent(identity.campaignId)}:${identity.kind}:${encodeURIComponent(entityId)}`;
}

export function emptyArtStudioSession(): ArtStudioSession {
  return {
    version: 1,
    refinement: "",
    selectedStyleId: null,
    styleSelectionChanged: false,
    selectedGenerationRunId: null,
    drafts: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseDraftMetadata(value: unknown, kind: ArtStudioKind): ArtStudioDraftMetadata | null {
  if (!isRecord(value)) return null;
  if (
    value.targetKind !== kind
    || value.purpose !== "entity-art"
    || (value.mode !== "create" && value.mode !== "refine")
    || typeof value.generationRunId !== "string"
    || typeof value.subject !== "string"
    || typeof value.aspectRatio !== "string"
    || !imageAspectRatioValues.includes(value.aspectRatio as (typeof imageAspectRatioValues)[number])
    || typeof value.size !== "string"
    || !imageSizeValues.includes(value.size as (typeof imageSizeValues)[number])
    || typeof value.prompt !== "string"
    || value.provider !== "openrouter"
    || typeof value.model !== "string"
    || typeof value.createdAt !== "string"
    || typeof value.temporaryPath !== "string"
    || !isNullableString(value.styleId)
    || !isNullableString(value.contextPlaceId)
    || (kind === "character" && typeof value.characterId !== "string")
    || (kind !== "character" && value.characterId !== undefined)
  ) {
    return null;
  }

  return {
    generationRunId: value.generationRunId,
    targetKind: kind,
    ...(typeof value.characterId === "string" ? { characterId: value.characterId } : {}),
    purpose: "entity-art",
    mode: value.mode,
    subject: value.subject,
    aspectRatio: value.aspectRatio as ImageDraft["aspectRatio"],
    size: value.size as ImageDraft["size"],
    prompt: value.prompt,
    provider: "openrouter",
    model: value.model,
    createdAt: value.createdAt,
    temporaryPath: value.temporaryPath,
    styleId: value.styleId,
    contextPlaceId: value.contextPlaceId,
  };
}

function getSessionStorage(storage?: Storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readArtStudioSession(identity: ArtStudioIdentity, storage?: Storage): ArtStudioSession {
  const currentStorage = getSessionStorage(storage);
  if (!currentStorage) return emptyArtStudioSession();

  try {
    const raw = currentStorage.getItem(artStudioSessionKey(identity));
    if (!raw) return emptyArtStudioSession();
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.drafts)) {
      return emptyArtStudioSession();
    }

    const drafts = value.drafts
      .map((draft) => parseDraftMetadata(draft, identity.kind))
      .filter((draft): draft is ArtStudioDraftMetadata => draft !== null);
    const requestedSelection = typeof value.selectedGenerationRunId === "string"
      ? value.selectedGenerationRunId
      : null;

    return {
      version: 1,
      refinement: typeof value.refinement === "string" ? value.refinement.slice(0, 600) : "",
      selectedStyleId: isNullableString(value.selectedStyleId) ? value.selectedStyleId : null,
      styleSelectionChanged: value.styleSelectionChanged === true,
      selectedGenerationRunId: drafts.some((draft) => draft.generationRunId === requestedSelection)
        ? requestedSelection
        : drafts.at(-1)?.generationRunId ?? null,
      drafts,
    };
  } catch {
    return emptyArtStudioSession();
  }
}

export function writeArtStudioSession(identity: ArtStudioIdentity, session: ArtStudioSession, storage?: Storage) {
  const currentStorage = getSessionStorage(storage);
  if (!currentStorage) return false;

  try {
    currentStorage.setItem(artStudioSessionKey(identity), JSON.stringify({
      ...session,
      drafts: session.drafts.map(({ styleId, ...draft }) => ({ ...draft, styleId })),
    }));
    return true;
  } catch {
    return false;
  }
}

function notifySessionChange(key: string | null) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(artStudioSessionEvent, { detail: { key } }));
  }
}

function safelyRemoveSessionKey(storage: Storage | null, key: string) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}

export function finalizeArtStudioSession(identity: ArtStudioIdentity, savedEntityId: string, storage?: Storage) {
  const currentStorage = getSessionStorage(storage);
  const session = readArtStudioSession(identity, currentStorage ?? undefined);
  const temporaryPaths = session.drafts.flatMap((draft) => draft.temporaryPath ? [draft.temporaryPath] : []);
  const nextIdentity = { ...identity, entityId: savedEntityId };
  const finalizedSession = {
    ...session,
    styleSelectionChanged: false,
    drafts: [],
    selectedGenerationRunId: null,
  };

  writeArtStudioSession(nextIdentity, finalizedSession, currentStorage ?? undefined);
  if (!identity.entityId) safelyRemoveSessionKey(currentStorage, artStudioSessionKey(identity));
  notifySessionChange(artStudioSessionKey(nextIdentity));
  return temporaryPaths;
}

export function discardNewArtStudioSession(identity: ArtStudioIdentity, storage?: Storage) {
  if (identity.entityId) return [];
  const currentStorage = getSessionStorage(storage);
  const session = readArtStudioSession(identity, currentStorage ?? undefined);
  const temporaryPaths = session.drafts.flatMap((draft) => draft.temporaryPath ? [draft.temporaryPath] : []);
  safelyRemoveSessionKey(currentStorage, artStudioSessionKey(identity));
  notifySessionChange(artStudioSessionKey(identity));
  return temporaryPaths;
}

export function clearArtStudioSessions(storage?: Storage) {
  const currentStorage = getSessionStorage(storage);
  if (!currentStorage) return;
  try {
    for (let index = currentStorage.length - 1; index >= 0; index -= 1) {
      const key = currentStorage.key(index);
      if (key?.startsWith(artStudioSessionPrefix)) currentStorage.removeItem(key);
    }
  } catch {
    return;
  }
  notifySessionChange(null);
}

export function draftMetadataForSession(draft: ImageDraft, styleId: string | null, contextPlaceId: string | null): ArtStudioDraftMetadata {
  const { image: imagePayload, ...metadata } = draft;
  void imagePayload;
  return { ...metadata, styleId, contextPlaceId };
}