import { describe, expect, it } from "vitest";
import { campaignArtKindSchema } from "@/lib/validation/art";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";
import {
  createEnemySchema,
  enemyAiDraftSchema,
  enemyImportPreviewSchema,
  enemyStatBlockSchema,
} from "@/lib/validation/enemy";

const campaignId = "00000000-0000-4000-8000-000000000001";
const enemyId = "00000000-0000-4000-8000-000000000002";
const sourceSnapshot = {
  provider: "aon" as const,
  system: "Starfinder 2e",
  externalId: 1234,
  canonicalUrl: "https://2e.aonsrd.com/creatures/1234-test-creature",
  sourceTitle: "Test Creature",
  sourcePage: "Archives of Nethys",
  rulesStatus: "legacy",
  parserVersion: "aon-v1",
  schemaVersion: 1 as const,
  retrievedAt: "2026-08-23T12:00:00.000Z",
  contentHash: "a".repeat(64),
  parsedPayload: {
    name: "Test Creature",
    level: 5,
    size: "medium" as const,
    rarity: "common" as const,
    traits: ["humanoid", "soldier"],
    family: null,
    statBlock: {
      schemaVersion: 1 as const,
      recallKnowledge: null,
      perception: { modifier: 12, senses: [{ name: "darkvision", range: null, notes: "" }], notes: "" },
      languages: { names: ["Common"], additionalCount: 0, communicationNotes: "" },
      skills: [{ name: "Athletics", modifier: 14, notes: "" }],
      abilityModifiers: { strength: 4, dexterity: 3, constitution: 3, intelligence: 1, wisdom: 2, charisma: 0 },
      items: [],
      defenses: {
        armorClass: 22,
        armorClassNotes: "",
        saves: {
          fortitude: { modifier: 13, notes: "" },
          reflex: { modifier: 11, notes: "" },
          will: { modifier: 9, notes: "" },
        },
        hitPoints: [{ label: "HP", value: 100, notes: "" }],
        immunities: [],
        resistances: [],
        weaknesses: [],
        notes: "",
      },
      movement: [{ mode: "land", speed: "25 feet", notes: "" }],
      strikes: [],
      spellcasting: [],
      specialAbilities: [],
      unparsedFragments: [],
    },
  },
};

const statBlock = sourceSnapshot.parsedPayload.statBlock;

describe("enemy validation contracts", () => {
  it("accepts enemy as a campaign artwork target", () => {
    expect(campaignArtKindSchema.parse("enemy")).toBe("enemy");
  });

  it("accepts enemy as an asynchronous image-generation target", () => {
    const input = imageGenerationInputSchema.safeParse({
      campaignId,
      mode: "create",
      targetKind: "enemy",
      subject: "A plated void predator",
    });

    expect(input.success).toBe(true);
    expect(imageDraftSchema.safeParse({
      generationRunId: enemyId,
      targetKind: "enemy",
      mode: "create",
      subject: "A plated void predator",
      aspectRatio: "1:1",
      size: "1024x1024",
      prompt: "A plated void predator",
      image: { base64: "aW1hZ2U=", url: null, mediaType: "image/png" },
      provider: "openrouter",
      model: "openai/gpt-image-1",
      createdAt: "2026-08-23T12:00:00.000Z",
    }).success).toBe(true);
  });

  it("parses a complete stat block with repeated mechanics", () => {
    const result = enemyStatBlockSchema.parse({
      ...statBlock,
      strikes: [{
        category: "ranged",
        name: "ion rifle",
        activation: null,
        attackModifier: 15,
        multipleAttackPenalty: [10, 5],
        traits: ["射程"],
        reach: null,
        range: "100 feet",
        damage: [{ formula: "2d8+4", type: "electricity", notes: "" }],
        rider: "The target is dazzled.",
        rawText: "",
      }],
      spellcasting: [{
        tradition: "occult",
        method: "innate",
        dc: 22,
        attackModifier: 14,
        entries: [{ rank: "at will", spells: ["mindlink"], uses: null, frequency: null, notes: "" }],
        notes: "",
      }],
      specialAbilities: [{
        section: "offensive",
        name: "Overcharge",
        activation: "two-actions",
        actionCost: "2",
        traits: ["electricity"],
        frequency: null,
        trigger: null,
        requirements: null,
        area: null,
        save: null,
        cooldown: null,
        effect: "The rifle deals extra damage.",
        rawText: "",
      }],
    });

    expect(result.strikes).toHaveLength(1);
    expect(result.spellcasting[0].entries[0].spells).toEqual(["mindlink"]);
    expect(result.specialAbilities[0].actionCost).toBe("2");
  });

  it("fills deterministic empty collections and nullable sections", () => {
    const result = enemyStatBlockSchema.parse({ schemaVersion: 1 });

    expect(result.recallKnowledge).toBeNull();
    expect(result.perception.senses).toEqual([]);
    expect(result.defenses.hitPoints).toEqual([]);
    expect(result.strikes).toEqual([]);
    expect(result.spellcasting).toEqual([]);
    expect(result.specialAbilities).toEqual([]);
  });

  it("rejects duplicate traits and out-of-range enemy levels", () => {
    const result = createEnemySchema.safeParse({
      name: "Overgrown Sentinel",
      level: 26,
      size: "large",
      rarity: "common",
      traits: ["plant", "Plant"],
      statBlock,
      sourceSnapshot,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("level"))).toBe(true);
      expect(result.error.issues.some((issue) => issue.path.includes("traits"))).toBe(true);
    }
  });

  it("requires a complete structured draft from enemy AI", () => {
    const result = enemyAiDraftSchema.safeParse({
      name: "Test Creature",
      playerDescription: "A dangerous patrol construct.",
      level: 5,
      size: "medium",
      rarity: "common",
      traits: ["construct"],
      family: null,
      statBlock,
      gmNotesMarkdown: "It protects the sealed hatch.",
      artSubject: "A patrol construct in a dim starship corridor.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects AI-origin records without core defenses", () => {
    const result = createEnemySchema.safeParse({
      name: "Incomplete Construct",
      playerDescription: "A construct awaiting a complete stat block.",
      level: 5,
      size: "medium",
      rarity: "common",
      traits: ["construct"],
      family: null,
      statBlock: { schemaVersion: 1 },
      gmNotesMarkdown: "",
      origin: "ai",
      sourceSnapshot: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "statBlock")).toBe(true);
  });

  it("requires import previews to identify the campaign and source", () => {
    const result = enemyImportPreviewSchema.safeParse({
      campaignId,
      draft: {
        name: "Test Creature",
        playerDescription: "",
        level: 5,
        size: "medium",
        rarity: "common",
        traits: ["humanoid"],
        family: null,
        statBlock,
        gmNotesMarkdown: "",
        artSubject: "",
      },
      sourceSnapshot,
      warnings: [],
      existingEnemyId: enemyId,
      existingSourceHash: sourceSnapshot.contentHash,
      differences: [{ section: "defenses", status: "changed", summary: "Hit points changed." }],
    });

    expect(result.success).toBe(true);
  });
});