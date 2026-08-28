import { createHash } from "node:crypto";
import { enemyImportDifferenceSchema, type EnemyImportPreview } from "@/lib/validation/enemy";

const sections = [
  "identity",
  "classification",
  "recallKnowledge",
  "perception",
  "languages",
  "skills",
  "abilities",
  "defenses",
  "movement",
  "strikes",
  "spellcasting",
  "source",
] as const;

type DifferenceSection = (typeof sections)[number];
type JsonRecord = Record<string, unknown>;
type Difference = {
  section: DifferenceSection;
  status: "new" | "unchanged" | "changed";
  summary: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sectionValue(value: unknown, section: DifferenceSection): unknown {
  if (!isRecord(value)) return undefined;
  if (section === "identity") return { name: value.name };
  if (section === "classification") return {
    level: value.level,
    size: value.size,
    rarity: value.rarity,
    traits: value.traits,
    family: value.family,
  };
  if (section === "abilities") return {
    abilityModifiers: isRecord(value.statBlock) ? value.statBlock.abilityModifiers : undefined,
    items: isRecord(value.statBlock) ? value.statBlock.items : undefined,
    specialAbilities: isRecord(value.statBlock) ? value.statBlock.specialAbilities : undefined,
  };
  if (section === "source") return value.sourceSnapshot ?? value.source ?? {
    sourceTitle: value.sourceTitle,
    sourcePage: value.sourcePage,
    canonicalUrl: value.canonicalUrl,
  };
  return isRecord(value.statBlock) ? value.statBlock[section] : value[section];
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value)) ?? "undefined").digest("hex");
}

function compactValue(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "empty";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return "empty";
    const interesting = ["name", "level", "armorClass", "modifier", "dc", "value"].find((key) => key in value);
    return interesting ? `${interesting} ${compactValue(value[interesting])}` : `${keys.length} field${keys.length === 1 ? "" : "s"}`;
  }
  return String(value).slice(0, 64);
}

function changedSummary(section: DifferenceSection, previous: unknown, next: unknown): string {
  const before = compactValue(previous);
  const after = compactValue(next);
  if (section === "defenses" && isRecord(previous) && isRecord(next) && previous.armorClass !== next.armorClass) {
    return `Defenses changed: armor class ${compactValue(previous.armorClass)} to ${compactValue(next.armorClass)}.`;
  }
  return `${section} changed from ${before} to ${after}.`;
}

function newSummary(section: DifferenceSection, next: unknown): string {
  return `${section} added (${compactValue(next)}).`;
}

export function hashAonCreature(value: unknown): string {
  return stableHash(value);
}

export function diffAonCreature(previous: unknown, next: unknown): Difference[] {
  return sections.map((section) => {
    const before = sectionValue(previous, section);
    const after = sectionValue(next, section);
    const beforeHash = stableHash(before);
    const afterHash = stableHash(after);
    if (before === undefined && after !== undefined) {
      return { section, status: "new", summary: newSummary(section, after) };
    }
    if (beforeHash === afterHash) {
      return { section, status: "unchanged", summary: `${section} is unchanged.` };
    }
    return { section, status: "changed", summary: changedSummary(section, before, after) };
  }).map((difference) => enemyImportDifferenceSchema.parse(difference));
}

export type AonCreatureDifference = Difference;
export type AonImportPreviewDifference = EnemyImportPreview["differences"][number];
