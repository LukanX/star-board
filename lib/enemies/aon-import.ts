import { hashAonCreature } from "@/lib/enemies/import-diff";
import type { AonParsedCreature } from "@/lib/enemies/aon-parser";
import type { AonCreatureUrl } from "@/lib/enemies/aon-url";
import { enemyImportPreviewSchema, enemySourceSnapshotSchema, type EnemyImportPreview, type EnemySourceSnapshot } from "@/lib/validation/enemy";

export const AON_SYSTEM_NAME = "Starfinder 2e";
export const AON_PARSER_VERSION = "aon-creature-v1";

export type AonImportPayload = {
  name: string;
  level: number;
  size: AonParsedCreature["size"];
  rarity: AonParsedCreature["rarity"];
  traits: string[];
  family: string | null;
  statBlock: AonParsedCreature["statBlock"];
  sourceSnapshot: EnemySourceSnapshot;
};

export function createAonSourceSnapshot(parsed: AonParsedCreature, url: AonCreatureUrl, retrievedAt = new Date().toISOString()): EnemySourceSnapshot {
  const parsedPayload = {
    name: parsed.name,
    level: parsed.level,
    size: parsed.size,
    rarity: parsed.rarity,
    traits: parsed.traits,
    family: parsed.family,
    statBlock: parsed.statBlock,
  };
  return enemySourceSnapshotSchema.parse({
    provider: "aon",
    system: AON_SYSTEM_NAME,
    externalId: url.externalId,
    canonicalUrl: url.canonicalUrl,
    sourceTitle: parsed.sourceTitle || "Archives of Nethys",
    sourcePage: parsed.sourcePage || "Not listed",
    rulesStatus: "unreviewed import",
    parserVersion: AON_PARSER_VERSION,
    schemaVersion: 1,
    retrievedAt,
    contentHash: hashAonCreature(parsedPayload),
    parsedPayload,
  });
}

export function createAonImportPayload(parsed: AonParsedCreature, sourceSnapshot: EnemySourceSnapshot): AonImportPayload {
  return {
    name: parsed.name,
    level: parsed.level,
    size: parsed.size,
    rarity: parsed.rarity,
    traits: parsed.traits,
    family: parsed.family,
    statBlock: parsed.statBlock,
    sourceSnapshot,
  };
}

export function createAonImportDraft(payload: AonImportPayload) {
  return {
    name: payload.name,
    playerDescription: "",
    level: payload.level,
    size: payload.size,
    rarity: payload.rarity,
    traits: payload.traits,
    family: payload.family,
    statBlock: payload.statBlock,
    gmNotesMarkdown: "",
    artSubject: "",
  };
}

export function createAonPreview(
  campaignId: string,
  payload: AonImportPayload,
  warnings: string[] = [],
  existingEnemyId: string | null = null,
  existingSourceHash: string | null = null,
  differences: EnemyImportPreview["differences"] = [],
): EnemyImportPreview {
  return enemyImportPreviewSchema.parse({
    campaignId,
    draft: createAonImportDraft(payload),
    sourceSnapshot: payload.sourceSnapshot,
    warnings: [...new Set(warnings)].slice(0, 24),
    existingEnemyId,
    existingSourceHash,
    differences,
  });
}
