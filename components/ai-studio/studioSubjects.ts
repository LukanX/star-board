import { studioCompositionSchema, type StudioComposition, type StudioSubjectKind } from "@/lib/validation/studio";
import type { StudioSubjectOption } from "@/lib/ai/studio-context";
import type { SearchableEntitySection } from "@/lib/campaign/entity-search";

export const studioSubjectKey = (subject: { kind: string; id: string }) => `${subject.kind}:${subject.id}`;
export const visualSubjectSections = ["characters", "npcs", "enemies", "places"] as const;
export const subjectKindBySection: Partial<Record<SearchableEntitySection, StudioSubjectKind>> = {
  characters: "character", npcs: "npc", enemies: "enemy", places: "place",
};

export function addStudioSubject(composition: StudioComposition, subject: StudioSubjectOption, kind: "scene" | "battlemap"): { composition: StudioComposition } | { error: string } {
  if (kind === "battlemap" && subject.kind !== "place") return { error: "Battlemaps can use a Place, not actor subjects." };
  if (composition.subjects.some((value) => studioSubjectKey(value) === studioSubjectKey(subject))) return { composition };
  const checked = studioCompositionSchema.safeParse({ ...composition, subjects: [...composition.subjects, {
    kind: subject.kind, id: subject.id, useImage: subject.hasReferenceImage, ...(subject.hasReferenceImage ? { includeDescription: false } : {}),
  }] });
  return checked.success ? { composition: checked.data } : { error: checked.error.issues[0]?.message ?? "Invalid subjects." };
}

export function directionMention(value: string, caret: number) {
  const match = /(?:^|\s)@([^\s@]{2,80})$/.exec(value.slice(0, caret));
  return match ? { query: match[1], start: caret - match[1].length - 1, end: caret } : null;
}

export function insertDirectionMention(value: string, range: { start: number; end: number }, label: string): { direction: string; caret: number } | { error: string } {
  const inserted = `@${label}`;
  const direction = `${value.slice(0, range.start)}${inserted}${value.slice(range.end)}`;
  return direction.length > 1200 ? { error: "The selected name would exceed Direction's 1,200-character limit." }
    : { direction, caret: range.start + inserted.length };
}
