import { describe, expect, it } from "vitest";
import { addStudioSubject, directionMention, insertDirectionMention } from "@/components/ai-studio/studioSubjects";
import { generationBlocker } from "@/components/ai-studio/generationBlocker";
import { studioCompositionSchema } from "@/lib/validation/studio";
import type { StudioSubjectOption } from "@/lib/ai/studio-context";

const subject: StudioSubjectOption = {
  kind: "character", id: "00000000-0000-4000-8000-000000000001", name: "Astra Vale",
  art_path: null, updated_at: "now", hasReferenceImage: true,
};
const composition = studioCompositionSchema.parse({});

describe("Studio subject selection and Direction mentions", () => {
  it("uses image-only defaults for eligible artwork and text otherwise", () => {
    expect(addStudioSubject(composition, subject, "scene")).toMatchObject({ composition: { subjects: [{ useImage: true, includeDescription: false }] } });
    const text = addStudioSubject(composition, { ...subject, hasReferenceImage: false }, "scene");
    expect(text).toMatchObject({ composition: { subjects: [{ useImage: false }] } });
    if ("composition" in text) expect(text.composition.subjects[0].includeDescription).toBeUndefined();
  });
  it("deduplicates IDs without overwriting manually selected flags or descriptions", () => {
    const existing = studioCompositionSchema.parse({ subjects: [{ kind: subject.kind, id: subject.id, useImage: false, description: "Blue armor" }] });
    expect(addStudioSubject(existing, subject, "scene")).toEqual({ composition: existing });
    const other = addStudioSubject(existing, { ...subject, id: "00000000-0000-4000-8000-000000000002" }, "scene");
    expect(other).toMatchObject({ composition: { subjects: [{ description: "Blue armor" }, { id: "00000000-0000-4000-8000-000000000002" }] } });
  });
  it("preserves actor and Place limits and Place-only maps", () => {
    const full = studioCompositionSchema.parse({ subjects: Array.from({ length: 6 }, (_, index) => ({ kind: "npc", id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}` })) });
    expect(addStudioSubject(full, subject, "scene")).toHaveProperty("error");
    expect(addStudioSubject(full, { ...subject, kind: "place" }, "scene")).toHaveProperty("composition");
    expect(addStudioSubject(composition, subject, "battlemap")).toHaveProperty("error");
    const map = studioCompositionSchema.parse({ subjects: [{ kind: "place", id: subject.id }] });
    expect(addStudioSubject(map, { ...subject, kind: "place", id: "00000000-0000-4000-8000-000000000002" }, "battlemap")).toHaveProperty("error");
  });
  it("detects only the active @ query at the caret, not emails or one-character searches", () => {
    expect(directionMention("Meet @As in the hangar", 8)).toEqual({ query: "As", start: 5, end: 8 });
    expect(directionMention("mail@Astra", 10)).toBeNull();
    expect(directionMention("@A", 2)).toBeNull();
    expect(directionMention("Meet @As in", 11)).toBeNull();
  });
  it("inserts a readable multiword name while preserving trailing Direction text", () => {
    expect(insertDirectionMention("Meet @As in the hangar", { start: 5, end: 8 }, "Astra Vale")).toEqual({ direction: "Meet @Astra Vale in the hangar", caret: 16 });
  });
  it("enforces the actual 1,200-character insertion boundary", () => {
    const prefix = "x".repeat(1197);
    expect(insertDirectionMention(`${prefix}@ab`, { start: 1197, end: 1200 }, "ab")).toHaveProperty("direction");
    expect(insertDirectionMention(`${prefix}@ab`, { start: 1197, end: 1200 }, "abc")).toHaveProperty("error");
  });
});

const valid: Parameters<typeof generationBlocker>[0] = {
  ready: true, busy: null, loading: false, modelAvailable: true, hasReferences: false, ratioSupported: true,
  missingStyle: false, subjectError: null, previewError: null, direction: "The crew defends the hangar", previewCurrent: true, overBy: 0, recoveryCount: 0,
};
describe("Studio generation reasons", () => {
  it("enables only a ready, current, fitting composition", () => expect(generationBlocker(valid)).toBeNull());
  it.each([
    [{ busy: "Generating image..." }, "Wait for this operation"],
    [{ ready: false }, "browser storage"],
    [{ modelAvailable: false }, "Choose an available image model."],
    [{ modelAvailable: false, hasReferences: true }, "supports visual references"],
    [{ ratioSupported: false }, "aspect ratio"],
    [{ missingStyle: true }, "saved visual style"],
    [{ subjectError: "Reference disappeared" }, "Reference disappeared"],
    [{ direction: " " }, "Write a direction"],
    [{ loading: true }, "finish updating"],
    [{ previewError: "Reference could not be read", previewCurrent: false }, "Reference could not be read"],
    [{ previewCurrent: false }, "preview to update"],
    [{ overBy: 1 }, "Shorten or exclude"],
    [{ recoveryCount: 20 }, "20-request recovery limit"],
  ] satisfies [Partial<typeof valid>, string][])("explains blocker %j", (patch, expected) => {
    expect(generationBlocker({ ...valid, ...patch })).toContain(expected);
  });
});
