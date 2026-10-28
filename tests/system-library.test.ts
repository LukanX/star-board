import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { buildSystemReferenceContext, creatureTraitRecords, creatureTraitVersion, enemyLibrarySelections, inspectSystemReferenceContext, readSystemLibrary } from "@/lib/references/system-library";
import { searchReferences, referenceCatalogVersion } from "@/lib/references/catalog";
import artifact from "@/lib/references/catalog.generated.json";
import { enemyReferenceSelectionsSchema, referenceStatusesSchema } from "@/lib/validation/reference";
import { reconcileEnemyReferences } from "@/lib/references/enemy";
import { systemReferenceSaveSchema } from "@/lib/validation/system-reference";
import { imageGenerationInputSchema } from "@/lib/validation/image";

const ancestry = searchReferences("ancestry", "Android")[0];
const undead = creatureTraitRecords.find((record) => record.slug === "undead")!;
const trait = { id: undead.id, catalogVersion: creatureTraitVersion };
const selection = { kind: "ancestry" as const, binding: ancestry.binding };
let settings = { appearance: false, lore: false, creature_traits: false };
let entries: Array<Record<string, unknown>>;
let fail = false;
let otherCampaignEntries: Array<Record<string, unknown>> = [];
const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
  const url = String(input);
  if (fail) return Response.json({ message: "database unavailable", code: "XX000" }, { status: 400 });
  if (url.includes("rpc/read_system_references")) {
    const args = JSON.parse(String(init?.body ?? "{}")) as { p_campaign_id?: string | null };
    if (!args.p_campaign_id) return Response.json(entries.map((entry) => ({
      ...entry, revision: 0, appearance: "", lore: "", trait_context: "", source_notes: "", updated_at: null,
    })));
    return Response.json(args.p_campaign_id === "campaign-b" ? otherCampaignEntries : entries);
  }
  return Response.json(settings);
});
const client = createClient("http://127.0.0.1:55421", "unit-test-key", { global: { fetch: fetchMock }, auth: { persistSession: false } });

describe("shared System library context", () => {
  beforeEach(() => {
    fetchMock.mockClear(); fail = false;
    settings = { appearance: false, lore: false, creature_traits: false };
    entries = [{ reference_id: ancestry.binding.id, kind: "ancestry", name: ancestry.name, catalog_version: referenceCatalogVersion,
      source_url: ancestry.sourceUrl, publication: "", revision: 1, appearance: "User-entered angular face.",
      lore: "User-entered travel traditions.", trait_context: "", source_notes: "Attribution notes not for the prompt.", updated_at: null }];
    otherCampaignEntries = [{ ...entries[0], revision: 1, appearance: "Another campaign's distinct appearance." }];
  });
  it("accounts for all ancestry metadata and the configured creature-trait namespace", () => {
    expect(artifact.records.filter((entry) => entry.kind === "ancestry")).toHaveLength(60);
    expect(creatureTraitRecords).toHaveLength(292);
    expect(creatureTraitRecords.every((entry) => Object.keys(entry).sort().join(",") === "id,kind,name,slug,sourceUrl")).toBe(true);
    expect(new Set(creatureTraitRecords.map((entry) => entry.id)).size).toBe(292);
    expect(creatureTraitRecords.some((entry) => entry.slug === "fire")).toBe(true);
  });
  it("defaults off and never reads or falls back to AI appearance", async () => {
    const result = await buildSystemReferenceContext(client, "campaign", [selection]);
    expect(result).toEqual({ text: "", sources: [] });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("rpc/"))).toBe(false);
  });
  it("does not infer references from unbound matching text", async () => {
    settings.appearance = true;
    expect(await buildSystemReferenceContext(client, "campaign", [{ kind: "ancestry", text: "Android" }])).toEqual({ text: "", sources: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("distinguishes unbound, disabled, empty and available context without fallback", async () => {
    expect((await inspectSystemReferenceContext(client, "campaign", [{ kind: "ancestry" }])).availability).toEqual([{ kind: "ancestry", state: "unbound" }]);
    expect((await inspectSystemReferenceContext(client, "campaign", [selection])).availability[0].state).toBe("disabled");
    settings.appearance = true;
    expect((await inspectSystemReferenceContext(client, "campaign", [selection])).availability[0].state).toBe("available");
    entries[0].appearance = "";
    expect((await inspectSystemReferenceContext(client, "campaign", [selection])).availability[0].state).toBe("empty");
  });
  it("includes only enabled sections, records revisions, and excludes attribution from prompts", async () => {
    settings.appearance = true;
    const first = await buildSystemReferenceContext(client, "campaign", [selection]);
    const read = fetchMock.mock.calls.find(([input]) => String(input).includes("rpc/read_system_references"));
    expect(JSON.parse(String(read?.[1]?.body))).toMatchObject({ p_campaign_id: "campaign" });
    expect(first.text).toContain("angular face");
    expect(first.text).not.toContain("travel traditions");
    expect(first.text).not.toContain("Attribution notes");
    expect(first.sources[0]).toMatchObject({ origin: "user-entered", revision: 1, includedSections: ["appearance"] });
    const snapshot = JSON.stringify(first);
    entries[0] = { ...entries[0], revision: 2, appearance: "A revised individual shape." };
    const second = await buildSystemReferenceContext(client, "campaign", [selection]);
    expect(second.sources[0].catalogVersion).toBe(first.sources[0].catalogVersion);
    expect(second.sources[0].contextHash).not.toBe(first.sources[0].contextHash);
    expect(JSON.stringify(first)).toBe(snapshot);
    expect(JSON.stringify(second.sources)).not.toContain("individual shape");
  });
  it("keeps authored content private to its campaign and hides it without campaign context", async () => {
    expect((await readSystemLibrary(client, [ancestry.binding.id], "campaign-a"))[0].appearance).toBe("User-entered angular face.");
    expect((await readSystemLibrary(client, [ancestry.binding.id], "campaign-b"))[0].appearance).toBe("Another campaign's distinct appearance.");
    expect(await readSystemLibrary(client, [ancestry.binding.id])).toMatchObject([
      { revision: 0, appearance: "", lore: "", source_notes: "" },
    ]);
  });
  it("keeps images appearance-only, and lore-only enabled campaigns have no art context", async () => {
    settings.lore = true;
    expect((await buildSystemReferenceContext(client, "campaign", [selection])).text).toContain("travel traditions");
    expect(await buildSystemReferenceContext(client, "campaign", [selection], "image")).toEqual({ text: "", sources: [] });
    settings.appearance = true;
    const art = await buildSystemReferenceContext(client, "campaign", [selection], "image");
    expect(art.text).toContain("angular face"); expect(art.text).not.toContain("traditions");
    const classSelection = { kind: "class" as const, binding: searchReferences("class", "Witchwarper")[0].binding };
    const portrait = await buildSystemReferenceContext(client, "campaign", [selection, classSelection], "image");
    expect(portrait.sources).toHaveLength(1);
    expect(portrait.sources[0].kind).toBe("ancestry");
    expect((await inspectSystemReferenceContext(client, "campaign", [classSelection], "image")).availability[0].state).toBe("disabled");
  });
  it("treats empty content as a gap and database failures as failures", async () => {
    settings.appearance = true; entries[0].appearance = "";
    expect(await buildSystemReferenceContext(client, "campaign", [selection])).toEqual({ text: "", sources: [] });
    entries = [];
    await expect(buildSystemReferenceContext(client, "campaign", [selection])).rejects.toThrow("out of sync");
    fail = true;
    await expect(buildSystemReferenceContext(client, "campaign", [selection])).rejects.toThrow("settings could not");
    await expect(readSystemLibrary(client)).rejects.toThrow("could not be loaded");
  });
  it("enforces the exact 4,000-character context budget without truncating", async () => {
    settings.appearance = true; entries[0].appearance = "x";
    const overhead = (await buildSystemReferenceContext(client, "campaign", [selection])).text.length - 1;
    entries[0].appearance = "x".repeat(4000 - overhead);
    expect((await buildSystemReferenceContext(client, "campaign", [selection])).text.length).toBe(4000);
    entries[0].appearance += "x";
    await expect(buildSystemReferenceContext(client, "campaign", [selection])).rejects.toThrow("exceeds 4,000");
  });
  it("grounds only explicit root-trait bindings that match the supplied traits", async () => {
    settings.creature_traits = true;
    entries = [{ ...entries[0], reference_id: trait.id, kind: "creature_trait", name: undead.name, catalog_version: creatureTraitVersion, source_url: undead.sourceUrl, appearance: "", lore: "", trait_context: "A supernatural creature, not a rules calculation." }];
    const selected = enemyLibrarySelections({ ancestry: null, creatureTraits: [trait] }, ["Undead"]);
    expect((await buildSystemReferenceContext(client, "campaign", selected)).text).toContain("not a rules calculation");
    expect(() => enemyLibrarySelections({ ancestry: null, creatureTraits: [trait] }, ["Humanoid"])).toThrow("does not match");
    expect(() => enemyLibrarySelections({ ancestry: null, creatureTraits: [{ ...trait, catalogVersion: "old" }] }, ["Undead"])).toThrow("changed");
    expect((await buildSystemReferenceContext(client, "campaign", selected, "image")).text).toBe("");
  });
  it("clears removed trait bindings while preserving ancestry and custom traits", () => {
    const references = { ancestry: ancestry.binding, creatureTraits: [trait] };
    expect(reconcileEnemyReferences(references, ["Undead", "custom"], { [trait.id]: "Undead" })).toEqual(references);
    expect(reconcileEnemyReferences(references, ["custom"], { [trait.id]: "Undead" })).toEqual({ ancestry: ancestry.binding, creatureTraits: [] });
    expect(enemyReferenceSelectionsSchema.safeParse({ ...references, creatureTraits: [trait, trait] }).success).toBe(false);
  });
  it("accepts legacy provenance but bounds the expanded envelope", async () => {
    settings.appearance = true;
    const source = (await buildSystemReferenceContext(client, "campaign", [selection])).sources[0];
    expect(referenceStatusesSchema.safeParse([source]).success).toBe(true);
    const legacy = { ...source };
    delete legacy.origin; delete legacy.revision; delete legacy.includedSections;
    expect(referenceStatusesSchema.safeParse([legacy]).success).toBe(true);
    expect(referenceStatusesSchema.safeParse([{ ...source, revision: undefined }]).success).toBe(false);
    expect(referenceStatusesSchema.safeParse([{ ...source, origin: undefined }]).success).toBe(false);
    expect(referenceStatusesSchema.safeParse([{ ...source, includedSections: ["traitContext"] }]).success).toBe(false);
    expect(referenceStatusesSchema.safeParse([{ ...source, includedSections: ["appearance", "appearance"] }]).success).toBe(false);
    expect(referenceStatusesSchema.safeParse([{ ...legacy, kind: "class" }]).success).toBe(false);
    expect(referenceStatusesSchema.safeParse(Array.from({ length: 35 }, () => source)).success).toBe(false);
  });
  it("validates manual field limits and target-specific enemy artwork", () => {
    expect(systemReferenceSaveSchema.safeParse({ appearance: "x".repeat(4001), lore: "", traitContext: "", sourceNotes: "", expectedRevision: 0 }).success).toBe(false);
    const input = { campaignId: "00000000-0000-4000-8000-000000000001", mode: "create", subject: "One creature", enemyReferenceContext: { ancestryReference: ancestry.binding } };
    expect(imageGenerationInputSchema.safeParse({ ...input, targetKind: "enemy" }).success).toBe(true);
    expect(imageGenerationInputSchema.safeParse({ ...input, targetKind: "npc" }).success).toBe(false);
  });
});
