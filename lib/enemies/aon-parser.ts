import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { enemyStatBlockSchema, type EnemyStatBlockV1 } from "@/lib/validation/enemy";
import { parseAonCreatureUrl } from "@/lib/enemies/aon-url";

const MAX_PARSER_INPUT_BYTES = 2_000_000;
const sizeValues = new Set(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
const rarityValues = new Set(["common", "uncommon", "rare", "unique"]);
const abilityLabels: Record<string, keyof EnemyStatBlockV1["abilityModifiers"]> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

export type AonParsedSource = {
  title: string;
  page: string | null;
  href: string | null;
};

export type AonParsedCreature = {
  name: string;
  level: number;
  size: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
  rarity: "common" | "uncommon" | "rare" | "unique";
  traits: string[];
  family: string | null;
  source: AonParsedSource;
  sourceTitle: string;
  sourcePage: string | null;
  sourceHref: string | null;
  canonicalUrl: string | null;
  statBlock: EnemyStatBlockV1;
  warnings: string[];
};

export type AonParserOptions = {
  canonicalUrl?: string;
  maxInputBytes?: number;
  expectedExternalId?: number;
};

export class AonParseError extends Error {
  readonly code = "INVALID_AON_CREATURE_HTML";

  constructor(message: string) {
    super(message);
    this.name = "AonParseError";
  }
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function limitText(value: string, max: number): string {
  return cleanText(value).slice(0, max);
}

function textOf(j: cheerio.CheerioAPI, node: AnyNode): string {
  return cleanText(j(node).text());
}

function firstBoldText(j: cheerio.CheerioAPI, node: AnyNode): string {
  return cleanText(j(node).find("b").first().text());
}

function firstNumber(value: string): number | null {
  const match = value.replace(/−/g, "-").match(/[+-]?\d+/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isSafeInteger(number) ? number : null;
}

function firstSignedNumber(value: string): number | null {
  const match = value.replace(/−/g, "-").match(/[+-]\s*\d+/);
  if (!match) return firstNumber(value);
  const number = Number(match[0].replace(/\s+/g, ""));
  return Number.isSafeInteger(number) ? number : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function directChildren(j: cheerio.CheerioAPI, node: AnyNode): AnyNode[] {
  return j(node).children().toArray();
}

function hasClass(j: cheerio.CheerioAPI, node: AnyNode, className: string): boolean {
  return j(node).hasClass(className);
}

function findDirectNode(j: cheerio.CheerioAPI, nodes: AnyNode[], pattern: RegExp): AnyNode | undefined {
  return nodes.find((node) => pattern.test(textOf(j, node)));
}

function removeLabel(value: string, label: string): string {
  return cleanText(value.replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`, "i"), ""));
}

function parseDefaultStatText(j: cheerio.CheerioAPI, node: AnyNode): string {
  const stats = j(node).find(".adjustable-stat").filter((_, element) => !j(element).hasClass("adjustable-stat-message"));
  const selected = stats.filter(".is-default").first();
  if (selected.length) return textOf(j, selected[0]);
  return stats.first().length ? textOf(j, stats.first()[0]) : "";
}

function parseAction(j: cheerio.CheerioAPI, node: AnyNode): { activation: EnemyStatBlockV1["specialAbilities"][number]["activation"]; actionCost: string | null } {
  const action = j(node).find(".action").first();
  if (!action.length) return { activation: "passive", actionCost: null };
  const label = cleanText(action.attr("aria-label") ?? action.attr("title") ?? "").toLowerCase();
  if (label.includes("reaction")) return { activation: "reaction", actionCost: "reaction" };
  if (label.includes("free")) return { activation: "free-action", actionCost: "free-action" };
  if (label.includes("three")) return { activation: "three-actions", actionCost: "3" };
  if (label.includes("two")) return { activation: "two-actions", actionCost: "2" };
  if (label.includes("one")) return { activation: "one-action", actionCost: "1" };
  return { activation: "other", actionCost: null };
}

function parseTraits(j: cheerio.CheerioAPI, root: AnyNode): {
  size: AonParsedCreature["size"];
  rarity: AonParsedCreature["rarity"];
  traits: string[];
} {
  let size: AonParsedCreature["size"] | null = null;
  let rarity: AonParsedCreature["rarity"] = "common";
  const traits: string[] = [];
  const traitItems = j(root).children("ul.traits").first().find("li.trait").toArray();

  for (const item of traitItems) {
    const value = cleanText(j(item).text());
    const normalized = value.toLowerCase();
    const classes = j(item).attr("class") ?? "";
    const rarityClass = classes.split(/\s+/).find((className) => className.startsWith("trait-") && rarityValues.has(className.slice(6).toLowerCase()));
    if (rarityClass) {
      rarity = rarityClass.slice(6).toLowerCase() as AonParsedCreature["rarity"];
      continue;
    }
    if (hasClass(j, item, "trait-size") || sizeValues.has(normalized)) {
      if (sizeValues.has(normalized)) size = normalized as AonParsedCreature["size"];
      continue;
    }
    if (rarityValues.has(normalized)) {
      rarity = normalized as AonParsedCreature["rarity"];
      continue;
    }
    if (value) traits.push(value);
  }

  if (!size) throw new AonParseError("The creature stat block is missing a supported size.");
  return { size, rarity, traits: unique(traits) };
}

function parseSource(j: cheerio.CheerioAPI, root: AnyNode): AonParsedSource {
  const source = j(root).children(".sources").first();
  const link = source.find("a").first();
  const title = limitText(link.length ? link.text() : removeLabel(textOf(j, source[0]), "Source"), 240);
  const pageMatch = textOf(j, source[0]).match(/\b(?:pg\.?|page)\s*(\d+)\b/i);
  return {
    title,
    page: pageMatch?.[1] ?? null,
    href: link.attr("href") ?? null,
  };
}

function parseRecallKnowledge(j: cheerio.CheerioAPI, node: AnyNode | undefined): EnemyStatBlockV1["recallKnowledge"] {
  if (!node) return null;
  const fullText = textOf(j, node);
  const dc = firstNumber(parseDefaultStatText(j, node) || fullText);
  if (dc === null) return null;
  const entries: NonNullable<EnemyStatBlockV1["recallKnowledge"]>["entries"] = [];
  const list = j(node).find(".comma-delimited-list").first();
  for (const entry of list.children().toArray()) {
    const value = textOf(j, entry);
    const match = value.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (match) entries.push({ trait: limitText(match[1], 80), skill: limitText(match[2], 80) });
  }
  const note = fullText.match(/\((includes?\s+[^)]+)\)/i)?.[1] ?? "";
  return {
    dc,
    entries,
    adjustmentNote: limitText(note, 800),
  };
}

function parsePerception(j: cheerio.CheerioAPI, node: AnyNode | undefined): EnemyStatBlockV1["perception"] {
  if (!node) return { modifier: 0, senses: [], notes: "" };
  const value = removeLabel(textOf(j, node), "Perception");
  const modifier = firstSignedNumber(parseDefaultStatText(j, node) || value) ?? 0;
  const senseText = value.match(/\(([^)]+)\)/)?.[1] ?? "";
  const senses = senseText.split(",").map((sense) => cleanText(sense)).filter(Boolean).map((name) => ({ name: limitText(name, 120), range: null, notes: "" }));
  return { modifier, senses, notes: "" };
}

function parseLanguages(j: cheerio.CheerioAPI, node: AnyNode | undefined): EnemyStatBlockV1["languages"] {
  if (!node) return { names: [], additionalCount: 0, communicationNotes: "" };
  const names = j(node).find("a[href^='/languages/']").toArray().map((link) => limitText(j(link).text(), 80));
  const value = removeLabel(textOf(j, node), "Languages");
  const countToken = value.match(/\band\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+additional\s+languages\b/i)?.[1]?.toLowerCase();
  const wordCounts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const additionalCount = countToken ? (wordCounts[countToken] ?? Number(countToken)) : 0;
  let communicationNotes = value.replace(/\band\s+\d+\s+additional\s+languages\b/gi, "");
  for (const name of names) communicationNotes = communicationNotes.replace(name, "");
  communicationNotes = communicationNotes.replace(/[;,]/g, " ");
  return {
    names: unique(names),
    additionalCount: Number.isSafeInteger(additionalCount) ? additionalCount : 0,
    communicationNotes: limitText(communicationNotes, 800),
  };
}

function parseSkills(j: cheerio.CheerioAPI, node: AnyNode | undefined): EnemyStatBlockV1["skills"] {
  if (!node) return [];
  const skills: EnemyStatBlockV1["skills"] = [];
  const links = j(node).find("a[href^='/skills/']").toArray();
  for (const link of links) {
    const stat = j(link).nextAll(".adjustable-stat").first();
    const modifier = firstSignedNumber(stat.length ? textOf(j, stat[0]) : textOf(j, link.parent ?? link)) ?? 0;
    skills.push({ name: limitText(j(link).text(), 120), modifier, notes: "" });
  }
  return skills;
}

function parseAbilityModifiers(j: cheerio.CheerioAPI, node: AnyNode | undefined): EnemyStatBlockV1["abilityModifiers"] {
  const result: EnemyStatBlockV1["abilityModifiers"] = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
  if (!node) return result;
  const value = textOf(j, node).replace(/−/g, "-");
  for (const match of value.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\s*([+-]?\s*\d+)/gi)) {
    const key = abilityLabels[match[1].toLowerCase()];
    if (key) result[key] = Number(match[2].replace(/\s+/g, ""));
  }
  return result;
}

function parseItems(j: cheerio.CheerioAPI, node: AnyNode | undefined): string[] {
  if (!node) return [];
  const links = j(node).find("a").toArray().map((link) => limitText(j(link).text(), 160));
  if (links.length) return unique(links);
  return unique(removeLabel(textOf(j, node), "Items").split(",").map((item) => item.slice(0, 160)));
}

function parseDefenseRows(j: cheerio.CheerioAPI, nodes: AnyNode[]): {
  defenses: EnemyStatBlockV1["defenses"];
  foundArmorClass: boolean;
  foundHitPoints: boolean;
} {
  let armorClass = 0;
  let armorClassNotes = "";
  const saves = {
    fortitude: { modifier: 0, notes: "" },
    reflex: { modifier: 0, notes: "" },
    will: { modifier: 0, notes: "" },
  };
  const hitPoints: EnemyStatBlockV1["defenses"]["hitPoints"] = [];
  const immunities: string[] = [];
  const resistances: string[] = [];
  const weaknesses: string[] = [];
  let foundArmorClass = false;
  let foundHitPoints = false;
  const recognized = /^(AC|Fort|Ref|Will|HP|Immunities|Resistances|Weaknesses)$/i;

  for (const node of nodes) {
    for (const bold of j(node).find("b").toArray()) {
      const label = cleanText(j(bold).text());
      if (!recognized.test(label)) continue;
      const parent = j(bold).parent();
      const tail = removeLabel(textOf(j, parent[0] ?? bold), label);
      if (label.toLowerCase() === "ac") {
        const value = firstNumber(parseDefaultStatText(j, parent[0] ?? bold) || tail);
        if (value !== null) {
          armorClass = value;
          foundArmorClass = true;
        }
        armorClassNotes = limitText(tail.replace(/[+-]?\d+/, "").replace(/[(),]/g, " "), 800);
      } else if (label.toLowerCase() === "fort") {
        saves.fortitude.modifier = firstSignedNumber(parseDefaultStatText(j, parent[0] ?? bold) || tail) ?? 0;
      } else if (label.toLowerCase() === "ref") {
        saves.reflex.modifier = firstSignedNumber(parseDefaultStatText(j, parent[0] ?? bold) || tail) ?? 0;
      } else if (label.toLowerCase() === "will") {
        saves.will.modifier = firstSignedNumber(parseDefaultStatText(j, parent[0] ?? bold) || tail) ?? 0;
      } else if (label.toLowerCase() === "hp") {
        const value = firstNumber(parseDefaultStatText(j, parent[0] ?? bold) || tail);
        if (value !== null) {
          hitPoints.push({ label: "HP", value, notes: limitText(tail.replace(/[+-]?\d+/, "").replace(/^[, ]+/, ""), 400) });
          foundHitPoints = true;
        }
      } else {
        const values = tail.split(/[,;]/).map((entry) => limitText(entry, 160)).filter(Boolean);
        if (label.toLowerCase() === "immunities") immunities.push(...values);
        if (label.toLowerCase() === "resistances") resistances.push(...values);
        if (label.toLowerCase() === "weaknesses") weaknesses.push(...values);
      }
    }
  }

  return {
    defenses: {
      armorClass,
      armorClassNotes,
      saves,
      hitPoints,
      immunities: unique(immunities),
      resistances: unique(resistances),
      weaknesses: unique(weaknesses),
      notes: "",
    },
    foundArmorClass,
    foundHitPoints,
  };
}

function parseMovement(j: cheerio.CheerioAPI, node: AnyNode | undefined): EnemyStatBlockV1["movement"] {
  if (!node) return [];
  const value = removeLabel(textOf(j, node), "Speed");
  return value.split(",").map((part, index) => {
    const segment = cleanText(part);
    const modeMatch = segment.match(/^(fly|swim|burrow|climb|land|hover)\s+/i);
    const mode = modeMatch?.[1]?.toLowerCase() ?? (index === 0 ? "land" : "other");
    const speed = cleanText((modeMatch ? segment.slice(modeMatch[0].length) : segment).replace(/\([^)]*\)/g, ""));
    const notes = segment.match(/\(([^)]+)\)/)?.[1] ?? "";
    return { mode: limitText(mode, 80), speed: limitText(speed, 80), notes: limitText(notes, 400) };
  }).filter((movement) => movement.speed);
}

function parseDamage(value: string): EnemyStatBlockV1["strikes"][number]["damage"] {
  const cleaned = cleanText(value);
  if (!cleaned) return [];
  const match = cleaned.match(/^(\S+)(?:\s+(.+))?$/);
  if (!match) return [];
  const remainder = cleanText(match[2] ?? "");
  const [type, ...notes] = remainder.split(/\s+/);
  if (!type) return [{ formula: limitText(match[1], 160), type: "", notes: "" }];
  return [{ formula: limitText(match[1], 160), type: limitText(type, 120), notes: limitText(notes.join(" "), 400) }];
}

function parseStrike(j: cheerio.CheerioAPI, node: AnyNode): EnemyStatBlockV1["strikes"][number] {
  const fullText = textOf(j, node);
  const bolds = j(node).find("b").toArray().map((bold) => cleanText(j(bold).text())).filter(Boolean);
  const category = /^Ranged\b/i.test(fullText) ? "ranged" : "melee";
  const name = limitText(bolds[0]?.match(/^(Melee|Ranged)$/i) ? (bolds[1] ?? "Unnamed strike") : (bolds[0] ?? "Unnamed strike"), 160);
  const action = parseAction(j, node);
  const attackStat = j(node).find(".is-attack").first();
  const damageStat = j(node).find(".is-damage").first();
  const traits = unique(j(node).find(".traits-parenthetical a, a[href^='/traits/']").toArray().map((link) => j(link).text()));
  const reach = fullText.match(/\breach\s+(\d+\s+feet)/i)?.[1] ?? null;
  const range = fullText.match(/\brange(?:\s+increment)?\s+(\d+\s+feet)/i)?.[1] ?? null;
  return {
    category,
    name,
    activation: action.activation === "passive" ? null : action.activation,
    attackModifier: firstSignedNumber(attackStat.length ? textOf(j, attackStat[0]) : "") ?? 0,
    multipleAttackPenalty: [],
    traits,
    reach,
    range,
    damage: parseDamage(damageStat.length ? textOf(j, damageStat[0]) : ""),
    rider: "",
    rawText: limitText(fullText, 2400),
  };
}

function parseSpecialAbility(j: cheerio.CheerioAPI, node: AnyNode, section: "general" | "defensive" | "offensive"): EnemyStatBlockV1["specialAbilities"][number] | null {
  const fullText = textOf(j, node);
  const name = firstBoldText(j, node);
  if (!name || /^(Melee|Ranged|Damage|Source|Recall Knowledge|Perception|Languages|Skills|Items|AC|Fort|Ref|Will|HP|Immunities|Resistances|Weaknesses|Speed)$/i.test(name)) return null;
  const action = parseAction(j, node);
  const traits = unique(j(node).find(".traits-parenthetical a, a[href^='/traits/']").toArray().map((link) => j(link).text()));
  const frequency = fullText.match(/\bFrequency\s+([^;]+)/i)?.[1] ?? null;
  const trigger = fullText.match(/\bTrigger\s+([^;]+)/i)?.[1] ?? null;
  const requirements = fullText.match(/\bRequirements?\s+([^;]+)/i)?.[1] ?? null;
  const area = fullText.match(/\b(?:Area|Range)\s+([^;]+)/i)?.[1] ?? null;
  const save = fullText.match(/\bDC\s+\d+[^;.]*/i)?.[0] ?? null;
  const cooldown = fullText.match(/\b(?:Cooldown|Recharge)\s+([^;]+)/i)?.[1] ?? null;
  return {
    section,
    name: limitText(name, 160),
    activation: action.activation,
    actionCost: action.actionCost,
    traits,
    frequency: frequency ? limitText(frequency, 160) : null,
    trigger: trigger ? limitText(trigger, 800) : null,
    requirements: requirements ? limitText(requirements, 800) : null,
    area: area ? limitText(area, 160) : null,
    save: save ? limitText(save, 160) : null,
    cooldown: cooldown ? limitText(cooldown, 160) : null,
    effect: limitText(fullText, 4000),
    rawText: limitText(fullText, 4000),
  };
}

function parseSpellcasting(j: cheerio.CheerioAPI, nodes: AnyNode[]): EnemyStatBlockV1["spellcasting"] {
  return nodes.map((node) => {
    const fullText = textOf(j, node);
    const title = cleanText(j(node).find("b").first().text());
    const tradition = title.match(/^(Arcane|Divine|Occult|Primal)\b/i)?.[1]?.toLowerCase() ?? "other";
    const methodMatch = title.match(/\b(Innate|Prepared|Spontaneous|Focus)\b/i);
    const method = (methodMatch?.[1]?.toLowerCase() ?? "other") as EnemyStatBlockV1["spellcasting"][number]["method"];
    const dcStat = j(node).find(".adjustable-stat").first();
    const dc = firstNumber(dcStat.length ? textOf(j, dcStat[0]) : fullText.match(/\bDC\s+([+-]?\d+)/i)?.[1] ?? "") ?? null;
    const attackModifier = firstSignedNumber(fullText.match(/\battack\s+([+-]?\d+)/i)?.[1] ?? "") ?? null;
    const entries = j(node).find(".rank-spell-list").toArray().map((entry) => {
      const rank = limitText(j(entry).find("b").first().text(), 40);
      const spells = unique(j(entry).find("a[href^='/spells/']").toArray().map((spell) => j(spell).text()));
      const entryText = textOf(j, entry);
      const frequency = entryText.match(/\b(at will|once per [^;,]+|\d+ times? per [^;,]+)/i)?.[1] ?? null;
      const uses = entryText.match(/\b(?:×|x)\s*\d+\b/i)?.[0] ?? null;
      return { rank, spells, uses, frequency, notes: "" };
    }).filter((entry) => entry.rank || entry.spells.length);
    return {
      tradition: limitText(tradition, 80),
      method,
      dc,
      attackModifier,
      entries,
      notes: "",
    };
  });
}

function parseNameAndLevel(j: cheerio.CheerioAPI, root: AnyNode): { name: string; level: number } {
  const nameLink = j(root).find("h2.title a.creature-name").first();
  const name = limitText(nameLink.length ? nameLink.clone().children(".feature-level, .adjustable-stat-message").remove().end().text() : j(root).find("h2.title").first().text(), 160);
  const levelText = j(root).find(".feature-level .is-level").first();
  const level = firstNumber(levelText.length ? textOf(j, levelText[0]) : textOf(j, j(root).find("h2.title").first()[0] ?? root).match(/Creature\s+([+-]?\d+)/i)?.[0] ?? "");
  if (!name || level === null) throw new AonParseError("The creature stat block is missing its name or level.");
  return { name, level };
}

function verifyCreatureIdentity(j: cheerio.CheerioAPI, root: AnyNode, options: AonParserOptions) {
  if (options.expectedExternalId === undefined) return;

  const href = j(root).find("h2.title a.creature-name").first().attr("href");
  if (!href) throw new AonParseError("The Archives of Nethys document is missing the creature identity link.");

  let identity;
  try {
    identity = parseAonCreatureUrl(new URL(href, options.canonicalUrl ?? "https://2e.aonsrd.com/").toString());
  } catch {
    throw new AonParseError("The Archives of Nethys document contains an invalid creature identity link.");
  }

  if (identity.externalId !== options.expectedExternalId) {
    throw new AonParseError("The Archives of Nethys document identifies a different creature than the requested URL.");
  }
}

function findCreatureRoot(j: cheerio.CheerioAPI): AnyNode | undefined {
  const candidates = j("#main .creature, main .creature, .creature").filter((_, node) => {
    return j(node).find("h2.title").length > 0 && j(node).find(".creature-name").length > 0 && j(node).find("ul.traits").length > 0;
  });
  return candidates.first()[0];
}

export function parseAonCreatureHtml(html: string, source?: string | AonParserOptions): AonParsedCreature {
  if (typeof html !== "string" || !html.trim()) throw new AonParseError("Archives of Nethys returned an empty document.");
  const options = typeof source === "string" ? { canonicalUrl: source } : (source ?? {});
  const maxInputBytes = options.maxInputBytes ?? MAX_PARSER_INPUT_BYTES;
  if (new TextEncoder().encode(html).byteLength > maxInputBytes) {
    throw new AonParseError("The Archives of Nethys document exceeds the parser size limit.");
  }

  const j = cheerio.load(html);
  const root = findCreatureRoot(j);
  if (!root) throw new AonParseError("The Archives of Nethys document does not contain a creature stat block.");
  verifyCreatureIdentity(j, root, options);
  const { name, level } = parseNameAndLevel(j, root);
  const classification = parseTraits(j, root);
  const sourceData = parseSource(j, root);
  const nodes = directChildren(j, root);
  const firstOffenseIndex = nodes.findIndex((node) => hasClass(j, node, "creature-attack") || hasClass(j, node, "creature-spell-group"));
  const beforeOffense = nodes.slice(0, firstOffenseIndex < 0 ? nodes.length : firstOffenseIndex);
  const recallNode = nodes.find((node) => hasClass(j, node, "creature-recall-knowledge"));
  const perceptionNode = findDirectNode(j, nodes, /^Perception\b/i);
  const languageNode = nodes.find((node) => hasClass(j, node, "languages")) ?? findDirectNode(j, nodes, /^Languages\b/i);
  const skillsNode = findDirectNode(j, nodes, /^Skills\b/i);
  const abilityNode = nodes.find((node) => /\b(?:Str|Dex|Con|Int|Wis|Cha)\s*[+-]?\s*\d+/i.test(textOf(j, node)));
  const itemsNode = findDirectNode(j, nodes, /^Items\b/i);
  const speedNode = findDirectNode(j, nodes, /^Speed\b/i);
  const defenseRows = parseDefenseRows(j, beforeOffense.filter((node) => !hasClass(j, node, "creature-recall-knowledge")));
  if (!defenseRows.foundArmorClass || !defenseRows.foundHitPoints) {
    throw new AonParseError("The creature stat block is missing core defenses.");
  }

  const strikeNodes = nodes.filter((node) => hasClass(j, node, "creature-attack") && /^(Melee|Ranged)\b/i.test(textOf(j, node)));
  const specialNodes = nodes.filter((node) => hasClass(j, node, "creature-attack") && !/^(Melee|Ranged)\b/i.test(textOf(j, node)));
  const spellNodes = nodes.filter((node) => hasClass(j, node, "creature-spell-group"));
  const passiveNodes = beforeOffense.filter((node) => {
    if (hasClass(j, node, "sources") || hasClass(j, node, "creature-recall-knowledge") || hasClass(j, node, "languages")) return false;
    const label = firstBoldText(j, node);
    return Boolean(label) && !/^(Perception|Languages|Skills|Str|Dex|Con|Int|Wis|Cha|Items|AC|Fort|Ref|Will|HP|Immunities|Resistances|Weaknesses|Speed|Source)$/i.test(label);
  });
  const specialAbilities = [
    ...passiveNodes.map((node) => parseSpecialAbility(j, node, "general")),
    ...specialNodes.map((node) => parseSpecialAbility(j, node, "offensive")),
  ].filter((ability): ability is NonNullable<typeof ability> => ability !== null);

  const statBlock = enemyStatBlockSchema.parse({
    schemaVersion: 1,
    recallKnowledge: parseRecallKnowledge(j, recallNode),
    perception: parsePerception(j, perceptionNode),
    languages: parseLanguages(j, languageNode),
    skills: parseSkills(j, skillsNode),
    abilityModifiers: parseAbilityModifiers(j, abilityNode),
    items: parseItems(j, itemsNode),
    defenses: defenseRows.defenses,
    movement: parseMovement(j, speedNode),
    strikes: strikeNodes.map((node) => parseStrike(j, node)),
    spellcasting: parseSpellcasting(j, spellNodes),
    specialAbilities,
    unparsedFragments: [],
  });

  const familyHeading = j(root).nextAll(".creature-family").first().find("h2").first().text();
  const family = familyHeading.match(/All Creatures in\s+["“]([^"”]+)["”]/i)?.[1] ?? null;
  let canonicalUrl: string | null = null;
  if (options.canonicalUrl) {
    try {
      canonicalUrl = parseAonCreatureUrl(options.canonicalUrl).canonicalUrl;
    } catch {
      canonicalUrl = null;
    }
  }
  const warnings: string[] = [];
  if (!sourceData.title) warnings.push("The source title was not found.");
  if (!sourceData.page) warnings.push("The source page number was not found.");
  if (!perceptionNode) warnings.push("Perception was not found.");
  if (!languageNode) warnings.push("Languages were not found; the creature may be mindless or use a non-language communication mode.");

  return {
    name,
    level,
    ...classification,
    family,
    source: sourceData,
    sourceTitle: sourceData.title,
    sourcePage: sourceData.page,
    sourceHref: sourceData.href,
    canonicalUrl,
    statBlock,
    warnings: unique(warnings).slice(0, 24),
  };
}

export const parseAonCreature = parseAonCreatureHtml;
