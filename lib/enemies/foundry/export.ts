import { randomBytes } from "node:crypto";
import type { ApiEnemy } from "@/lib/campaign/types";
import type { EnemyStatBlockV1 } from "@/lib/enemies/types";
import { renderFoundryMarkdown } from "@/lib/enemies/foundry/markdown";
import { completeEnemyStatBlockSchema } from "@/lib/validation/enemy";

const NPC_IMAGE = "systems/sf2e/icons/default-icons/npc.svg";
const MELEE_IMAGE = "systems/sf2e/icons/default-icons/melee.svg";
const PASSIVE_IMAGE = "systems/sf2e/icons/actions/Passive.webp";
const ACTION_IMAGE_BY_COUNT: Record<number, string> = {
  1: "systems/sf2e/icons/actions/OneAction.webp",
  2: "systems/sf2e/icons/actions/TwoActions.webp",
  3: "systems/sf2e/icons/actions/ThreeActions.webp",
};
const SIZE_ID: Record<NonNullable<ApiEnemy["size"]>, string> = {
  tiny: "tiny",
  small: "sm",
  medium: "med",
  large: "lg",
  huge: "huge",
  gargantuan: "grg",
};
const TOKEN_DIMENSION: Record<NonNullable<ApiEnemy["size"]>, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};
const ABILITY_ID: Record<keyof EnemyStatBlockV1["abilityModifiers"], string> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};
const MOVEMENT_MODES = new Set(["burrow", "climb", "fly", "hover", "swim"]);
const THROWN_TRAIT_RANGES = new Set([10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 200]);
const NPC_REACH_TRAITS = new Set([0, 10, 15, 20, 25, 30, 40, 50, 60, 100, 120, 200, 1000]);

type FoundryItem = {
  _id: string;
  img: string;
  name: string;
  sort: number;
  system: Record<string, unknown>;
  type: "action" | "lore" | "melee";
  effects: [];
  folder: null;
  flags: Record<string, unknown>;
  ownership: { default: 0 };
};

export type FoundryNpcActor = {
  img: string;
  items: FoundryItem[];
  name: string;
  system: Record<string, unknown>;
  type: "npc";
  effects: [];
  flags: Record<string, unknown>;
  ownership: { default: 0 };
  prototypeToken: Record<string, unknown>;
};

export type FoundryExportWarning = {
  code: string;
  message: string;
  path?: string;
};

export type FoundryNpcBuildResult = {
  actor: FoundryNpcActor | null;
  errors: string[];
  warnings: FoundryExportWarning[];
};

type FoundryEnemyInput = Pick<
  ApiEnemy,
  | "name"
  | "player_description"
  | "player_description_is_markdown"
  | "level"
  | "size"
  | "rarity"
  | "traits"
  | "stat_block"
>;

type IdFactory = () => string;
type CompleteStatBlock = ReturnType<typeof completeEnemyStatBlockSchema.parse>;

function createFoundryId(): string {
  return randomBytes(8).toString("hex");
}

function toSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(lines: string[]): string {
  return lines.filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
}

function warning(
  warnings: FoundryExportWarning[],
  code: string,
  message: string,
  path?: string,
): void {
  if (warnings.some((entry) => entry.code === code && entry.path === path)) return;
  warnings.push({ code, message, ...(path ? { path } : {}) });
}

function parsePositiveInteger(value: string): number | null {
  const match = value.trim().match(/^(\d+)\s*(?:feet|foot|ft)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDamageAmount(value: string): { type: string; value: number; exceptions?: string[] } | null {
  const normalized = value.trim();
  const typeThenValue = normalized.match(/^([a-z][a-z0-9-]*)\s+(\d+)(?:\s+except\s+([a-z][a-z0-9-]*))?$/i);
  const valueThenType = normalized.match(/^(\d+)\s+([a-z][a-z0-9-]*)(?:\s+except\s+([a-z][a-z0-9-]*))?$/i);
  const match = typeThenValue
    ? { type: typeThenValue[1], amount: typeThenValue[2], exception: typeThenValue[3] }
    : valueThenType
      ? { type: valueThenType[2], amount: valueThenType[1], exception: valueThenType[3] }
      : null;
  if (!match) return null;
  const amount = Number(match.amount);
  const type = toSlug(match.type);
  const exception = match.exception ? toSlug(match.exception) : "";
  if (!Number.isSafeInteger(amount) || amount <= 0 || !type || (match.exception && !exception)) return null;
  return {
    type,
    value: amount,
    ...(exception ? { exceptions: [exception] } : {}),
  };
}

function hasNativeMultipleAttackPenalty(strike: CompleteStatBlock["strikes"][number]): boolean {
  if (strike.multipleAttackPenalty.length === 0) return true;
  const expected = strike.traits.some((trait) => toSlug(trait) === "agile") ? [-4, -8] : [-5, -10];
  return strike.multipleAttackPenalty.length === expected.length
    && strike.multipleAttackPenalty.every((penalty, index) => penalty === expected[index]);
}

function isFoundryRangeIncrement(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 5 && value <= 500 && value % 5 === 0;
}

function createItem(
  id: string,
  name: string,
  type: FoundryItem["type"],
  img: string,
  system: Record<string, unknown>,
  sort: number,
): FoundryItem {
  return {
    _id: id,
    img,
    name,
    sort,
    system,
    type,
    effects: [],
    folder: null,
    flags: {},
    ownership: { default: 0 },
  };
}

function createTextAction(
  id: string,
  name: string,
  text: string[],
  sort: number,
  category: "defensive" | "interaction" | "offensive" = "interaction",
): FoundryItem {
  return createItem(id, name, "action", PASSIVE_IMAGE, {
    actionType: { value: "passive" },
    actions: { value: null },
    category,
    description: { value: paragraphs(text), gm: "" },
    publication: { license: "", remaster: false, title: "", authors: "" },
    rules: [],
    slug: toSlug(name) || null,
    traits: { value: [], otherTags: [] },
  }, sort);
}

function createAbilityItem(
  id: string,
  ability: CompleteStatBlock["specialAbilities"][number],
  sort: number,
  warnings: FoundryExportWarning[],
): FoundryItem {
  let actionType: "action" | "free" | "passive" | "reaction" = "passive";
  let actions: number | null = null;
  let image = PASSIVE_IMAGE;
  let activationIsMapped = true;

  if (ability.activation === "reaction") {
    actionType = "reaction";
    image = "systems/sf2e/icons/actions/Reaction.webp";
  } else if (ability.activation === "free-action") {
    actionType = "free";
    image = "systems/sf2e/icons/actions/FreeAction.webp";
  } else if (ability.activation === "one-action") {
    actionType = "action";
    actions = 1;
  } else if (ability.activation === "two-actions") {
    actionType = "action";
    actions = 2;
  } else if (ability.activation === "three-actions") {
    actionType = "action";
    actions = 3;
  } else if (ability.activation === "other") {
    const actionCost = ability.actionCost?.match(/^([1-3])(?: actions?)?$/i)?.[1];
    if (actionCost) {
      actionType = "action";
      actions = Number(actionCost);
    } else {
      activationIsMapped = false;
      warning(warnings, "unknown-activation", `The activation for ${ability.name} is preserved as text.`, `specialAbilities.${ability.name}`);
    }
  }
  if (actions !== null) image = ACTION_IMAGE_BY_COUNT[actions] ?? PASSIVE_IMAGE;

  const traits = ability.traits.map(toSlug).filter(Boolean);
  if (ability.activation === "aura" && !traits.includes("aura")) traits.push("aura");
  const description = [
    !activationIsMapped ? `Activation: ${ability.actionCost ?? ability.activation}` : "",
    ability.activation === "aura" ? "Activation: aura" : "",
    ability.trigger ? `Trigger: ${ability.trigger}` : "",
    ability.requirements ? `Requirements: ${ability.requirements}` : "",
    ability.frequency ? `Frequency: ${ability.frequency}` : "",
    ability.area ? `Area: ${ability.area}` : "",
    ability.save ? `Save: ${ability.save}` : "",
    ability.cooldown ? `Cooldown: ${ability.cooldown}` : "",
    ability.effect || ability.rawText,
  ];

  return createItem(id, ability.name, "action", image, {
    actionType: { value: actionType },
    actions: { value: actions },
    category: ability.section === "general" ? "interaction" : ability.section,
    description: { value: paragraphs(description), gm: "" },
    publication: { license: "", remaster: false, title: "", authors: "" },
    rules: [],
    slug: toSlug(ability.name) || null,
    traits: { value: [...new Set(traits)], otherTags: [] },
  }, sort);
}

function addLoreItem(
  items: FoundryItem[],
  idFactory: IdFactory,
  name: string,
  modifier: number,
  sort: number,
): void {
  items.push(createItem(idFactory(), name, "lore", "systems/sf2e/icons/default-icons/lore.svg", {
    description: { value: "", gm: "" },
    rules: [],
    slug: toSlug(name) || null,
    traits: { otherTags: [] },
    publication: { license: "", remaster: false, title: "", authors: "" },
    mod: { value: modifier },
    proficient: { value: 0 },
  }, sort));
}

function makeStrikeItem(
  idFactory: IdFactory,
  strike: CompleteStatBlock["strikes"][number],
  listedItems: Set<string>,
  sort: number,
  warnings: FoundryExportWarning[],
): FoundryItem {
  const isAreaAttack = /\barea[- ]fire\b|\b\d+[- ]foot\s+(?:cone|burst|line)\b|\b(?:cone|burst|line)\s+\d+\s*(?:feet|ft)\b/i.test(`${strike.name} ${strike.rawText}`);
  if (isAreaAttack) {
    warning(warnings, "area-attack-text-only", `${strike.name} is retained as text because its area mechanics are not structured.`, `strikes.${strike.name}`);
    return createTextAction(idFactory(), strike.name, [
      strike.rawText,
      `Attack modifier: +${strike.attackModifier}`,
      ...strike.damage.map((part) => `Damage: ${part.formula} ${part.type}${part.notes ? ` (${part.notes})` : ""}`),
      strike.rider ? `Rider: ${strike.rider}` : "",
      strike.range ? `Range: ${strike.range}` : "",
      strike.reach ? `Reach: ${strike.reach}` : "",
    ], sort, "offensive");
  }

  const description: string[] = [];
  const traits: string[] = [];
  const unmappedTraits: string[] = [];
  let thrownIncrement: number | null = null;
  let annotatedRangeIncrement: number | null = null;
  for (const trait of strike.traits) {
    const slug = toSlug(trait);
    const annotatedRange = slug.match(/^(thrown|range)-(\d+)(?:-(?:ft|feet|foot))?$/);
    if (annotatedRange) {
      const distance = Number(annotatedRange[2]);
      if (annotatedRange[1] === "thrown" && THROWN_TRAIT_RANGES.has(distance)) {
        traits.push(`thrown-${distance}`);
        thrownIncrement = distance;
      } else if (annotatedRange[1] === "range" && isFoundryRangeIncrement(distance)) {
        annotatedRangeIncrement = distance;
      } else {
        unmappedTraits.push(trait);
      }
      continue;
    }
    if (slug === "reach-5") continue;
    if (slug) traits.push(slug);
  }
  const reach = strike.reach ? parsePositiveInteger(strike.reach) : null;
  if (strike.reach && reach === null) {
    warning(warnings, "unmapped-reach", `The reach for ${strike.name} is retained as text.`, `strikes.${strike.name}.reach`);
    description.push(`Reach: ${strike.reach}`);
  } else if (reach !== null && reach !== 5 && NPC_REACH_TRAITS.has(reach)) {
    traits.push(`reach-${reach}`);
  } else if (reach !== null && reach !== 5) {
    warning(warnings, "unmapped-reach", `The reach for ${strike.name} is retained as text because ${reach} feet is not a supported SF2e NPC reach trait.`, `strikes.${strike.name}.reach`);
    description.push(`Reach: ${strike.reach}`);
  }
  for (const trait of unmappedTraits) {
    warning(warnings, "unmapped-strike-trait", `The ${trait} trait on ${strike.name} is not supported and is retained as text.`, `strikes.${strike.name}.traits`);
    description.push(`Trait: ${trait}`);
  }

  let range: Record<string, number | null> | null = null;
  const rangeValue = strike.range ? parsePositiveInteger(strike.range) : null;
  if (thrownIncrement !== null && annotatedRangeIncrement !== null && thrownIncrement !== annotatedRangeIncrement) {
    warning(warnings, "range-trait-conflict", `The thrown and range traits for ${strike.name} specify different increments; the thrown trait's ${thrownIncrement}-foot increment is used.`, `strikes.${strike.name}.range`);
  }
  const traitRangeIncrement = thrownIncrement ?? annotatedRangeIncrement;
  if (traitRangeIncrement !== null) {
    range = { increment: traitRangeIncrement, max: null };
    if (strike.range && rangeValue !== traitRangeIncrement) {
      warning(warnings, "range-trait-conflict", `The range text for ${strike.name} does not match its ${traitRangeIncrement}-foot range trait; the trait is used.`, `strikes.${strike.name}.range`);
      description.push(`Recorded range: ${strike.range}`);
    }
  } else if (strike.category === "ranged" && strike.range) {
    if (rangeValue === null) {
      warning(warnings, "unmapped-range", `The range for ${strike.name} is retained as text.`, `strikes.${strike.name}.range`);
      description.push(`Range: ${strike.range}`);
    } else if (listedItems.has(normalizeName(strike.name))) {
      range = { increment: rangeValue, max: null };
    } else {
      range = { increment: null, max: rangeValue };
      warning(warnings, "range-kind-unconfirmed", `The range for ${strike.name} is treated as a maximum because no matching item is listed.`, `strikes.${strike.name}.range`);
    }
  }

  const damageRolls: Record<string, Record<string, string | null>> = {};
  for (const [index, damage] of strike.damage.entries()) {
    const validFormula = /^(?:\d+)?d\d+(?:\s*[+-]\s*(?:(?:\d+)?d\d+|\d+))*$/i.test(damage.formula.trim());
    const damageType = toSlug(damage.type);
    if (!validFormula || !damageType) {
      warning(warnings, "unmapped-damage", `A damage component for ${strike.name} is retained as text, not made rollable.`, `strikes.${strike.name}.damage.${index}`);
      description.push(`Damage: ${damage.formula} ${damage.type}`.trim());
    } else {
      damageRolls[idFactory()] = {
        damage: damage.formula.trim(),
        damageType,
        category: null,
      };
    }
    if (damage.notes) description.push(`Damage notes: ${damage.notes}`);
  }
  if (strike.rider) description.push(`Rider: ${strike.rider}`);
  if (strike.activation) description.push(`Activation: ${strike.activation}`);
  if (strike.multipleAttackPenalty.length && !hasNativeMultipleAttackPenalty(strike)) {
    description.push(`Multiple attack penalty: ${strike.multipleAttackPenalty.join(" / ")}`);
    const nativeMap = strike.traits.some((trait) => toSlug(trait) === "agile") ? "-4 / -8" : "-5 / -10";
    warning(warnings, "map-preserved-as-text", `The recorded multiple attack penalty for ${strike.name} differs from Foundry's native ${nativeMap} MAP and is preserved as text; Foundry will still use its native MAP.`, `strikes.${strike.name}.multipleAttackPenalty`);
  }
  if (strike.rawText) description.push(`Source statblock: ${strike.rawText}`);

  return createItem(idFactory(), strike.name, "melee", MELEE_IMAGE, {
    action: "strike",
    area: null,
    attackEffects: { value: [] },
    bonus: { value: strike.attackModifier },
    damageRolls,
    description: { value: paragraphs(description), gm: "" },
    publication: { license: "", remaster: false, title: "", authors: "" },
    range,
    rules: [],
    slug: toSlug(strike.name) || null,
    subjectToMAP: true,
    traits: { config: {}, value: [...new Set(traits)], otherTags: [] },
  }, sort);
}

function mapDamageEntries(
  values: string[],
  property: "immunities" | "resistances" | "weaknesses",
  warnings: FoundryExportWarning[],
): Record<string, unknown>[] {
  const mapped: Record<string, unknown>[] = [];
  for (const [index, value] of values.entries()) {
    if (property === "immunities") {
      const type = toSlug(value);
      if (type) mapped.push({ type });
      else warning(warnings, "unmapped-immunity", "An immunity could not be mapped and is retained in the export notes.", `${property}.${index}`);
      continue;
    }

    const amount = parseDamageAmount(value);
    if (amount) mapped.push(amount);
    else warning(warnings, `unmapped-${property}`, `“${value}” is retained in the export notes because its ${property.slice(0, -1)} value is ambiguous.`, `${property}.${index}`);
  }
  return mapped;
}

function makeActor(
  enemy: FoundryEnemyInput,
  statBlock: CompleteStatBlock,
  idFactory: IdFactory,
  warnings: FoundryExportWarning[],
): FoundryNpcActor {
  const items: FoundryItem[] = [];
  const extraNotes: string[] = [];
  const skills: Record<string, { base: number }> = {};
  const equipmentNames = new Set(statBlock.items.map(normalizeName));
  let sort = 100000;
  const nextSort = () => {
    const value = sort;
    sort += 100000;
    return value;
  };

  for (const strike of statBlock.strikes) {
    items.push(makeStrikeItem(idFactory, strike, equipmentNames, nextSort(), warnings));
  }
  if (statBlock.strikes.some((strike) => strike.rider || strike.damage.some((part) => part.notes))) {
    warning(warnings, "strike-rules-not-automated", "Custom strike riders and damage notes are preserved as text; their rules are not automatically applied.", "strikes");
  }

  for (const ability of statBlock.specialAbilities) {
    items.push(createAbilityItem(idFactory(), ability, nextSort(), warnings));
  }
  if (statBlock.specialAbilities.length) {
    warning(warnings, "ability-rules-not-automated", "Special abilities are preserved as actions; their effects are not automatically applied.", "specialAbilities");
  }

  if (statBlock.items.length) {
    items.push(createTextAction(idFactory(), "Equipment", statBlock.items, nextSort()));
    warning(warnings, "equipment-text-only", "Equipment names are preserved as text; native equipment and weapon links are not generated.", "items");
  }

  for (const [index, spellcasting] of statBlock.spellcasting.entries()) {
    const lines = [
      `${spellcasting.tradition} ${spellcasting.method} spellcasting`,
      spellcasting.dc === null ? "" : `Spell DC ${spellcasting.dc}`,
      spellcasting.attackModifier === null ? "" : `Spell attack +${spellcasting.attackModifier}`,
      ...spellcasting.entries.map((entry) => {
        const details = [`${entry.rank}: ${entry.spells.join(", ")}`];
        if (entry.uses) details.push(`uses ${entry.uses}`);
        if (entry.frequency) details.push(entry.frequency);
        if (entry.notes) details.push(entry.notes);
        return details.join("; ");
      }),
      spellcasting.notes,
    ];
    const entryLabel = `${spellcasting.tradition} ${spellcasting.method} spells`;
    items.push(createTextAction(idFactory(), entryLabel, lines, nextSort()));
    warning(warnings, "spellcasting-text-only", "Spell lists are preserved as text; spells, slots, and casting resources are not automated.", `spellcasting.${index}`);
  }

  for (const skill of statBlock.skills) {
    const loreMatch = skill.name.match(/^(.+?)\s+Lore$/i);
    if (loreMatch) {
      addLoreItem(items, idFactory, skill.name, skill.modifier, nextSort());
      continue;
    }
    const skillId = toSlug(skill.name);
    if (!skillId) {
      extraNotes.push(`Skill: ${skill.name} ${skill.modifier >= 0 ? "+" : ""}${skill.modifier}`);
      continue;
    }
    if (skillId in skills) {
      extraNotes.push(`Duplicate skill: ${skill.name} ${skill.modifier >= 0 ? "+" : ""}${skill.modifier}`);
      warning(warnings, "duplicate-skill", `Duplicate ${skill.name} entries cannot share one Foundry skill field; the extra value is retained as text.`, `skills.${skill.name}`);
    } else {
      skills[skillId] = { base: skill.modifier };
    }
    if (skill.notes) extraNotes.push(`${skill.name} notes: ${skill.notes}`);
  }
  if (statBlock.skills.some((skill) => skill.notes)) {
    warning(warnings, "skill-notes-text-only", "Skill notes are preserved as export notes; only skill modifiers are imported.", "skills");
  }

  const hitPointPools = statBlock.defenses.hitPoints.filter((pool) => pool.value > 0);
  const primaryHitPoints = hitPointPools.find((pool) => pool.label.trim().toLowerCase() === "hp") ?? hitPointPools[0];
  if (hitPointPools.length > 1) {
    const additionalPools = hitPointPools.filter((pool) => pool !== primaryHitPoints);
    extraNotes.push(...additionalPools.map((pool) => `${pool.label}: ${pool.value}${pool.notes ? ` (${pool.notes})` : ""}`));
    warning(warnings, "additional-hp-text-only", "Only the primary HP pool is mapped to Foundry HP; additional pools are retained as text.", "defenses.hitPoints");
  }

  const landSpeeds = statBlock.movement.filter((entry) => entry.mode.toLowerCase() === "land");
  const primarySpeed = landSpeeds[0];
  if (!primarySpeed) {
    warning(warnings, "no-land-speed", "No land speed was recorded; Foundry land speed is set to 0 and other movement modes are preserved.", "movement");
  } else if (landSpeeds.length > 1) {
    warning(warnings, "multiple-land-speeds", "Only the first land speed is mapped; additional land speeds are preserved as text.", "movement");
    extraNotes.push(...landSpeeds.slice(1).map((entry) => `${entry.mode}: ${entry.speed}${entry.notes ? ` (${entry.notes})` : ""}`));
  }
  const landSpeedValue = primarySpeed ? parsePositiveInteger(primarySpeed.speed) : 0;
  if (primarySpeed && landSpeedValue === null) {
    warning(warnings, "unmapped-land-speed", "The land speed is preserved as text; Foundry land speed is set to 0.", "movement");
    extraNotes.push(`Land speed: ${primarySpeed.speed}${primarySpeed.notes ? ` (${primarySpeed.notes})` : ""}`);
  }
  const otherSpeeds: Record<string, unknown>[] = [];
  for (const [index, movement] of statBlock.movement.entries()) {
    if (movement === primarySpeed || movement.mode.toLowerCase() === "land") continue;
    const mode = toSlug(movement.mode);
    const value = parsePositiveInteger(movement.speed);
    if (mode && MOVEMENT_MODES.has(mode) && value !== null) {
      otherSpeeds.push({ type: mode, value });
      if (movement.notes) extraNotes.push(`${movement.mode} notes: ${movement.notes}`);
    } else {
      extraNotes.push(`${movement.mode}: ${movement.speed}${movement.notes ? ` (${movement.notes})` : ""}`);
      warning(warnings, "unmapped-movement", `The ${movement.mode} movement mode is retained as text.`, `movement.${index}`);
    }
  }

  const senses: Record<string, unknown>[] = [];
  for (const [index, sense] of statBlock.perception.senses.entries()) {
    const type = toSlug(sense.name);
    if (type === "normal-vision") continue;
    if (type) {
      const entry: Record<string, unknown> = { type };
      const range = sense.range ? parsePositiveInteger(sense.range) : null;
      if (range !== null) entry.range = range;
      senses.push(entry);
    }
    if (sense.notes || (sense.range && parsePositiveInteger(sense.range) === null)) {
      extraNotes.push(`${sense.name}${sense.range ? ` ${sense.range}` : ""}${sense.notes ? ` (${sense.notes})` : ""}`);
      warning(warnings, "sense-notes-text-only", `Additional details for ${sense.name} are retained as text.`, `perception.senses.${index}`);
    }
  }

  if (statBlock.recallKnowledge) {
    const knowledge = statBlock.recallKnowledge;
    const lines = [
      `Recall Knowledge DC ${knowledge.dc}`,
      ...knowledge.entries.map((entry) => `${entry.trait}: ${entry.skill}`),
      knowledge.adjustmentNote,
    ];
    items.push(createTextAction(idFactory(), "Recall Knowledge", lines, nextSort()));
  }

  if (statBlock.perception.notes) extraNotes.push(`Perception notes: ${statBlock.perception.notes}`);
  if (statBlock.languages.additionalCount) extraNotes.push(`Additional languages: ${statBlock.languages.additionalCount}`);
  if (statBlock.languages.communicationNotes) extraNotes.push(`Communication: ${statBlock.languages.communicationNotes}`);
  if (statBlock.defenses.armorClassNotes) extraNotes.push(`AC notes: ${statBlock.defenses.armorClassNotes}`);
  if (statBlock.defenses.notes) extraNotes.push(`Defense notes: ${statBlock.defenses.notes}`);
  for (const saveName of ["fortitude", "reflex", "will"] as const) {
    const notes = statBlock.defenses.saves[saveName].notes;
    if (notes) extraNotes.push(`${saveName} notes: ${notes}`);
  }

  const immunities = mapDamageEntries(statBlock.defenses.immunities, "immunities", warnings);
  const resistances = mapDamageEntries(statBlock.defenses.resistances, "resistances", warnings);
  const weaknesses = mapDamageEntries(statBlock.defenses.weaknesses, "weaknesses", warnings);
  extraNotes.push(
    ...statBlock.defenses.immunities.filter((entry) => !toSlug(entry)).map((entry) => `Immunity: ${entry}`),
    ...statBlock.defenses.resistances.filter((entry) => !parseDamageAmount(entry)).map((entry) => `Resistance: ${entry}`),
    ...statBlock.defenses.weaknesses.filter((entry) => !parseDamageAmount(entry)).map((entry) => `Weakness: ${entry}`),
  );

  if (statBlock.unparsedFragments.length) {
    for (const fragment of statBlock.unparsedFragments) {
      items.push(createTextAction(idFactory(), fragment.label, [fragment.text, fragment.reason], nextSort()));
    }
    warning(warnings, "unparsed-fragments", "Unparsed source content is preserved as text and is not automated.", "unparsedFragments");
  }
  if (extraNotes.length) {
    items.push(createTextAction(idFactory(), "Star Board Export Notes", extraNotes, nextSort()));
  }

  const size = enemy.size!;
  const tokenDimension = TOKEN_DIMENSION[size];
  const languages = statBlock.languages.names.map(toSlug).filter(Boolean);
  const abilityValues = Object.fromEntries(
    Object.entries(statBlock.abilityModifiers).map(([ability, modifier]) => [ABILITY_ID[ability as keyof typeof ABILITY_ID], { mod: modifier }]),
  );
  const actor: FoundryNpcActor = {
    img: NPC_IMAGE,
    items,
    name: enemy.name.trim(),
    system: {
      abilities: abilityValues,
      attributes: {
        ac: { value: statBlock.defenses.armorClass, details: statBlock.defenses.armorClassNotes },
        allSaves: { value: "" },
        adjustment: null,
        hp: { value: primaryHitPoints.value, max: primaryHitPoints.value, temp: 0, details: primaryHitPoints.notes },
        immunities,
        resistances,
        weaknesses,
        speed: {
          value: landSpeedValue ?? 0,
          otherSpeeds,
          details: primarySpeed?.notes ?? "",
        },
      },
      details: {
        blurb: "",
        languages: { value: languages, details: extraNotes.filter((line) => line.startsWith("Additional languages:") || line.startsWith("Communication:")).join("; ") },
        level: { value: enemy.level },
        publicNotes: enemy.player_description_is_markdown
          ? renderFoundryMarkdown(enemy.player_description)
          : paragraphs([enemy.player_description]),
        privateNotes: "",
        publication: { title: "", authors: "", license: "", remaster: false },
      },
      initiative: { statistic: "perception" },
      perception: { details: "", mod: statBlock.perception.modifier, senses, vision: true },
      resources: {},
      saves: {
        fortitude: { value: statBlock.defenses.saves.fortitude.modifier, saveDetail: statBlock.defenses.saves.fortitude.notes },
        reflex: { value: statBlock.defenses.saves.reflex.modifier, saveDetail: statBlock.defenses.saves.reflex.notes },
        will: { value: statBlock.defenses.saves.will.modifier, saveDetail: statBlock.defenses.saves.will.notes },
      },
      skills,
      traits: {
        rarity: enemy.rarity,
        size: { value: SIZE_ID[size] },
        value: (enemy.traits ?? []).map(toSlug).filter(Boolean),
      },
    },
    type: "npc",
    effects: [],
    flags: {},
    ownership: { default: 0 },
    prototypeToken: {
      name: enemy.name.trim(),
      displayName: 0,
      actorLink: false,
      width: tokenDimension,
      height: tokenDimension,
      depth: 1,
      texture: { src: NPC_IMAGE, fit: "contain", scaleX: 1, scaleY: 1 },
      disposition: -1,
      displayBars: 0,
      bar1: { attribute: "attributes.hp" },
      bar2: { attribute: null },
      flags: { sf2e: { linkToActorSize: true, autoscale: false } },
    },
  };

  return actor;
}

export function buildFoundryNpcActor(
  enemy: FoundryEnemyInput,
  options: { idFactory?: IdFactory } = {},
): FoundryNpcBuildResult {
  const errors: string[] = [];
  const warnings: FoundryExportWarning[] = [];
  if (!enemy.name.trim()) errors.push("Enemy name is required.");
  if (enemy.level === undefined || !enemy.size || !enemy.rarity || !enemy.traits) {
    errors.push("Enemy level, size, rarity, and traits are required for Foundry export.");
  }
  const parsedStatBlock = completeEnemyStatBlockSchema.safeParse(enemy.stat_block);
  if (!parsedStatBlock.success) errors.push("Enemy needs a complete stat block with positive AC and at least one positive HP pool.");
  if (errors.length || !parsedStatBlock.success) return { actor: null, errors, warnings };

  const actor = makeActor(enemy, parsedStatBlock.data, options.idFactory ?? createFoundryId, warnings);
  return { actor, errors, warnings };
}