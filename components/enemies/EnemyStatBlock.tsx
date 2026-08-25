import { Brain, Eye, Shield, Swords, TriangleAlert, type LucideIcon } from "lucide-react";
import { getActionIcon } from "@/lib/enemies/action-icons";
import { cantripCastLevel, isCantripRank, sortSpellEntries, spellRankLabel, spellRankLabelForLevel } from "@/lib/enemies/spell-ranks";
import type { ReactNode } from "react";
import type { EnemyStatBlockV1 } from "@/lib/validation/enemy";

type Accent = "amber" | "cyan" | "pink" | "purple";
type SpecialAbility = EnemyStatBlockV1["specialAbilities"][number];

const specialAbilityActivationOrder: Record<SpecialAbility["activation"], number> = {
  aura: 0,
  passive: 1,
  reaction: 2,
  "one-action": 3,
  "two-actions": 4,
  "three-actions": 5,
  "free-action": 6,
  other: 7,
};

function sortSpecialAbilities(abilities: readonly SpecialAbility[]) {
  return abilities.map((ability, index) => ({ ability, index })).sort((left, right) => specialAbilityActivationOrder[left.ability.activation] - specialAbilityActivationOrder[right.ability.activation] || left.index - right.index).map(({ ability }) => ability);
}

const accentStyles: Record<Accent, { border: string; icon: string; label: string; value: string }> = {
  amber: { border: "border-[rgba(245,184,75,.3)]", icon: "text-[var(--amber)]", label: "text-[var(--amber)]", value: "text-[var(--amber)]" },
  cyan: { border: "border-[rgba(98,232,255,.28)]", icon: "text-[var(--cyan)]", label: "text-[var(--cyan)]", value: "text-[var(--cyan)]" },
  pink: { border: "border-[rgba(255,92,154,.28)]", icon: "text-[var(--pink)]", label: "text-[var(--pink)]", value: "text-[var(--pink)]" },
  purple: { border: "border-[rgba(185,146,255,.3)]", icon: "text-[var(--purple)]", label: "text-[var(--purple)]", value: "text-[var(--purple)]" },
};

function StatLine({ label, children, valueClassName, compact = false }: { label: string; children: ReactNode; valueClassName?: string; compact?: boolean }) {
  const layoutClassName = compact ? "flex min-w-0 flex-wrap items-baseline gap-x-[6px] gap-y-[2px]" : "grid min-w-0 grid-cols-[minmax(100px,.34fr)_minmax(0,1fr)] gap-3 max-[500px]:grid-cols-1 max-[500px]:gap-1";
  return <div data-enemy-compact-line={compact ? "true" : undefined} className={`${layoutClassName} border-b border-[rgba(139,151,169,.12)] py-[6px] last:border-b-0`}><strong className="text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">{label}</strong><span className={`${valueClassName ?? "text-[var(--muted)]"} min-w-0 text-[10px] leading-[1.5] [overflow-wrap:anywhere]`}>{children}</span></div>;
}

function Entry({ children }: { children: ReactNode }) {
  return <article className="grid min-w-0 gap-[5px] border border-[rgba(139,151,169,.18)] bg-[rgba(139,151,169,.025)] p-[10px]">{children}</article>;
}

function ListText({ values }: { values: string[] }) {
  return values.length ? values.join(", ") : "None recorded";
}

function modifierText(value: number) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function OptionalStatLine({ label, value, valueClassName, compact = false }: { label: string; value: string | null; valueClassName?: string; compact?: boolean }) {
  return value ? <StatLine label={label} valueClassName={valueClassName} compact={compact}>{value}</StatLine> : null;
}

function OptionalActionMetadataLine({ label, value }: { label: string; value: string | null }) {
  return value?.trim() ? <div className="flex min-w-0 flex-wrap items-baseline gap-x-[6px] gap-y-[2px] border-b border-[rgba(139,151,169,.12)] pl-0 pr-[8px] py-[6px] last:border-b-0 min-[500px]:-mt-[5px] min-[500px]:border-b-0 min-[500px]:border-r min-[500px]:pt-[11px] min-[500px]:pb-[13px] last:border-r-0"><strong className="text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">{label}</strong><span className="min-w-0 text-[var(--muted)] text-[10px] leading-[1.5] [overflow-wrap:anywhere]">{value}</span></div> : null;
}

function ActionValue({ value }: { value: string }) {
  const action = getActionIcon(value);
  if (!action) return <>{value}</>;
  return <span data-action-glyph={action.name} title={action.label} className="inline-flex items-center leading-none"><span aria-hidden="true" className="font-actions text-[1.75em] leading-none">{action.glyph}</span><span className="sr-only">{action.label}</span></span>;
}

function OptionalActionStatLine({ label, value }: { label: string; value: string | null }) {
  return value ? <StatLine compact label={label}><ActionValue value={value} /></StatLine> : null;
}

function AbilityActivation({ activation, actionCost }: { activation: string; actionCost: string | null }) {
  const activationAction = getActionIcon(activation);
  const actionCostAction = getActionIcon(actionCost);
  const showActionCost = Boolean(actionCost) && (!activationAction || !actionCostAction || activationAction.name !== actionCostAction.name);
  return <><ActionValue value={activation} />{showActionCost ? <><span aria-hidden="true">{" // "}</span><ActionValue value={actionCost!} /></> : null}</>;
}

function EmptyState({ children = "None recorded" }: { children?: ReactNode }) {
  return <p data-enemy-empty-state="true" className="m-0 text-[var(--dim)] text-[9px] leading-[1.5]">{children}</p>;
}

function Subsection({ title, children, accent = "cyan" }: { title: string; children: ReactNode; accent?: Accent }) {
  return <div className="grid min-w-0 gap-[4px]" data-enemy-subsection={title.toLowerCase().replaceAll(" ", "-")}><p className={`m-0 font-mono text-[8px] tracking-[.1em] ${accentStyles[accent].label}`}>{title}</p>{children}</div>;
}

function StatSection({ title, section, icon: Icon, accent, children, className = "" }: { title: string; section: string; icon: LucideIcon; accent: Accent; children: ReactNode; className?: string }) {
  const styles = accentStyles[accent];
  return <section data-enemy-section={section} className={`grid min-w-0 gap-[8px] border-y pt-[12px] pb-[12px] ${styles.border} ${className}`}><div className="flex min-w-0 items-center gap-2"><Icon aria-hidden="true" size={14} className={`shrink-0 ${styles.icon}`} /><h2 className={`m-0 font-mono text-[9px] tracking-[.13em] ${styles.label}`}>{title}</h2></div>{children}</section>;
}

function CombatMetric({ label, children, accent, className = "" }: { label: string; children: ReactNode; accent: Accent; className?: string }) {
  const styles = accentStyles[accent];
  return <div className={`grid min-w-0 gap-[4px] border-l-2 px-[9px] py-[7px] ${styles.border} ${className}`}><span className={`font-mono text-[8px] tracking-[.1em] ${styles.label}`}>{label}</span><div className={`min-w-0 font-mono text-[17px] leading-[1.1] [overflow-wrap:anywhere] ${styles.value}`}>{children}</div></div>;
}

function MovementSpeed({ label, speed }: { label: "Land" | "Fly"; speed: string | null }) {
  return <div className="grid min-w-0 gap-[4px] border border-[rgba(185,146,255,.28)] p-[8px]"><span className="text-[var(--purple)] font-mono text-[9px]">{label}</span><strong className={`min-w-0 font-mono text-[17px] leading-[1.1] [overflow-wrap:anywhere] ${speed ? "text-[var(--purple)]" : "text-[var(--dim)]"}`}>{speed || "-"}</strong></div>;
}

function SpellEntryHeading({ rank, creatureLevel }: { rank: string; creatureLevel?: number | null }) {
  return <><strong className="text-[var(--purple)] font-mono text-[10px]">{spellRankLabel(rank)}</strong>{isCantripRank(rank) && creatureLevel !== undefined && creatureLevel !== null ? <span className="text-[var(--dim)] text-[9px]">{" // Cast as "}{spellRankLabelForLevel(cantripCastLevel(creatureLevel))}-level</span> : null}</>;
}

function CombatSummary({ statBlock }: { statBlock: EnemyStatBlockV1 }) {
  const landMovement = statBlock.movement.find(({ mode }) => mode.trim().toLocaleLowerCase() === "land");
  const flyMovement = statBlock.movement.find(({ mode }) => ["fly", "flying"].includes(mode.trim().toLocaleLowerCase()));

  return <section data-enemy-stat-summary="true" className="grid min-w-0 gap-[9px] border border-[rgba(98,232,255,.2)] bg-[rgba(98,232,255,.025)] p-[9px]"><p className="m-0 text-[var(--ink)] font-mono text-[8px] font-semibold tracking-[.13em]">COMBAT SUMMARY</p><div className="grid min-w-0 gap-[6px] min-[761px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"><CombatMetric label="PERCEPTION" accent="cyan"><div className="grid min-w-0 gap-[7px]"><span>{modifierText(statBlock.perception.modifier)}</span><div className="grid min-w-0 gap-[4px] border-t border-[rgba(98,232,255,.16)] pt-[6px] font-sans text-[10px] leading-[1.4]"><span className="font-mono text-[8px] tracking-[.08em]">SENSES / RULES</span>{statBlock.perception.senses.length ? statBlock.perception.senses.map((sense, index) => <span key={`${sense.name}-${index}`} className="[overflow-wrap:anywhere]">{sense.name}{sense.range ? ` // Range: ${sense.range}` : ""}{sense.notes ? ` // Notes: ${sense.notes}` : ""}</span>) : null}{statBlock.perception.notes ? <span className="[overflow-wrap:anywhere]">Notes // {statBlock.perception.notes}</span> : null}{!statBlock.perception.senses.length && !statBlock.perception.notes ? <span className="text-[var(--dim)]">None recorded</span> : null}</div></div></CombatMetric><CombatMetric label="SPEED / MOVEMENT" accent="purple"><div className={`grid min-w-0 gap-[6px] ${flyMovement ? "grid-cols-2" : "grid-cols-1"}`}><MovementSpeed label="Land" speed={landMovement?.speed ?? null} />{flyMovement ? <MovementSpeed label="Fly" speed={flyMovement.speed} /> : null}</div></CombatMetric></div><div className="grid min-w-0 grid-cols-2 gap-[6px] min-[761px]:grid-cols-5"><CombatMetric label="ARMOR CLASS" accent="pink">{statBlock.defenses.armorClass}</CombatMetric><CombatMetric label="HIT POINTS" accent="pink"><div className="flex min-w-0 flex-wrap gap-x-[9px] gap-y-[4px]">{statBlock.defenses.hitPoints.length ? statBlock.defenses.hitPoints.map((entry, index) => <span key={`${entry.label}-${index}`} className="[overflow-wrap:anywhere]">{entry.label} {entry.value}{entry.notes ? ` // ${entry.notes}` : ""}</span>) : <span className="text-[var(--dim)]">-</span>}</div></CombatMetric><CombatMetric label="FORTITUDE" accent="amber">{modifierText(statBlock.defenses.saves.fortitude.modifier)}</CombatMetric><CombatMetric label="REFLEX" accent="amber">{modifierText(statBlock.defenses.saves.reflex.modifier)}</CombatMetric><CombatMetric label="WILL" accent="amber">{modifierText(statBlock.defenses.saves.will.modifier)}</CombatMetric></div></section>;
}

const abilityLabels: Record<keyof EnemyStatBlockV1["abilityModifiers"], string> = {
  strength: "STRENGTH",
  dexterity: "DEXTERITY",
  constitution: "CONSTITUTION",
  intelligence: "INTELLIGENCE",
  wisdom: "WISDOM",
  charisma: "CHARISMA",
};

const saveLabels: Record<keyof EnemyStatBlockV1["defenses"]["saves"], string> = {
  fortitude: "FORTITUDE",
  reflex: "REFLEX",
  will: "WILL",
};

export default function EnemyStatBlock({ statBlock, embedded = false, creatureLevel }: { statBlock: EnemyStatBlockV1 | null | undefined; embedded?: boolean; creatureLevel?: number | null }) {
  if (!statBlock) return <p className="m-0 text-[var(--dim)] text-[10px]">No structured mechanics are available.</p>;
  const shellClassName = embedded ? "grid min-w-0 gap-[12px]" : "grid min-w-0 gap-[14px] border border-[rgba(255,92,154,.25)] bg-[rgba(255,92,154,.035)] p-[14px]";

  return <section data-enemy-stat-block="true" className={shellClassName}>
    <div className="flex min-w-0 items-center gap-2 border-b border-[rgba(255,92,154,.18)] pb-[10px]"><Swords aria-hidden="true" size={15} className="shrink-0 text-[var(--pink)]" /><p className="m-0 text-[var(--pink)] font-mono text-[9px] tracking-[.13em]">STRUCTURED STAT BLOCK{" // "}{embedded ? "REVIEW" : "GM ONLY"}</p><span className="ml-auto shrink-0 text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">SCHEMA V1</span></div>
    <CombatSummary statBlock={statBlock} />

    <div data-enemy-band="awareness-capabilities" className="grid min-w-0 gap-[12px] min-[761px]:grid-cols-2">
      <StatSection title="AWARENESS" section="awareness" icon={Eye} accent="cyan">
        <Subsection title="RECALL KNOWLEDGE" accent="cyan">
          {statBlock.recallKnowledge ? <><StatLine label="DC">{statBlock.recallKnowledge.dc}</StatLine>{statBlock.recallKnowledge.entries.length ? <StatLine label="Knowledge entries">{statBlock.recallKnowledge.entries.map((entry) => `${entry.trait} (${entry.skill})`).join(", ")}</StatLine> : null}<OptionalStatLine label="Adjustment note" value={statBlock.recallKnowledge.adjustmentNote} /></> : <EmptyState />}
        </Subsection>
        <Subsection title="PERCEPTION" accent="cyan">
          <StatLine label="Modifier">{modifierText(statBlock.perception.modifier)}</StatLine>
          {statBlock.perception.senses.length ? statBlock.perception.senses.map((sense, index) => <StatLine key={`${sense.name}-${index}`} label={`Sense ${index + 1}`}>{sense.name}{sense.range ? ` // Range: ${sense.range}` : ""}{sense.notes ? ` // Notes: ${sense.notes}` : ""}</StatLine>) : null}
          <OptionalStatLine label="Notes" value={statBlock.perception.notes} />
        </Subsection>
        <Subsection title="LANGUAGES" accent="cyan">
          <StatLine label="Known languages"><ListText values={statBlock.languages.names} /></StatLine>
          <StatLine label="Additional count">{statBlock.languages.additionalCount}</StatLine>
          <OptionalStatLine label="Communication notes" value={statBlock.languages.communicationNotes} />
        </Subsection>
      </StatSection>

      <StatSection title="CAPABILITIES" section="capabilities" icon={Brain} accent="purple">
        <Subsection title="SKILLS" accent="purple">
          {statBlock.skills.length ? statBlock.skills.map((skill, index) => <StatLine key={`${skill.name}-${index}`} label={skill.name}>{modifierText(skill.modifier)}{skill.notes ? ` // Notes: ${skill.notes}` : ""}</StatLine>) : <EmptyState />}
        </Subsection>
        <Subsection title="ABILITY MODIFIERS" accent="purple">
          <div data-enemy-ability-modifiers="true" className="grid grid-cols-2 gap-x-[10px] border-y border-[rgba(185,146,255,.16)] min-[500px]:grid-cols-3">{Object.entries(abilityLabels).map(([abilityKey, label]) => <div className="grid min-w-0 gap-[3px] border-b border-[rgba(139,151,169,.12)] px-[6px] py-[7px] last:border-b-0" key={abilityKey}><span className="text-[var(--dim)] font-mono text-[8px] tracking-[.06em] [overflow-wrap:anywhere]">{label}</span><strong className="text-[var(--purple)] font-mono text-[12px]">{modifierText(statBlock.abilityModifiers[abilityKey as keyof EnemyStatBlockV1["abilityModifiers"]])}</strong></div>)}</div>
        </Subsection>
        <Subsection title="ITEMS" accent="purple">
          {statBlock.items.length ? <StatLine label="Carried items"><ListText values={statBlock.items} /></StatLine> : <EmptyState />}
        </Subsection>
        <Subsection title="MOVEMENT" accent="purple">
          {statBlock.movement.length ? statBlock.movement.map((movement, index) => <StatLine key={`${movement.mode}-${index}`} label={movement.mode}>{movement.speed}{movement.notes ? ` // Notes: ${movement.notes}` : ""}</StatLine>) : <EmptyState />}
        </Subsection>
      </StatSection>
    </div>

    <StatSection title="DEFENSES" section="defenses" icon={Shield} accent="amber">
      <div className="grid min-w-0 gap-[10px] min-[520px]:grid-cols-2">
        <Subsection title="CORE DEFENSES" accent="amber">
          <StatLine label="Armor class">{statBlock.defenses.armorClass}</StatLine>
          <OptionalStatLine label="Armor class notes" value={statBlock.defenses.armorClassNotes} />
          {Object.entries(saveLabels).map(([saveKey, label]) => { const save = statBlock.defenses.saves[saveKey as keyof EnemyStatBlockV1["defenses"]["saves"]]; return <StatLine key={saveKey} label={label}>{modifierText(save.modifier)}{save.notes ? ` // Notes: ${save.notes}` : ""}</StatLine>; })}
          {statBlock.defenses.hitPoints.length ? statBlock.defenses.hitPoints.map((entry, index) => <StatLine key={`${entry.label}-${index}`} label={`Hit points ${index + 1}`}>{entry.label}: {entry.value}{entry.notes ? ` // Notes: ${entry.notes}` : ""}</StatLine>) : null}
        </Subsection>
        <Subsection title="DAMAGE PROFILE" accent="amber">
          {statBlock.defenses.immunities.length ? <StatLine label="Immunities"><ListText values={statBlock.defenses.immunities} /></StatLine> : null}
          {statBlock.defenses.resistances.length ? <StatLine label="Resistances"><ListText values={statBlock.defenses.resistances} /></StatLine> : null}
          {statBlock.defenses.weaknesses.length ? <StatLine label="Weaknesses"><ListText values={statBlock.defenses.weaknesses} /></StatLine> : null}
          {!statBlock.defenses.immunities.length && !statBlock.defenses.resistances.length && !statBlock.defenses.weaknesses.length ? <EmptyState /> : null}
        </Subsection>
      </div>
      <OptionalStatLine label="Defense notes" value={statBlock.defenses.notes} />
    </StatSection>

    <StatSection title="OFFENSE" section="offense" icon={Swords} accent="pink">
      <Subsection title="STRIKES" accent="pink">
        {statBlock.strikes.length ? statBlock.strikes.map((strike, index) => <Entry key={`${strike.category}-${strike.name}-${index}`}>
          <div data-enemy-strike-heading="true" className="flex min-w-0 flex-wrap items-baseline gap-x-[10px] gap-y-[5px] border-b border-[rgba(255,92,154,.18)] pb-[7px]"><div className="flex min-w-0 flex-wrap items-baseline gap-x-[7px] gap-y-[3px]"><span className="text-[var(--pink)] font-mono text-[8px] tracking-[.08em]">{strike.category.toUpperCase()}</span><strong data-enemy-strike-name="true" className="min-w-0 text-[var(--ink)] text-[11px] [overflow-wrap:anywhere]">{strike.name || "Unnamed strike"}</strong><span data-enemy-strike-attack="true" className="shrink-0 text-[var(--pink)] font-mono text-[12px] font-semibold">ATK {modifierText(strike.attackModifier)}</span></div></div>
          {strike.damage.length ? <div className="grid min-w-0 gap-[5px] border-b border-[rgba(139,151,169,.12)] pb-[7px]"><p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">DAMAGE</p><div className="flex min-w-0 flex-wrap gap-x-[10px] gap-y-[4px]">{strike.damage.map((damage, damageIndex) => <span className="text-[var(--ink)] text-[10px] font-medium [overflow-wrap:anywhere]" key={`${damage.formula}-${damageIndex}`}>{damage.formula} {damage.type}{damage.notes ? ` // ${damage.notes}` : ""}</span>)}</div></div> : null}
          {strike.activation || strike.reach || strike.range || strike.traits.length ? <div data-enemy-strike-details="true" className="grid min-w-0 gap-0 border-b border-[rgba(139,151,169,.12)] min-[500px]:grid-cols-2 min-[500px]:gap-x-[12px]"><OptionalActionStatLine label="Activation" value={strike.activation} /><OptionalStatLine compact label="Reach" value={strike.reach} /><OptionalStatLine compact label="Range" value={strike.range} /><OptionalStatLine compact label="Traits" value={strike.traits.length ? ListText({ values: strike.traits }) as string : null} /></div> : null}
          <OptionalStatLine compact label="Rider" value={strike.rider} />
          <OptionalStatLine label="Source text" value={strike.rawText} valueClassName="text-[var(--dim)]" />
        </Entry>) : <EmptyState />}
      </Subsection>
      <Subsection title="SPELLCASTING" accent="purple">
        {statBlock.spellcasting.length ? statBlock.spellcasting.map((casting, index) => <Entry key={`${casting.tradition}-${index}`}>
          <div data-enemy-spellcasting-heading="true" className="flex min-w-0 flex-wrap items-baseline gap-x-[10px] gap-y-[5px] border-b border-[rgba(185,146,255,.2)] pb-[7px]"><div className="flex min-w-0 flex-wrap items-baseline gap-x-[7px] gap-y-[3px]"><strong data-enemy-spellcasting-name="true" className="min-w-0 text-[var(--ink)] text-[11px] [overflow-wrap:anywhere]">{casting.tradition || "Unnamed tradition"}</strong><span className="text-[var(--purple)] font-mono text-[8px] tracking-[.08em]">{casting.method.toUpperCase()}</span><div data-enemy-spellcasting-metrics="true" className="flex flex-wrap gap-x-[9px] gap-y-[3px] text-[var(--purple)] font-mono text-[11px] font-semibold">{casting.dc !== null ? <span>DC {casting.dc}</span> : null}{casting.attackModifier !== null ? <span>ATK {modifierText(casting.attackModifier)}</span> : null}</div></div></div>
          {casting.entries.length ? sortSpellEntries(casting.entries).map((entry, entryIndex) => <div className="grid min-w-0 gap-[5px] border-b border-[rgba(139,151,169,.12)] py-[7px] last:border-b-0" key={`${entry.rank}-${entryIndex}`}><div className="flex min-w-0 flex-wrap items-baseline gap-x-[8px] gap-y-[3px]"><SpellEntryHeading rank={entry.rank} creatureLevel={creatureLevel} />{entry.spells.length ? <span className="text-[var(--muted)] text-[10px] [overflow-wrap:anywhere]"><ListText values={entry.spells} /></span> : null}</div><div className="grid min-w-0 gap-0 min-[500px]:grid-cols-2 min-[500px]:gap-x-[12px]"><OptionalStatLine compact label="Uses" value={entry.uses} /><OptionalStatLine compact label="Frequency" value={entry.frequency} /><OptionalStatLine compact label="Entry notes" value={entry.notes} /></div></div>) : <EmptyState />}
          <OptionalStatLine compact label="Spellcasting notes" value={casting.notes} />
        </Entry>) : <EmptyState />}
      </Subsection>
      <Subsection title="SPECIAL ABILITIES" accent="pink">
        {statBlock.specialAbilities.length ? sortSpecialAbilities(statBlock.specialAbilities).map((ability, index) => {
          const hasActionMetadata = [ability.frequency, ability.area, ability.save].some((value) => Boolean(value?.trim()));
          return <Entry key={`${ability.section}-${ability.name}-${index}`}>
          <div data-enemy-special-ability-heading="true" className="flex min-w-0 flex-wrap items-center gap-x-[7px] gap-y-[5px] border-b border-[rgba(255,92,154,.18)] pb-[7px]"><strong data-enemy-special-ability-name="true" className="min-w-0 text-[var(--ink)] text-[11px] [overflow-wrap:anywhere]">{ability.name || "Unnamed ability"}</strong><span data-enemy-special-ability-action="true" className="flex shrink-0 items-center text-[var(--pink)] font-mono text-[14px] font-semibold leading-none"><AbilityActivation activation={ability.activation} actionCost={ability.actionCost} /></span></div>
          <OptionalStatLine compact label="Traits" value={ability.traits.length ? ability.traits.join(", ") : null} />
          <OptionalStatLine compact label="Trigger" value={ability.trigger} />
          <OptionalStatLine compact label="Requirements" value={ability.requirements} />
          {hasActionMetadata ? <div data-enemy-action-metadata="true" className="grid w-full min-w-0 border-b border-[rgba(139,151,169,.12)] min-[500px]:grid-cols-3 min-[500px]:[&>*:not(:first-child)]:pl-[10px]"><OptionalActionMetadataLine label="Save" value={ability.save} /><OptionalActionMetadataLine label="Frequency" value={ability.frequency} /><OptionalActionMetadataLine label="Area" value={ability.area} /></div> : null}
          <OptionalStatLine compact label="Cooldown" value={ability.cooldown} />
          {ability.effect ? <StatLine compact label="Effect">{ability.effect}</StatLine> : <EmptyState>Effect not recorded.</EmptyState>}
          <OptionalStatLine compact label="Source text" value={ability.rawText} valueClassName="text-[var(--dim)]" />
        </Entry>;
        }) : <EmptyState />}
      </Subsection>
    </StatSection>

    {statBlock.unparsedFragments.length ? <StatSection title="PARSER NOTES" section="parser-notes" icon={TriangleAlert} accent="amber"><div className="grid min-w-0 gap-[8px]">{statBlock.unparsedFragments.map((fragment, index) => <Entry key={`${fragment.label}-${index}`}><StatLine label="Label">{fragment.label}</StatLine><StatLine label="Text">{fragment.text}</StatLine><StatLine label="Reason">{fragment.reason}</StatLine></Entry>)}</div></StatSection> : null}
  </section>;
}
