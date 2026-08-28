import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EnemyStatBlock from "@/components/enemies/EnemyStatBlock";
import EnemyStatBlockEditor from "@/components/enemies/EnemyStatBlockEditor";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const statBlock = enemyStatBlockSchema.parse({
  schemaVersion: 1,
  recallKnowledge: { dc: 24, entries: [{ trait: "Aberration", skill: "Occultism" }], adjustmentNote: "Use the creature's public alias." },
  perception: { modifier: 18, senses: [{ name: "darkvision", range: "60 feet", notes: "Through smoke" }], notes: "Can detect movement." },
  languages: { names: ["Common", "Aklo"], additionalCount: 2, communicationNotes: "Telepathy 100 feet" },
  skills: [{ name: "Athletics", modifier: 16, notes: "Climb" }],
  abilityModifiers: { strength: 5, dexterity: 3, constitution: 4, intelligence: 2, wisdom: 4, charisma: 1 },
  items: ["Voidglass spear"],
  defenses: {
    armorClass: 26,
    armorClassNotes: "Reactive plating",
    saves: {
      fortitude: { modifier: 17, notes: "" },
      reflex: { modifier: 15, notes: "Evasion" },
      will: { modifier: 19, notes: "" },
    },
    hitPoints: [{ label: "HP", value: 180, notes: "Regeneration 10" }],
    immunities: ["sleep"],
    resistances: ["electricity 10"],
    weaknesses: ["sonic 5"],
    notes: "Immune while phased.",
  },
  movement: [{ mode: "land", speed: "30 feet", notes: "Climb 20 feet" }],
  strikes: [{
    category: "melee",
    name: "Voidglass spear",
    activation: "one-action",
    attackModifier: 20,
    multipleAttackPenalty: [-5, -10],
    traits: ["agile", "reach"],
    reach: "10 feet",
    range: "30 feet",
    damage: [{ formula: "2d8+8", type: "piercing", notes: "Deadly d10" }],
    rider: "The target is off-guard.",
    rawText: "Source strike text",
  }],
  spellcasting: [{
    tradition: "occult",
    method: "innate",
    dc: 25,
    attackModifier: 17,
    entries: [{ rank: "3rd", spells: ["mindlink", "fear"], uses: "At will", frequency: null, notes: "One target" }],
    notes: "Focus spells are psychic.",
  }],
  specialAbilities: [{
    section: "offensive",
    name: "Phase step",
    activation: "reaction",
    actionCost: null,
    traits: ["teleportation"],
    frequency: "once per round",
    trigger: "The creature is targeted.",
    requirements: "The creature is not immobilized.",
    area: "20-foot burst",
    save: "Reflex DC 25",
    cooldown: "1 minute",
    effect: "The creature shifts out of phase.",
    rawText: "Source ability text",
  }],
  unparsedFragments: [{ label: "Source note", text: "Special interaction requires GM adjudication.", reason: "Parser preserved the original wording." }],
});

function render(node: React.ReactNode) {
  return renderToStaticMarkup(node);
}

describe("enemy stat-block editor", () => {
  it("renders every V1 section and nested field family as readable controls", () => {
    const markup = render(<EnemyStatBlockEditor value={statBlock} onChange={() => undefined} />);

    expect(markup).toContain('data-enemy-stat-block-editor="true"');
    for (const label of [
      "RECALL KNOWLEDGE",
      "PERCEPTION",
      "LANGUAGES",
      "SKILLS",
      "ABILITY MODIFIERS",
      "ITEMS",
      "DEFENSES",
      "MOVEMENT",
      "STRIKES",
      "SPELLCASTING",
      "SPECIAL ABILITIES",
      "UNPARSED FRAGMENTS",
    ]) expect(markup).toContain(label);
    for (const value of [
      "Aberration",
      "darkvision",
      "Common",
      "Athletics",
      "Voidglass spear",
      "Reactive plating",
      "30 feet",
      "2d8+8",
      "mindlink",
      "Phase step",
      "Special interaction requires GM adjudication.",
    ]) expect(markup).toContain(value);
    expect(markup).toContain('aria-label="Add strike"');
    expect(markup).toContain('aria-label="Remove strikes 1"');
    for (const rank of ["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]) expect(markup).toMatch(new RegExp(`<option[^>]*value="${rank}"[^>]*>${rank}</option>`));
    expect(markup).not.toContain("<pre");
    expect(markup).not.toContain("JSON V1");
  });

  it("renders a disabled fieldset for source-controlled records", () => {
    const markup = render(<EnemyStatBlockEditor disabled value={statBlock} onChange={() => undefined} />);

    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain('data-enemy-repeatable="strikes"');
  });

  it("shows path-aware mechanics validation issues", () => {
    const markup = render(<EnemyStatBlockEditor issues={[{ path: ["defenses", "hitPoints", 0, "value"], message: "Enter a whole number." }]} value={statBlock} onChange={() => undefined} />);

    expect(markup).toContain("MECHANICS VALIDATION");
    expect(markup).toContain("defenses / hit points / #1 / value: Enter a whole number.");
  });

  it("renders the same populated object as human-readable mechanics", () => {
    const markup = render(<EnemyStatBlock embedded statBlock={statBlock} creatureLevel={7} />);

    expect(markup).toContain("STRUCTURED STAT BLOCK");
    expect(markup).toContain("Adjustment note");
    expect(markup).toContain("Armor class notes");
    expect(markup).not.toContain("Multiple attack penalty");
    expect(markup).toContain("3rd");
    expect(markup).not.toContain("Spell rank 1");
    expect(markup).toContain("Cooldown");
    expect(markup).toContain('data-enemy-action-metadata="true"');
    expect(markup).toContain('class="grid w-full min-w-0 border-b border-[rgba(139,151,169,.12)] min-[500px]:grid-cols-3');
    expect(markup).not.toContain('class="grid w-full min-w-0 border-y border-[rgba(139,151,169,.12)]');
    expect(markup).toContain('pl-[10px]');
    expect(markup).toContain('pl-0 pr-[8px] py-[6px]');
    expect(markup).toContain('min-[500px]:-mt-[5px]');
    expect(markup).toContain('min-[500px]:border-b-0 min-[500px]:border-r');
    expect(markup).toContain('min-[500px]:pt-[11px] min-[500px]:pb-[13px] last:border-r-0');
    expect(markup).toContain('data-enemy-strike-details="true"');
    expect(markup).toContain('data-enemy-strike-heading="true"');
    expect(markup).toContain('data-enemy-spellcasting-heading="true"');
    expect(markup).toContain('data-enemy-special-ability-heading="true"');
    expect(markup).toContain('data-enemy-compact-line="true"');
    expect(markup).toContain('gap-[5px]');
    expect(markup).toContain('gap-[4px]');
    expect(markup.indexOf(">Save</strong>")).toBeLessThan(markup.indexOf(">Frequency</strong>"));
    expect(markup.indexOf(">Frequency</strong>")).toBeLessThan(markup.indexOf(">Area</strong>"));
    expect(markup).not.toContain(">OFFENSIVE</span>");
    expect(markup).toContain("Parser preserved the original wording.");
    expect(markup).not.toContain("[object Object]");
    expect(markup).not.toContain("<pre");
  });

  it("renders action activations with the Pathfinder action glyph mapping", () => {
    const actionValues = ["one-action", "two-actions", "three-actions", "free-action", "reaction"] as const;
    const actionStatBlock = enemyStatBlockSchema.parse({
      ...statBlock,
      specialAbilities: actionValues.map((activation, index) => ({
        ...statBlock.specialAbilities[0],
        name: `Action ${index + 1}`,
        activation,
        actionCost: null,
      })),
    });
    const markup = render(<EnemyStatBlock statBlock={actionStatBlock} />);

    for (const action of actionValues) expect(markup).toContain(`data-action-glyph="${action}"`);
    for (const label of ["1 action", "2 actions", "3 actions", "free action", "reaction"]) expect(markup).toContain(label);
    expect(markup).toContain("font-actions");
    expect(markup).not.toContain(">one-action</span>");
    expect(markup).not.toContain(">free-action</span>");
  });

  it("orders special abilities by activation type without mutating source order", () => {
    const activations = ["three-actions", "one-action", "aura", "passive", "two-actions", "reaction"] as const;
    const unsortedStatBlock = enemyStatBlockSchema.parse({
      ...statBlock,
      specialAbilities: activations.map((activation) => ({
        ...statBlock.specialAbilities[0],
        name: `Ability ${activation}`,
        activation,
      })),
    });
    const originalNames = unsortedStatBlock.specialAbilities.map(({ name }) => name);
    const markup = render(<EnemyStatBlock statBlock={unsortedStatBlock} />);
    const orderedActivations = ["aura", "passive", "reaction", "one-action", "two-actions", "three-actions"];
    const positions = orderedActivations.map((activation) => markup.indexOf(`>Ability ${activation}</strong>`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(unsortedStatBlock.specialAbilities.map(({ name }) => name)).toEqual(originalNames);
  });

  it("omits the action metadata strip when all three metadata values are empty", () => {
    const statBlockWithoutActionMetadata = enemyStatBlockSchema.parse({
      schemaVersion: 1,
      specialAbilities: [{ ...statBlock.specialAbilities[0], frequency: null, area: null, save: null }],
    });
    const markup = render(<EnemyStatBlock statBlock={statBlockWithoutActionMetadata} />);

    expect(markup).not.toContain('data-enemy-action-metadata="true"');
  });

  it("surfaces combat-critical values in grouped sections", () => {
    const markup = render(<EnemyStatBlock statBlock={statBlock} />);
    const summaryStart = markup.indexOf('data-enemy-stat-summary="true"');
    const summary = markup.slice(summaryStart, markup.indexOf("</section>", summaryStart) + "</section>".length);

    expect(markup).toContain('data-enemy-stat-summary="true"');
    for (const section of ["awareness", "capabilities", "defenses", "offense", "parser-notes"]) expect(markup).toContain(`data-enemy-section="${section}"`);
    for (const value of ["COMBAT SUMMARY", "PERCEPTION", "SENSES / RULES", "darkvision", "Through smoke", "SPEED / MOVEMENT", "ARMOR CLASS", "HIT POINTS", "FORTITUDE", "REFLEX", "WILL", "180", "30 feet", "DC 25", "ATK +20", "2d8+8"]) expect(markup).toContain(value);
    expect(summary.indexOf("SENSES / RULES")).toBeLessThan(summary.indexOf("SPEED / MOVEMENT"));
    expect(summary.indexOf("SPEED / MOVEMENT")).toBeLessThan(summary.indexOf("ARMOR CLASS"));
    expect(summary.indexOf("ARMOR CLASS")).toBeLessThan(summary.indexOf("HIT POINTS"));
    expect(summary.indexOf("HIT POINTS")).toBeLessThan(summary.indexOf("FORTITUDE"));
    expect(summary.indexOf("FORTITUDE")).toBeLessThan(summary.indexOf("REFLEX"));
    expect(summary.indexOf("REFLEX")).toBeLessThan(summary.indexOf("WILL"));
    expect(summary).toContain(">Land</span>");
    expect(summary).not.toContain(">Fly</span>");
    expect(summary).not.toContain("Climb 20 feet");
    expect(markup).toContain("Climb 20 feet");

    const flyingStatBlock = enemyStatBlockSchema.parse({ ...statBlock, movement: [...statBlock.movement, { mode: "flying", speed: "60 feet", notes: "Needs room" }] });
    const flyingMarkup = render(<EnemyStatBlock statBlock={flyingStatBlock} />);
    const flyingSummaryStart = flyingMarkup.indexOf('data-enemy-stat-summary="true"');
    const flyingSummary = flyingMarkup.slice(flyingSummaryStart, flyingMarkup.indexOf("</section>", flyingSummaryStart) + "</section>".length);
    expect(flyingSummary).toContain(">Fly</span>");
    expect(flyingSummary).toContain("60 feet");
    expect(flyingSummary).not.toContain("Needs room");
    expect(markup).toContain("aria-hidden=\"true\"");
  });

  it("orders spell ranks from cantrips through tenth level when displayed", () => {
    const unsortedStatBlock = enemyStatBlockSchema.parse({
      ...statBlock,
      spellcasting: [{
        ...statBlock.spellcasting[0],
        entries: [
          { rank: "10th", spells: ["teleport"], uses: null, frequency: null, notes: "" },
          { rank: "at will", spells: ["mindlink"], uses: null, frequency: null, notes: "" },
          { rank: "Cantrips", spells: ["daze"], uses: null, frequency: null, notes: "" },
          { rank: "1st", spells: ["fear"], uses: null, frequency: null, notes: "" },
        ],
      }],
    });
    const markup = render(<EnemyStatBlock embedded statBlock={unsortedStatBlock} creatureLevel={7} />);

    expect(markup).toContain("Cantrip");
    expect(markup).toContain("Cast as 4th-level");
    expect(markup.indexOf(">Cantrip</strong>")).toBeLessThan(markup.indexOf(">1st</strong>"));
    expect(markup.indexOf(">1st</strong>")).toBeLessThan(markup.indexOf(">10th</strong>"));
    expect(markup.indexOf(">10th</strong>")).toBeLessThan(markup.indexOf(">at will</strong>"));
  });

  it("omits blank optional rows while keeping concise empty states", () => {
    const markup = render(<EnemyStatBlock statBlock={enemyStatBlockSchema.parse({ schemaVersion: 1 })} />);

    expect(markup).toContain('data-enemy-section="awareness"');
    expect(markup).toContain('data-enemy-section="capabilities"');
    expect(markup).toContain('data-enemy-section="defenses"');
    expect(markup).toContain('data-enemy-section="offense"');
    expect(markup).not.toContain('data-enemy-action-metadata="true"');
    expect(markup).not.toContain("Adjustment note");
    expect(markup).not.toContain("Range");
    expect(markup).not.toContain("Frequency");
    expect(markup).not.toContain("Trigger");
    expect(markup).not.toContain("Source text");
    expect(markup).toContain(">-</span>");
    expect(markup.match(/data-enemy-empty-state="true"/g)).toHaveLength(8);
  });
});
