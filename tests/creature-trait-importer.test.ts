import { describe, expect, it } from "vitest";
import { extractCreatureTraits, buildCreatureTraitCatalog } from "../scripts/refresh-creature-traits.mjs";

describe("pinned creature trait import", () => {
  it("resolves only literal namespace maps and their spreads", () => {
    expect(extractCreatureTraits('const shared = { fire: "PF2E.Fire" }; const creatureTraits = { ...shared, undead: "PF2E.Undead" }; const weaponTraits = { attack: "not imported" };')).toEqual({ fire: "PF2E.Fire", undead: "PF2E.Undead" });
    expect(extractCreatureTraits('const shared = { fire: "Fire" }; const creatureTraits = { ...shared, fire: "Fire" };')).toEqual({ fire: "Fire" });
  });
  it.each([
    'const creatureTraits = executeUpstreamCode();',
    'const a = { ...b }; const b = { ...a }; const creatureTraits = { ...a };',
    'const creatureTraits = { [unknown]: "Fire" };',
    'const shared = { fire: "Fire" }; const creatureTraits = { ...shared, fire: "Other" };',
  ])("rejects unsupported or conflicting source: %s", (source) => expect(() => extractCreatureTraits(source)).toThrow());
  it("uses SF2e label overrides, excludes descriptions, and hashes deterministic inputs", async () => {
    const files: Record<string, string> = {
      "src/scripts/config/traits.ts": 'const creatureTraits = { fire: "PF2E.TraitFire" };',
      "src/scripts/config/index.ts": "const config = { creatureTraits };",
      "static/lang/en.json": JSON.stringify({ PF2E: { TraitFire: "Fire", TraitDescriptionFire: "Do not import prose" } }),
      "static/lang/sf2e-overrides-en.json": JSON.stringify({ PF2E: { TraitFire: "SF Fire" } }),
    };
    const source = { repository: "foundryvtt/pf2e", commit: "pinned", release: "sf2e-test" };
    const build = () => buildCreatureTraitCatalog(async (name: string) => files[name], source);
    const result = await build();
    expect(result).toEqual(await build());
    expect(result.records[0].name).toBe("SF Fire");
    expect(JSON.stringify(result)).not.toContain("Do not import prose");
    files["static/lang/en.json"] = "{}"; files["static/lang/sf2e-overrides-en.json"] = "{}";
    await expect(build()).rejects.toThrow("Invalid creature-trait metadata");
  });
});
