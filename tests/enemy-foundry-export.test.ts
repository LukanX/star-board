import { describe, expect, it } from "vitest";
import { buildFoundryNpcActor } from "@/lib/enemies/foundry/export";
import type { EnemyStatBlockV1 } from "@/lib/enemies/types";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

type TestEnemy = {
  name: string;
  player_description: string;
  player_description_is_markdown: boolean;
  level: number;
  size: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
  rarity: "common" | "uncommon" | "rare" | "unique";
  traits: string[];
  stat_block: EnemyStatBlockV1 | null;
  campaign_id: string;
  gm_notes_markdown: string;
};

function idFactory() {
  let nextId = 0;
  return () => (nextId++).toString(16).padStart(16, "0");
}

function makeEnemy(overrides: Partial<TestEnemy> = {}): TestEnemy {
  const statBlock = enemyStatBlockSchema.parse({
    schemaVersion: 1,
    perception: {
      modifier: 8,
      senses: [{ name: "darkvision", range: null, notes: "" }],
      notes: "",
    },
    languages: { names: ["Common", "Eoxian"], additionalCount: 0, communicationNotes: "" },
    abilityModifiers: {
      strength: 4,
      dexterity: 4,
      constitution: 3,
      intelligence: 0,
      wisdom: 2,
      charisma: 3,
    },
    items: ["Laser Pistol"],
    defenses: {
      armorClass: 21,
      armorClassNotes: "",
      saves: {
        fortitude: { modifier: 11, notes: "" },
        reflex: { modifier: 12, notes: "" },
        will: { modifier: 8, notes: "" },
      },
      hitPoints: [{ label: "HP", value: 55, notes: "" }],
      immunities: ["death effects"],
      resistances: ["cold 5"],
      weaknesses: [],
      notes: "",
    },
    movement: [{ mode: "land", speed: "25 feet", notes: "" }],
    strikes: [{
      category: "ranged",
      name: "Laser Pistol",
      activation: null,
      attackModifier: 14,
      multipleAttackPenalty: [],
      traits: ["tech"],
      reach: null,
      range: "40 feet",
      damage: [{ formula: "1d6", type: "fire", notes: "" }],
      rider: "",
      rawText: "Ranged Laser Pistol +14, range 40 feet, damage 1d6 fire",
    }],
    spellcasting: [{
      tradition: "occult",
      method: "prepared",
      dc: 24,
      attackModifier: 14,
      entries: [{ rank: "1st", spells: ["Daze"], uses: null, frequency: null, notes: "" }],
      notes: "",
    }],
    specialAbilities: [{
      section: "defensive",
      name: "Reactive Strike",
      activation: "reaction",
      actionCost: "reaction",
      traits: [],
      frequency: null,
      trigger: "A creature leaves a square within reach.",
      requirements: null,
      area: null,
      save: null,
      cooldown: null,
      effect: "Make a melee Strike.",
      rawText: "",
    }],
  });

  return {
    name: "Corpse Fleet Officer",
    player_description: "A bold combat leader.",
    player_description_is_markdown: false,
    level: 4,
    size: "medium",
    rarity: "common",
    traits: ["skeleton", "undead", "unholy"],
    stat_block: statBlock,
    campaign_id: "private-campaign-id",
    gm_notes_markdown: "Do not export this secret.",
    ...overrides,
  };
}

function makeMeatloafStatBlock(): EnemyStatBlockV1 {
  const base = makeEnemy().stat_block!;
  return enemyStatBlockSchema.parse({
    ...base,
    perception: { ...base.perception, senses: [{ name: "normal vision", range: null, notes: "" }] },
    abilityModifiers: { strength: 4, dexterity: 1, constitution: 4, intelligence: 0, wisdom: 1, charisma: 5 },
    items: ["butcher's cleaver", "bloodstained microphone", "reinforced stage coat", "cheap synth-whiskey flask"],
    defenses: {
      ...base.defenses,
      armorClass: 23,
      hitPoints: [{ label: "HP", value: 95, notes: "" }],
      immunities: [],
      resistances: ["physical 5 except silver"],
      weaknesses: [],
    },
    movement: [{ mode: "land", speed: "25 feet", notes: "Moves with a heavy, deliberate stride." }],
    strikes: [
      {
        category: "melee",
        name: "butcher's cleaver",
        activation: "action",
        attackModifier: 15,
        multipleAttackPenalty: [-5, -10],
        traits: ["sweep", "reach-5"],
        reach: "5 feet",
        range: null,
        damage: [{ formula: "2d8+6", type: "slashing", notes: "" }],
        rider: "On a critical hit, the target is off-guard until the end of Meatloaf's next turn.",
        rawText: "Melee butcher's cleaver +15 (sweep), Damage 2d8+6 slashing",
      },
      {
        category: "melee",
        name: "jaws",
        activation: "action",
        attackModifier: 14,
        multipleAttackPenalty: [-5, -10],
        traits: ["grapple", "reach-5"],
        reach: "5 feet",
        range: null,
        damage: [{ formula: "2d10+6", type: "piercing", notes: "" }],
        rider: "If the target is fascinated, grabbed, or off-guard, Meatloaf can use Cannibal's Feast.",
        rawText: "Melee jaws +14 (grapple), Damage 2d10+6 piercing",
      },
      {
        category: "ranged",
        name: "thrown microphone stand",
        activation: "action",
        attackModifier: 13,
        multipleAttackPenalty: [-5, -10],
        traits: ["thrown-20-ft"],
        reach: null,
        range: "20 feet",
        damage: [{ formula: "2d6+4", type: "bludgeoning", notes: "" }],
        rider: "",
        rawText: "Ranged thrown microphone stand +13 (thrown 20 ft.), Damage 2d6+4 bludgeoning",
      },
      {
        category: "ranged",
        name: "bone shard spit",
        activation: "action",
        attackModifier: 13,
        multipleAttackPenalty: [-5, -10],
        traits: ["range-30-ft"],
        reach: null,
        range: "30 feet",
        damage: [{ formula: "2d6+4", type: "piercing", notes: "" }],
        rider: "",
        rawText: "Ranged bone shard spit +13 (range 30 ft.), Damage 2d6+4 piercing",
      },
    ],
  });
}

describe("buildFoundryNpcActor", () => {
  it("maps core enemy stats and ranged strikes into an SF2e NPC actor", () => {
    const result = buildFoundryNpcActor(makeEnemy(), { idFactory: idFactory() });

    expect(result.errors).toEqual([]);
    expect(result.actor).not.toBeNull();
    expect(result.actor?.type).toBe("npc");
    expect(result.actor?.img).toBe("systems/sf2e/icons/default-icons/npc.svg");

    const system = result.actor?.system as {
      abilities: Record<string, { mod: number }>;
      attributes: {
        ac: { value: number };
        hp: { value: number; max: number };
        resistances: { type: string; value: number }[];
        speed: { value: number };
      };
      details: { privateNotes: string; level: { value: number } };
      perception: { mod: number; senses: { type: string }[] };
      saves: { fortitude: { value: number }; reflex: { value: number }; will: { value: number } };
      traits: { rarity: string; size: { value: string }; value: string[] };
    };
    expect(system.abilities.str).toEqual({ mod: 4 });
    expect(system.attributes.ac.value).toBe(21);
    expect(system.attributes.hp).toMatchObject({ value: 55, max: 55 });
    expect(system.attributes.resistances).toEqual([{ type: "cold", value: 5 }]);
    expect(system.attributes.speed.value).toBe(25);
    expect(system.details.level.value).toBe(4);
    expect(system.details.privateNotes).toBe("");
    expect(system.perception).toMatchObject({ mod: 8, senses: [{ type: "darkvision" }] });
    expect(system.saves).toEqual({
      fortitude: { value: 11, saveDetail: "" },
      reflex: { value: 12, saveDetail: "" },
      will: { value: 8, saveDetail: "" },
    });
    expect(system.traits).toEqual({
      rarity: "common",
      size: { value: "med" },
      value: ["skeleton", "undead", "unholy"],
    });

    const strike = result.actor?.items.find((item) => item.name === "Laser Pistol");
    expect(strike?.type).toBe("melee");
    expect(strike?.system).toMatchObject({
      action: "strike",
      bonus: { value: 14 },
      range: { increment: 40, max: null },
      damageRolls: { "0000000000000000": { damage: "1d6", damageType: "fire" } },
    });
    expect(result.actor?.prototypeToken).toMatchObject({ width: 1, height: 1 });
    expect(JSON.stringify(result.actor)).not.toContain("private-campaign-id");
    expect(JSON.stringify(result.actor)).not.toContain("Do not export this secret.");
  });

  it("preserves spell and ability text while warning that it is not automated", () => {
    const result = buildFoundryNpcActor(makeEnemy(), { idFactory: idFactory() });

    const spellGroup = result.actor?.items.find((item) => item.name === "occult prepared spells");
    expect(spellGroup?.type).toBe("action");
    expect((spellGroup?.system.description as { value: string }).value).toContain("1st: Daze");
    expect(result.actor?.items.some((item) => item.name === "Reactive Strike" && item.type === "action")).toBe(true);
    expect(result.warnings.map((entry) => entry.code)).toContain("spellcasting-text-only");
    expect(result.warnings.map((entry) => entry.code)).toContain("ability-rules-not-automated");
    expect(result.actor?.items.find((item) => item.name === "Reactive Strike")?.system).toMatchObject({
      actionType: { value: "reaction" },
      actions: { value: null },
    });
  });

  it("blocks export when the enemy has no valid stat block", () => {
    const result = buildFoundryNpcActor(makeEnemy({ stat_block: null }), { idFactory: idFactory() });

    expect(result.actor).toBeNull();
    expect(result.errors).toContain("Enemy needs a complete stat block with positive AC and at least one positive HP pool.");
  });

  it("does not mistake line-of-sight text for an area attack", () => {
    const source = makeEnemy();
    const statBlock = source.stat_block!;
    const result = buildFoundryNpcActor({
      ...source,
      stat_block: {
        ...statBlock,
        strikes: [{ ...statBlock.strikes[0], rawText: "The laser has a clear line of sight." }],
      },
    }, { idFactory: idFactory() });

    expect(result.actor?.items.find((item) => item.name === "Laser Pistol")?.type).toBe("melee");
    expect(result.warnings.map((entry) => entry.code)).not.toContain("area-attack-text-only");
  });

  it("preserves unsupported ability activations as text without inventing traits", () => {
    const source = makeEnemy();
    const statBlock = source.stat_block!;
    const result = buildFoundryNpcActor({
      ...source,
      stat_block: {
        ...statBlock,
        specialAbilities: [{
          ...statBlock.specialAbilities[0],
          activation: "other",
          actionCost: "when struck",
        }],
      },
    }, { idFactory: idFactory() });
    const ability = result.actor?.items.find((item) => item.name === "Reactive Strike");

    expect((ability?.system.description as { value: string }).value).toContain("Activation: when struck");
    expect((ability?.system.traits as { value: string[] }).value).not.toContain("star-board-unmapped-activation");
    expect(result.warnings.map((entry) => entry.code)).toContain("unknown-activation");
  });

  it("maps Meatloaf's native MAP, range annotations, physical resistance, and standard vision", () => {
    const result = buildFoundryNpcActor(makeEnemy({
      name: "Meatloaf",
      level: 6,
      traits: ["humanoid", "human"],
      stat_block: makeMeatloafStatBlock(),
    }), { idFactory: idFactory() });

    const cleaver = result.actor?.items.find((item) => item.name === "butcher's cleaver");
    const jaws = result.actor?.items.find((item) => item.name === "jaws");
    const microphone = result.actor?.items.find((item) => item.name === "thrown microphone stand");
    const boneSpit = result.actor?.items.find((item) => item.name === "bone shard spit");

    expect(cleaver?.system).toMatchObject({ bonus: { value: 15 }, range: null, traits: { value: ["sweep"] } });
    expect(jaws?.system).toMatchObject({ bonus: { value: 14 }, range: null, traits: { value: ["grapple"] } });
    expect(microphone?.system).toMatchObject({
      bonus: { value: 13 },
      range: { increment: 20, max: null },
      traits: { value: ["thrown-20"] },
    });
    expect(boneSpit?.system).toMatchObject({
      bonus: { value: 13 },
      range: { increment: 30, max: null },
      traits: { value: [] },
    });

    const system = result.actor?.system as {
      attributes: { resistances: { type: string; value: number; exceptions: string[] }[] };
      perception: { senses: { type: string }[]; vision: boolean };
    };
    expect(system.attributes.resistances).toEqual([{ type: "physical", value: 5, exceptions: ["silver"] }]);
    expect(system.perception).toMatchObject({ senses: [], vision: true });
    expect(result.warnings.filter((entry) => entry.code === "map-preserved-as-text")).toEqual([]);
    expect(result.warnings.map((entry) => entry.code)).not.toContain("range-kind-unconfirmed");
    expect(result.warnings.map((entry) => entry.code)).not.toContain("unmapped-resistance");
    expect(result.warnings.map((entry) => entry.code)).toContain("strike-rules-not-automated");
    expect(result.warnings.find((entry) => entry.code === "strike-rules-not-automated")?.message).not.toContain("MAP");
  });

  it("warns once when recorded MAP disagrees with native Foundry MAP", () => {
    const source = makeEnemy();
    const statBlock = source.stat_block!;
    const result = buildFoundryNpcActor({
      ...source,
      stat_block: {
        ...statBlock,
        strikes: [{ ...statBlock.strikes[0], multipleAttackPenalty: [-4, -8] }],
      },
    }, { idFactory: idFactory() });

    expect(result.warnings.filter((entry) => entry.code === "map-preserved-as-text")).toHaveLength(1);
    expect(result.warnings.map((entry) => entry.code)).not.toContain("strike-rules-not-automated");
    expect(result.warnings.find((entry) => entry.code === "map-preserved-as-text")?.message).toContain("Foundry's native -5 / -10 MAP");
    expect(result.actor?.items.find((item) => item.name === "Laser Pistol")?.system).toMatchObject({ subjectToMAP: true });
  });

  it("accepts native agile MAP when the strike has the agile trait", () => {
    const source = makeEnemy();
    const statBlock = source.stat_block!;
    const result = buildFoundryNpcActor({
      ...source,
      stat_block: {
        ...statBlock,
        strikes: [{ ...statBlock.strikes[0], multipleAttackPenalty: [-4, -8], traits: ["agile"] }],
      },
    }, { idFactory: idFactory() });

    expect(result.warnings.map((entry) => entry.code)).not.toContain("map-preserved-as-text");
    expect(result.actor?.items.find((item) => item.name === "Laser Pistol")?.system).toMatchObject({
      subjectToMAP: true,
      traits: { value: ["agile"] },
    });
  });

  it("exports formatted public Markdown without app links, images, HTML, or Foundry commands", () => {
    const result = buildFoundryNpcActor(makeEnemy({
      player_description_is_markdown: true,
      player_description: "**Meatloaf** performs.\n\n- Sings\n- Fights\n\n[Campaign note](/campaigns/private/notes) [Unsafe](javascript:alert(1))\n\n![Portrait](https://example.com/portrait.png)\n\n@Damage[99[fire]] <script>alert('x')</script>",
    }), { idFactory: idFactory() });
    const system = result.actor?.system as { details: { publicNotes: string } };
    const publicNotes = system.details.publicNotes;

    expect(publicNotes).toContain("<strong>Meatloaf</strong>");
    expect(publicNotes).toContain("<ul>");
    expect(publicNotes).toContain("Sings");
    expect(publicNotes).not.toContain("/campaigns/private/notes");
    expect(publicNotes).not.toContain("javascript:");
    expect(publicNotes).not.toContain("<img");
    expect(publicNotes).not.toContain("<script");
    expect(publicNotes).not.toContain("@Damage[");
    expect(publicNotes).toContain("&#64;Damage[");
    expect(result.warnings.map((entry) => entry.code)).not.toContain("description-markdown-plain-text");
  });
});