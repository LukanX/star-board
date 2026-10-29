import { describe, expect, it } from "vitest";
import { buildReferenceCatalog } from "@/scripts/refresh-reference-catalog.mjs";

const source = { repository: "foundryvtt/pf2e", commit: "pinned", release: "test", schemaVersion: 1 };
const recordPath = "packs/sf2e/ancestries/test.json";
const journalPath = "packs/sf2e/journals/ancestries.json";
const id = "1234567890abcdef";
const documents: Record<string, string> = {
  [recordPath]: JSON.stringify({ _id: id, name: "Test", type: "ancestry", system: {
    description: { value: `@UUID[Compendium.sf2e.journals.JournalEntry.${id}.JournalEntryPage.${id}] PRIVATE SOURCE PROSE` },
    publication: { title: "Test source", license: "ORC" }, rules: [{ key: "NEVER COPY" }],
  } }),
  [journalPath]: JSON.stringify({ _id: id, pages: [{ _id: id, text: { content: "PRIVATE JOURNAL PROSE" } }] }),
};
const profiles = { "ancestries/test.json": { name: "Test", pageId: id, facts: ["Original factual profile."], summary: "" } };
const reader = async (name: string) => documents[name];

describe("reference metadata importer", () => {
  it("is deterministic and excludes source prose/rule elements", async () => {
    const first = await buildReferenceCatalog(reader, [recordPath], source, profiles);
    const second = await buildReferenceCatalog(reader, [recordPath], source, profiles);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain("PRIVATE");
    expect(JSON.stringify(first)).not.toContain("NEVER COPY");
    expect(first.records[0].facts).toEqual(["Original factual profile."]);
    expect(first.inputs).toHaveLength(2);
  });
  it("refuses a missing source page rather than guessing a name match", async () => {
    await expect(buildReferenceCatalog(reader, [recordPath], source, { "ancestries/test.json": { ...profiles["ancestries/test.json"], pageId: "missing" } })).rejects.toThrow("Unresolved");
  });
  it("refuses an orphaned original profile", async () => {
    await expect(buildReferenceCatalog(reader, [], source, profiles)).rejects.toThrow("Missing profiled record");
  });
  it("rejects duplicates and mismatched pack kinds", async () => {
    await expect(buildReferenceCatalog(reader, [recordPath, recordPath], source, profiles)).rejects.toThrow("Duplicate");
    const wrongKind = async (name: string) => name === recordPath ? JSON.stringify({ _id: id, name: "Test", type: "class" }) : reader(name);
    await expect(buildReferenceCatalog(wrongKind, [recordPath], source, profiles)).rejects.toThrow("kind does not match");
  });
  it("keeps identities pack-scoped and output stable for shuffled file lists", async () => {
    const classPath = "packs/sf2e/classes/test.json";
    const readBoth = async (name: string) => name === classPath
      ? JSON.stringify({ _id: id, name: "Test class", type: "class", system: { publication: {} } }) : reader(name);
    const first = await buildReferenceCatalog(readBoth, [recordPath, classPath], source, profiles);
    const second = await buildReferenceCatalog(readBoth, [classPath, recordPath], source, profiles);
    expect(first).toEqual(second);
    expect(first.records).toHaveLength(2);
    expect(first.records[0].id).not.toBe(first.records[1].id);
  });
});
