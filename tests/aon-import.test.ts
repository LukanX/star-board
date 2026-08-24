import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { fetchAonCreatureHtml } from "@/lib/enemies/aon-fetch";
import { canonicalizeAonCreatureUrl, parseAonCreatureUrl } from "@/lib/enemies/aon-url";
import { parseAonCreatureHtml } from "@/lib/enemies/aon-parser";
import { diffAonCreature, hashAonCreature } from "@/lib/enemies/import-diff";

const fixturePath = new URL("./fixtures/aon/representative-creature.html", import.meta.url);

const readFixture = () => readFile(fixturePath, "utf8");

describe("Archives of Nethys creature URLs", () => {
  it("parses and canonicalizes a supported creature URL", () => {
    const result = parseAonCreatureUrl(" HTTPS://2E.AONSRD.COM/creatures/42-void-sentinel/?view=full#stat-block ");

    expect(result).toEqual({
      externalId: 42,
      slug: "void-sentinel",
      canonicalUrl: "https://2e.aonsrd.com/creatures/42-void-sentinel",
    });
    expect(canonicalizeAonCreatureUrl("https://2e.aonsrd.com/creatures/42-void-sentinel?foo=bar")).toBe(
      "https://2e.aonsrd.com/creatures/42-void-sentinel",
    );
  });

  it.each([
    "http://2e.aonsrd.com/creatures/42-void-sentinel",
    "https://www.aonsrd.com/creatures/42-void-sentinel",
    "https://2e.aonsrd.com:443/creatures/42-void-sentinel",
    "https://user:pass@2e.aonsrd.com/creatures/42-void-sentinel",
    "https://2e.aonsrd.com/creatures/42-void-sentinel/related",
    "https://2e.aonsrd.com/traits/42-void-sentinel",
    "https://2e.aonsrd.com/creatures/not-a-number-void-sentinel",
  ])("rejects an unsupported URL: %s", (url) => {
    expect(() => parseAonCreatureUrl(url)).toThrow();
  });
});

describe("Archives of Nethys creature parser", () => {
  it("extracts the individual stat block without family/sidebar contamination", async () => {
    const parsed = parseAonCreatureHtml(await readFixture(), "https://2e.aonsrd.com/creatures/42-void-sentinel");

    expect(parsed.name).toBe("Void Sentinel");
    expect(parsed.level).toBe(7);
    expect(parsed.size).toBe("large");
    expect(parsed.rarity).toBe("uncommon");
    expect(parsed.traits).toEqual(["Construct", "Cosmic"]);
    expect(parsed.sourceTitle).toBe("Alien Core");
    expect(parsed.sourcePage).toBe("77");
    expect(parsed.family).toBe("Void Sentinels");
    expect(parsed.statBlock.perception).toMatchObject({ modifier: 16 });
    expect(parsed.statBlock.languages).toMatchObject({ names: ["Common", "Draconic"], additionalCount: 5 });
    expect(parsed.statBlock.skills).toEqual([
      { name: "Athletics", modifier: 18, notes: "" },
      { name: "Stealth", modifier: 15, notes: "" },
      { name: "Void Lore", modifier: 17, notes: "" },
    ]);
    expect(parsed.statBlock.abilityModifiers).toEqual({
      strength: 5,
      dexterity: 3,
      constitution: 4,
      intelligence: 1,
      wisdom: 2,
      charisma: 0,
    });
    expect(parsed.statBlock.defenses.armorClass).toBe(25);
    expect(parsed.statBlock.defenses.hitPoints).toEqual([{ label: "HP", value: 118, notes: "" }]);
    expect(parsed.statBlock.defenses.immunities).toEqual(["bleed", "disease"]);
    expect(parsed.statBlock.defenses.resistances).toEqual(["electricity 10"]);
    expect(parsed.statBlock.defenses.weaknesses).toEqual(["sonic 5"]);
    expect(parsed.statBlock.movement.map(({ mode, speed }) => ({ mode, speed }))).toEqual([
      { mode: "land", speed: "30 feet" },
      { mode: "fly", speed: "60 feet" },
      { mode: "swim", speed: "20 feet" },
    ]);
    expect(parsed.statBlock.strikes.map(({ category, name, attackModifier }) => ({ category, name, attackModifier }))).toEqual([
      { category: "melee", name: "void blade", attackModifier: 18 },
      { category: "ranged", name: "ion ray", attackModifier: 16 },
    ]);
    expect(parsed.statBlock.spellcasting[0]).toMatchObject({ tradition: "occult", method: "innate", dc: 24 });
    expect(parsed.statBlock.spellcasting[0].entries).toEqual([
      { rank: "4th", spells: ["fear"], uses: null, frequency: null, notes: "" },
      { rank: "Cantrips", spells: ["daze"], uses: null, frequency: null, notes: "" },
    ]);
    expect(parsed.statBlock.specialAbilities.map(({ name }) => name)).toEqual(["Signal Veil", "Void Pulse"]);
    expect(parsed.statBlock.specialAbilities.map(({ name, activation }) => ({ name, activation }))).toEqual([
      { name: "Signal Veil", activation: "passive" },
      { name: "Void Pulse", activation: "two-actions" },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("Family Variant");
    expect(JSON.stringify(parsed)).not.toContain("Do not import this sidebar");
  });

  it("fails closed when identity or core defenses are missing", () => {
    expect(() => parseAonCreatureHtml("<main id=\"main\"><div class=\"creature\"><h2 class=\"title\">Unknown</h2></div></main>")).toThrow(
      /stat block/i,
    );
  });

  it("rejects HTML whose creature link identifies another external record", async () => {
    const html = (await readFixture()).replace("/creatures/42-void-sentinel", "/creatures/99-other-creature");

    expect(() => parseAonCreatureHtml(html, {
      canonicalUrl: "https://2e.aonsrd.com/creatures/42-void-sentinel",
      expectedExternalId: 42,
    })).toThrow(/different creature/i);
  });
});

describe("Archives of Nethys fetcher", () => {
  it("limits response size and accepts only HTML", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("too large", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "content-length": "9" },
    }));

    await expect(fetchAonCreatureHtml("https://2e.aonsrd.com/creatures/42-void-sentinel", {
      fetchImpl,
      maxBytes: 8,
    })).rejects.toThrow(/size/i);

    fetchImpl.mockResolvedValueOnce(new Response("not html", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await expect(fetchAonCreatureHtml("https://2e.aonsrd.com/creatures/42-void-sentinel", { fetchImpl })).rejects.toThrow(/html/i);
  });

  it("validates redirects instead of following them to another host", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/creatures/42-void-sentinel" },
    }));

    await expect(fetchAonCreatureHtml("https://2e.aonsrd.com/creatures/42-void-sentinel", { fetchImpl })).rejects.toThrow(/redirect/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects redirects to another creature record", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://2e.aonsrd.com/creatures/99-other-creature" },
    }));

    await expect(fetchAonCreatureHtml("https://2e.aonsrd.com/creatures/42-void-sentinel", { fetchImpl })).rejects.toThrow(/different creature/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("Archives of Nethys import fingerprints and diffs", () => {
  it("hashes equivalent parsed payloads canonically", () => {
    expect(hashAonCreature({ b: "  value  ", a: ["x", " y "] })).toBe(
      hashAonCreature({ a: ["x", "y"], b: "value" }),
    );
  });

  it("reports section-level changes without copying full source prose", () => {
    const previous = { name: "Void Sentinel", level: 7, size: "large", rarity: "uncommon", traits: ["Construct"], statBlock: { defenses: { armorClass: 25 }, strikes: [] } };
    const next = { ...previous, statBlock: { defenses: { armorClass: 27 }, strikes: [{ name: "ion ray" }] } };
    const differences = diffAonCreature(previous, next);

    expect(differences.find((difference) => difference.section === "defenses")).toMatchObject({ status: "changed" });
    expect(differences.find((difference) => difference.section === "strikes")).toMatchObject({ status: "changed" });
    expect(differences.every(({ summary }) => summary.length < 200)).toBe(true);
  });
});
