"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { editorSelectClassName } from "@/components/ui/editorStyles";
import { spellRankOptions } from "@/lib/enemies/spell-ranks";
import type { EnemyStatBlockV1 } from "@/lib/validation/enemy";

type Sense = EnemyStatBlockV1["perception"]["senses"][number];
type RecallEntry = NonNullable<EnemyStatBlockV1["recallKnowledge"]>["entries"][number];
type Skill = EnemyStatBlockV1["skills"][number];
type HitPoint = EnemyStatBlockV1["defenses"]["hitPoints"][number];
type Movement = EnemyStatBlockV1["movement"][number];
type Strike = EnemyStatBlockV1["strikes"][number];
type DamagePart = Strike["damage"][number];
type Spellcasting = EnemyStatBlockV1["spellcasting"][number];
type SpellEntry = Spellcasting["entries"][number];
type SpecialAbility = EnemyStatBlockV1["specialAbilities"][number];
type UnparsedFragment = EnemyStatBlockV1["unparsedFragments"][number];
type AbilityKey = keyof EnemyStatBlockV1["abilityModifiers"];
type SaveKey = keyof EnemyStatBlockV1["defenses"]["saves"];

type EnemyStatBlockEditorProps = {
  value: EnemyStatBlockV1;
  onChange: (value: EnemyStatBlockV1) => void;
  disabled?: boolean;
  issues?: readonly EnemyStatBlockIssue[];
};

export type EnemyStatBlockIssue = {
  path: readonly PropertyKey[];
  message: string;
};

type FieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

const inputClassName = "h-[38px] w-full border border-[rgba(139,151,169,.28)] bg-[#0a1118] px-[10px] text-[var(--ink)] font-mono text-[10px] outline-0 focus:border-[var(--cyan)]";
const textAreaClassName = "min-h-[74px] w-full resize-y border border-[rgba(139,151,169,.28)] bg-[#0a1118] p-[9px_10px] text-[var(--ink)] font-mono text-[10px] leading-[1.45] outline-0 focus:border-[var(--cyan)]";
const sectionClassName = "grid min-w-0 gap-[11px] border border-[rgba(139,151,169,.18)] bg-[rgba(10,17,24,.42)] p-[12px]";
const sectionHeadingClassName = "m-0 text-[var(--pink)] font-mono text-[9px] tracking-[.12em]";
const smallButtonClassName = "inline-flex min-h-[30px] items-center justify-center gap-1 border border-[rgba(98,232,255,.3)] bg-[rgba(98,232,255,.05)] px-[9px] text-[var(--cyan)] font-mono text-[8px] tracking-[.08em] cursor-pointer hover:border-[var(--cyan)] hover:bg-[rgba(98,232,255,.1)] disabled:cursor-not-allowed disabled:opacity-45";
const removeButtonClassName = "inline-grid h-[30px] w-[30px] shrink-0 place-items-center border border-[rgba(255,92,154,.25)] bg-transparent text-[var(--pink)] cursor-pointer hover:border-[var(--pink)] hover:bg-[rgba(255,92,154,.1)] disabled:cursor-not-allowed disabled:opacity-45";

const abilityKeys: AbilityKey[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const saveKeys: SaveKey[] = ["fortitude", "reflex", "will"];
const spellMethods = ["prepared", "spontaneous", "innate", "focus", "other"] as const;
const strikeCategories = ["melee", "ranged"] as const;
const abilitySections = ["general", "defensive", "offensive"] as const;
const abilityActivations = ["passive", "free-action", "reaction", "one-action", "two-actions", "three-actions", "aura", "other"] as const;

function Field({ label, children, className = "" }: FieldProps) {
  return <label className={`grid min-w-0 gap-[6px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em] ${className}`}>{label}{children}</label>;
}

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`${sectionClassName} ${className}`}><h3 className={sectionHeadingClassName}>{title}</h3>{children}</section>;
}

type RepeatableListProps<Item> = {
  name: string;
  addLabel: string;
  items: Item[];
  maxItems?: number;
  emptyMessage?: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  children: (item: Item, index: number) => ReactNode;
};

function RepeatableList<Item>({ name, addLabel, items, maxItems, emptyMessage = "Nothing recorded.", onAdd, onRemove, children }: RepeatableListProps<Item>) {
  const canAdd = maxItems === undefined || items.length < maxItems;
  return <div className="grid min-w-0 gap-[8px]" data-enemy-repeatable={name}>
    {items.length ? items.map((item, index) => <div className="flex min-w-0 items-start gap-[8px] border border-[rgba(139,151,169,.14)] p-[9px]" key={`${name}-${index}`}><div className="grid min-w-0 flex-1 gap-[9px]">{children(item, index)}</div><button aria-label={`Remove ${name} ${index + 1}`} className={removeButtonClassName} onClick={() => onRemove(index)} title={`Remove ${name.toLocaleLowerCase()} ${index + 1}`} type="button"><Minus aria-hidden="true" size={14} /></button></div>) : <p className="m-0 text-[var(--dim)] text-[9px]">{emptyMessage}</p>}
    {canAdd ? <button aria-label={`Add ${addLabel}`} className={smallButtonClassName} onClick={onAdd} type="button"><Plus aria-hidden="true" size={13} /> ADD {addLabel.toUpperCase()}</button> : null}
  </div>;
}

function StringList({ name, addLabel, values, maxItems, placeholder, onChange }: { name: string; addLabel: string; values: string[]; maxItems: number; placeholder: string; onChange: (values: string[]) => void }) {
  return <RepeatableList name={name} addLabel={addLabel} items={values} maxItems={maxItems} onAdd={() => onChange([...values, ""])} onRemove={(index) => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>
    {(item, index) => <Field label={`${addLabel} ${index + 1}`}><input aria-label={`${addLabel} ${index + 1}`} className={inputClassName} maxLength={160} placeholder={placeholder} value={item} onChange={(event) => onChange(values.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /></Field>}
  </RepeatableList>;
}

function NumberList({ name, addLabel, values, maxItems, min, max, placeholder, onChange }: { name: string; addLabel: string; values: number[]; maxItems: number; min: number; max: number; placeholder: string; onChange: (values: number[]) => void }) {
  return <RepeatableList name={name} addLabel={addLabel} items={values} maxItems={maxItems} onAdd={() => onChange([...values, 0])} onRemove={(index) => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>
    {(item, index) => <Field label={`${addLabel} ${index + 1}`}><input aria-label={`${addLabel} ${index + 1}`} className={inputClassName} max={max} min={min} placeholder={placeholder} type="number" value={item} onChange={(event) => onChange(values.map((current, itemIndex) => itemIndex === index ? numberValue(event.target.value) : current))} /></Field>}
  </RepeatableList>;
}

function nullableValue(value: string): string | null {
  return value === "" ? null : value;
}

function newRecallKnowledge(): NonNullable<EnemyStatBlockV1["recallKnowledge"]> {
  return { dc: 0, entries: [], adjustmentNote: "" };
}

function newRecallEntry(): RecallEntry {
  return { trait: "", skill: "" };
}

function newSense(): Sense {
  return { name: "", range: null, notes: "" };
}

function newSkill(): Skill {
  return { name: "", modifier: 0, notes: "" };
}

function newHitPoint(): HitPoint {
  return { label: "HP", value: 0, notes: "" };
}

function newMovement(): Movement {
  return { mode: "land", speed: "", notes: "" };
}

function newDamagePart(): DamagePart {
  return { formula: "", type: "", notes: "" };
}

function newStrike(): Strike {
  return { category: "melee", name: "", activation: null, attackModifier: 0, multipleAttackPenalty: [], traits: [], reach: null, range: null, damage: [], rider: "", rawText: "" };
}

function newSpellEntry(): SpellEntry {
  return { rank: "Cantrip", spells: [], uses: null, frequency: null, notes: "" };
}

function newSpellcasting(): Spellcasting {
  return { tradition: "", method: "innate", dc: null, attackModifier: null, entries: [], notes: "" };
}

function newSpecialAbility(): SpecialAbility {
  return { section: "general", name: "", activation: "passive", actionCost: null, traits: [], frequency: null, trigger: null, requirements: null, area: null, save: null, cooldown: null, effect: "", rawText: "" };
}

function newUnparsedFragment(): UnparsedFragment {
  return { label: "", text: "", reason: "" };
}

function numberValue(value: string): number {
  return value === "" ? 0 : Number(value);
}

function formatIssuePath(path: readonly PropertyKey[]) {
  return path.length ? path.map((segment) => {
    if (typeof segment === "number") return `#${segment + 1}`;
    return String(segment).replace(/([A-Z])/g, " $1").toLocaleLowerCase();
  }).join(" / ") : "stat block";
}

export default function EnemyStatBlockEditor({ value, onChange, disabled = false, issues = [] }: EnemyStatBlockEditorProps) {
  const updateRecallKnowledge = (recallKnowledge: EnemyStatBlockV1["recallKnowledge"]) => onChange({ ...value, recallKnowledge });
  const updatePerception = (perception: EnemyStatBlockV1["perception"]) => onChange({ ...value, perception });
  const updateLanguages = (languages: EnemyStatBlockV1["languages"]) => onChange({ ...value, languages });
  const updateDefenses = (defenses: EnemyStatBlockV1["defenses"]) => onChange({ ...value, defenses });

  return <section className="grid min-w-0 gap-[12px] border border-[rgba(255,92,154,.25)] bg-[rgba(255,92,154,.035)] p-[12px]" data-enemy-stat-block-editor="true">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,92,154,.18)] pb-[10px]"><div><p className="m-0 text-[var(--pink)] font-mono text-[9px] tracking-[.13em]">STRUCTURED MECHANICS // GM ONLY</p><p className="m-0 mt-1 text-[var(--dim)] text-[9px]">Enter the creature record as labeled fields. The versioned JSON blob is generated when the enemy is saved.</p></div><span className="shrink-0 border border-[rgba(255,92,154,.25)] px-[8px] py-[5px] text-[var(--pink)] font-mono text-[8px] tracking-[.1em]">SCHEMA V1</span></div>
    {issues.length ? <div className="grid gap-1 border border-[rgba(255,92,154,.35)] bg-[rgba(255,92,154,.07)] p-[9px] text-[var(--pink)]" role="alert"><p className="m-0 font-mono text-[8px] tracking-[.1em]">MECHANICS VALIDATION</p><ul className="m-0 grid gap-1 pl-[16px] text-[9px] leading-[1.45]">{issues.map((issue, index) => <li key={`${formatIssuePath(issue.path)}-${index}`}>{formatIssuePath(issue.path)}: {issue.message}</li>)}</ul></div> : null}
    <fieldset className="grid min-w-0 gap-[12px] border-0 p-0" disabled={disabled}>
      <Section title="RECALL KNOWLEDGE">
        <label className="flex items-center gap-2 text-[var(--ink)] font-mono text-[9px] tracking-[.06em]"><input type="checkbox" checked={value.recallKnowledge !== null} onChange={(event) => updateRecallKnowledge(event.target.checked ? newRecallKnowledge() : null)} /> Include recall knowledge</label>
        {value.recallKnowledge ? <div className="grid min-w-0 gap-[10px]">
          <Field label="DC"><input className={inputClassName} max={60} min={0} type="number" value={value.recallKnowledge.dc} onChange={(event) => updateRecallKnowledge({ ...value.recallKnowledge!, dc: numberValue(event.target.value) })} /></Field>
          <RepeatableList name="recall entries" addLabel="recall entry" items={value.recallKnowledge.entries} maxItems={12} onAdd={() => updateRecallKnowledge({ ...value.recallKnowledge!, entries: [...value.recallKnowledge!.entries, newRecallEntry()] })} onRemove={(index) => updateRecallKnowledge({ ...value.recallKnowledge!, entries: value.recallKnowledge!.entries.filter((_, itemIndex) => itemIndex !== index) })}>
            {(entry, index) => <div className="grid grid-cols-2 gap-[9px] max-[600px]:grid-cols-1"><Field label="Trait"><input className={inputClassName} maxLength={80} value={entry.trait} onChange={(event) => updateRecallKnowledge({ ...value.recallKnowledge!, entries: value.recallKnowledge!.entries.map((current, itemIndex) => itemIndex === index ? { ...current, trait: event.target.value } : current) })} /></Field><Field label="Skill"><input className={inputClassName} maxLength={80} value={entry.skill} onChange={(event) => updateRecallKnowledge({ ...value.recallKnowledge!, entries: value.recallKnowledge!.entries.map((current, itemIndex) => itemIndex === index ? { ...current, skill: event.target.value } : current) })} /></Field></div>}
          </RepeatableList>
          <Field label="Adjustment note"><textarea className={textAreaClassName} maxLength={800} value={value.recallKnowledge.adjustmentNote} onChange={(event) => updateRecallKnowledge({ ...value.recallKnowledge!, adjustmentNote: event.target.value })} /></Field>
        </div> : <p className="m-0 text-[var(--dim)] text-[9px]">No recall knowledge recorded.</p>}
      </Section>

      <div className="grid min-w-0 grid-cols-2 gap-[12px] max-[760px]:grid-cols-1">
        <Section title="PERCEPTION">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] max-[500px]:grid-cols-1"><Field label="Modifier"><input className={inputClassName} max={50} min={-50} type="number" value={value.perception.modifier} onChange={(event) => updatePerception({ ...value.perception, modifier: numberValue(event.target.value) })} /></Field><Field label="Notes"><textarea className={textAreaClassName} maxLength={800} value={value.perception.notes} onChange={(event) => updatePerception({ ...value.perception, notes: event.target.value })} /></Field></div>
          <RepeatableList name="senses" addLabel="sense" items={value.perception.senses} maxItems={24} onAdd={() => updatePerception({ ...value.perception, senses: [...value.perception.senses, newSense()] })} onRemove={(index) => updatePerception({ ...value.perception, senses: value.perception.senses.filter((_, itemIndex) => itemIndex !== index) })}>
            {(sense, index) => <div className="grid grid-cols-3 gap-[9px] max-[600px]:grid-cols-1"><Field label="Name"><input className={inputClassName} maxLength={120} value={sense.name} onChange={(event) => updatePerception({ ...value.perception, senses: value.perception.senses.map((current, itemIndex) => itemIndex === index ? { ...current, name: event.target.value } : current) })} /></Field><Field label="Range"><input className={inputClassName} maxLength={80} placeholder="Optional" value={sense.range ?? ""} onChange={(event) => updatePerception({ ...value.perception, senses: value.perception.senses.map((current, itemIndex) => itemIndex === index ? { ...current, range: nullableValue(event.target.value) } : current) })} /></Field><Field label="Notes"><input className={inputClassName} maxLength={400} value={sense.notes} onChange={(event) => updatePerception({ ...value.perception, senses: value.perception.senses.map((current, itemIndex) => itemIndex === index ? { ...current, notes: event.target.value } : current) })} /></Field></div>}
          </RepeatableList>
        </Section>

        <Section title="LANGUAGES">
          <StringList name="language names" addLabel="language" values={value.languages.names} maxItems={32} placeholder="Common" onChange={(names) => updateLanguages({ ...value.languages, names })} />
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] max-[500px]:grid-cols-1"><Field label="Additional count"><input className={inputClassName} max={99} min={0} type="number" value={value.languages.additionalCount} onChange={(event) => updateLanguages({ ...value.languages, additionalCount: numberValue(event.target.value) })} /></Field><Field label="Communication notes"><textarea className={textAreaClassName} maxLength={800} value={value.languages.communicationNotes} onChange={(event) => updateLanguages({ ...value.languages, communicationNotes: event.target.value })} /></Field></div>
        </Section>
      </div>

      <Section title="SKILLS">
        <RepeatableList name="skills" addLabel="skill" items={value.skills} maxItems={48} onAdd={() => onChange({ ...value, skills: [...value.skills, newSkill()] })} onRemove={(index) => onChange({ ...value, skills: value.skills.filter((_, itemIndex) => itemIndex !== index) })}>
          {(skill, index) => <div className="grid grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)] gap-[9px] max-[600px]:grid-cols-1"><Field label="Name"><input className={inputClassName} maxLength={120} value={skill.name} onChange={(event) => onChange({ ...value, skills: value.skills.map((current, itemIndex) => itemIndex === index ? { ...current, name: event.target.value } : current) })} /></Field><Field label="Modifier"><input className={inputClassName} max={50} min={-50} type="number" value={skill.modifier} onChange={(event) => onChange({ ...value, skills: value.skills.map((current, itemIndex) => itemIndex === index ? { ...current, modifier: numberValue(event.target.value) } : current) })} /></Field><Field label="Notes"><input className={inputClassName} maxLength={400} value={skill.notes} onChange={(event) => onChange({ ...value, skills: value.skills.map((current, itemIndex) => itemIndex === index ? { ...current, notes: event.target.value } : current) })} /></Field></div>}
        </RepeatableList>
      </Section>

      <Section title="ABILITY MODIFIERS">
        <div className="grid grid-cols-3 gap-[9px] max-[600px]:grid-cols-2 max-[420px]:grid-cols-1">{abilityKeys.map((abilityKey) => <Field key={abilityKey} label={abilityKey.toUpperCase()}><input className={inputClassName} max={50} min={-50} type="number" value={value.abilityModifiers[abilityKey]} onChange={(event) => onChange({ ...value, abilityModifiers: { ...value.abilityModifiers, [abilityKey]: numberValue(event.target.value) } })} /></Field>)}</div>
      </Section>

      <Section title="ITEMS">
        <StringList name="items" addLabel="item" values={value.items} maxItems={64} placeholder="Item or carried gear" onChange={(items) => onChange({ ...value, items })} />
      </Section>

      <Section title="DEFENSES">
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-[10px] max-[500px]:grid-cols-1"><Field label="Armor class"><input className={inputClassName} max={80} min={0} type="number" value={value.defenses.armorClass} onChange={(event) => updateDefenses({ ...value.defenses, armorClass: numberValue(event.target.value) })} /></Field><Field label="Armor class notes"><textarea className={textAreaClassName} maxLength={800} value={value.defenses.armorClassNotes} onChange={(event) => updateDefenses({ ...value.defenses, armorClassNotes: event.target.value })} /></Field></div>
        <div className="grid min-w-0 gap-[8px]"><p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">SAVES</p><div className="grid grid-cols-3 gap-[9px] max-[600px]:grid-cols-1">{saveKeys.map((saveKey) => <div className="grid gap-[7px] border border-[rgba(139,151,169,.14)] p-[9px]" key={saveKey}><p className="m-0 text-[var(--ink)] font-mono text-[9px]">{saveKey.toUpperCase()}</p><Field label="Modifier"><input className={inputClassName} max={50} min={-50} type="number" value={value.defenses.saves[saveKey].modifier} onChange={(event) => updateDefenses({ ...value.defenses, saves: { ...value.defenses.saves, [saveKey]: { ...value.defenses.saves[saveKey], modifier: numberValue(event.target.value) } } })} /></Field><Field label="Notes"><input className={inputClassName} maxLength={400} value={value.defenses.saves[saveKey].notes} onChange={(event) => updateDefenses({ ...value.defenses, saves: { ...value.defenses.saves, [saveKey]: { ...value.defenses.saves[saveKey], notes: event.target.value } } })} /></Field></div>)}</div></div>
        <RepeatableList name="hit points" addLabel="hit point pool" items={value.defenses.hitPoints} maxItems={12} onAdd={() => updateDefenses({ ...value.defenses, hitPoints: [...value.defenses.hitPoints, newHitPoint()] })} onRemove={(index) => updateDefenses({ ...value.defenses, hitPoints: value.defenses.hitPoints.filter((_, itemIndex) => itemIndex !== index) })}>
          {(hitPoint, index) => <div className="grid grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)] gap-[9px] max-[600px]:grid-cols-1"><Field label="Label"><input className={inputClassName} maxLength={80} value={hitPoint.label} onChange={(event) => updateDefenses({ ...value.defenses, hitPoints: value.defenses.hitPoints.map((current, itemIndex) => itemIndex === index ? { ...current, label: event.target.value } : current) })} /></Field><Field label="Value"><input className={inputClassName} max={9999} min={0} type="number" value={hitPoint.value} onChange={(event) => updateDefenses({ ...value.defenses, hitPoints: value.defenses.hitPoints.map((current, itemIndex) => itemIndex === index ? { ...current, value: numberValue(event.target.value) } : current) })} /></Field><Field label="Notes"><input className={inputClassName} maxLength={400} value={hitPoint.notes} onChange={(event) => updateDefenses({ ...value.defenses, hitPoints: value.defenses.hitPoints.map((current, itemIndex) => itemIndex === index ? { ...current, notes: event.target.value } : current) })} /></Field></div>}
        </RepeatableList>
        <div className="grid grid-cols-3 gap-[10px] max-[760px]:grid-cols-1"><StringList name="immunities" addLabel="immunity" values={value.defenses.immunities} maxItems={32} placeholder="Damage or condition" onChange={(immunities) => updateDefenses({ ...value.defenses, immunities })} /><StringList name="resistances" addLabel="resistance" values={value.defenses.resistances} maxItems={32} placeholder="Damage type and amount" onChange={(resistances) => updateDefenses({ ...value.defenses, resistances })} /><StringList name="weaknesses" addLabel="weakness" values={value.defenses.weaknesses} maxItems={32} placeholder="Damage type and amount" onChange={(weaknesses) => updateDefenses({ ...value.defenses, weaknesses })} /></div>
        <Field label="Defense notes"><textarea className={textAreaClassName} maxLength={800} value={value.defenses.notes} onChange={(event) => updateDefenses({ ...value.defenses, notes: event.target.value })} /></Field>
      </Section>

      <Section title="MOVEMENT">
        <RepeatableList name="movement" addLabel="movement mode" items={value.movement} maxItems={16} onAdd={() => onChange({ ...value, movement: [...value.movement, newMovement()] })} onRemove={(index) => onChange({ ...value, movement: value.movement.filter((_, itemIndex) => itemIndex !== index) })}>
          {(movement, index) => <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-[9px] max-[600px]:grid-cols-1"><Field label="Mode"><input className={inputClassName} maxLength={80} value={movement.mode} onChange={(event) => onChange({ ...value, movement: value.movement.map((current, itemIndex) => itemIndex === index ? { ...current, mode: event.target.value } : current) })} /></Field><Field label="Speed"><input className={inputClassName} maxLength={80} value={movement.speed} onChange={(event) => onChange({ ...value, movement: value.movement.map((current, itemIndex) => itemIndex === index ? { ...current, speed: event.target.value } : current) })} /></Field><Field label="Notes"><input className={inputClassName} maxLength={400} value={movement.notes} onChange={(event) => onChange({ ...value, movement: value.movement.map((current, itemIndex) => itemIndex === index ? { ...current, notes: event.target.value } : current) })} /></Field></div>}
        </RepeatableList>
      </Section>

      <Section title="STRIKES">
        <RepeatableList name="strikes" addLabel="strike" items={value.strikes} maxItems={32} onAdd={() => onChange({ ...value, strikes: [...value.strikes, newStrike()] })} onRemove={(index) => onChange({ ...value, strikes: value.strikes.filter((_, itemIndex) => itemIndex !== index) })}>
          {(strike, index) => <div className="grid min-w-0 gap-[10px]">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-[9px] max-[600px]:grid-cols-1"><Field label="Category"><select className={editorSelectClassName} value={strike.category} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, category: event.target.value as Strike["category"] } : current) })}>{strikeCategories.map((category) => <option key={category} value={category}>{category.toUpperCase()}</option>)}</select></Field><Field label="Name"><input className={inputClassName} maxLength={160} value={strike.name} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, name: event.target.value } : current) })} /></Field></div>
            <div className="grid grid-cols-4 gap-[9px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1"><Field label="Activation"><input className={inputClassName} maxLength={80} placeholder="Optional" value={strike.activation ?? ""} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, activation: nullableValue(event.target.value) } : current) })} /></Field><Field label="Attack modifier"><input className={inputClassName} max={50} min={-50} type="number" value={strike.attackModifier} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, attackModifier: numberValue(event.target.value) } : current) })} /></Field><Field label="Reach"><input className={inputClassName} maxLength={80} placeholder="Optional" value={strike.reach ?? ""} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, reach: nullableValue(event.target.value) } : current) })} /></Field><Field label="Range"><input className={inputClassName} maxLength={80} placeholder="Optional" value={strike.range ?? ""} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, range: nullableValue(event.target.value) } : current) })} /></Field></div>
            <div className="grid grid-cols-2 gap-[10px] max-[600px]:grid-cols-1"><NumberList name={`strike ${index + 1} MAP`} addLabel="MAP modifier" values={strike.multipleAttackPenalty} maxItems={3} min={-50} max={50} placeholder="-5" onChange={(multipleAttackPenalty) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, multipleAttackPenalty } : current) })} /><StringList name={`strike ${index + 1} traits`} addLabel="strike trait" values={strike.traits} maxItems={32} placeholder="agile" onChange={(traits) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, traits } : current) })} /></div>
            <div className="grid gap-[8px]"><p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">DAMAGE</p><RepeatableList name={`strike ${index + 1} damage`} addLabel="damage part" items={strike.damage} maxItems={12} onAdd={() => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, damage: [...current.damage, newDamagePart()] } : current) })} onRemove={(damageIndex) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, damage: current.damage.filter((_, itemDamageIndex) => itemDamageIndex !== damageIndex) } : current) })}>
              {(damage, damageIndex) => <div className="grid grid-cols-3 gap-[9px] max-[600px]:grid-cols-1"><Field label="Formula"><input className={inputClassName} maxLength={160} value={damage.formula} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, damage: current.damage.map((currentDamage, itemDamageIndex) => itemDamageIndex === damageIndex ? { ...currentDamage, formula: event.target.value } : currentDamage) } : current) })} /></Field><Field label="Type"><input className={inputClassName} maxLength={120} value={damage.type} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, damage: current.damage.map((currentDamage, itemDamageIndex) => itemDamageIndex === damageIndex ? { ...currentDamage, type: event.target.value } : currentDamage) } : current) })} /></Field><Field label="Notes"><input className={inputClassName} maxLength={400} value={damage.notes} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, damage: current.damage.map((currentDamage, itemDamageIndex) => itemDamageIndex === damageIndex ? { ...currentDamage, notes: event.target.value } : currentDamage) } : current) })} /></Field></div>}
            </RepeatableList></div>
            <Field label="Rider"><textarea className={textAreaClassName} maxLength={1200} value={strike.rider} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, rider: event.target.value } : current) })} /></Field>
            <Field label="Raw text"><textarea className={textAreaClassName} maxLength={2400} value={strike.rawText} onChange={(event) => onChange({ ...value, strikes: value.strikes.map((current, itemIndex) => itemIndex === index ? { ...current, rawText: event.target.value } : current) })} /></Field>
          </div>}
        </RepeatableList>
      </Section>

      <Section title="SPELLCASTING">
        <RepeatableList name="spellcasting" addLabel="spellcasting group" items={value.spellcasting} maxItems={16} onAdd={() => onChange({ ...value, spellcasting: [...value.spellcasting, newSpellcasting()] })} onRemove={(index) => onChange({ ...value, spellcasting: value.spellcasting.filter((_, itemIndex) => itemIndex !== index) })}>
          {(casting, index) => <div className="grid min-w-0 gap-[10px]"><div className="grid grid-cols-[minmax(0,1fr)_150px_100px_120px] gap-[9px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1"><Field label="Tradition"><input className={inputClassName} maxLength={80} value={casting.tradition} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, tradition: event.target.value } : current) })} /></Field><Field label="Method"><select className={editorSelectClassName} value={casting.method} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, method: event.target.value as Spellcasting["method"] } : current) })}>{spellMethods.map((method) => <option key={method} value={method}>{method.toUpperCase()}</option>)}</select></Field><Field label="DC"><input className={inputClassName} max={60} min={0} placeholder="None" type="number" value={casting.dc ?? ""} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, dc: event.target.value === "" ? null : numberValue(event.target.value) } : current) })} /></Field><Field label="Attack modifier"><input className={inputClassName} max={50} min={-50} placeholder="None" type="number" value={casting.attackModifier ?? ""} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, attackModifier: event.target.value === "" ? null : numberValue(event.target.value) } : current) })} /></Field></div>
            <RepeatableList name={`spellcasting ${index + 1} entries`} addLabel="spell entry" items={casting.entries} maxItems={32} onAdd={() => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: [...current.entries, newSpellEntry()] } : current) })} onRemove={(entryIndex) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: current.entries.filter((_, itemEntryIndex) => itemEntryIndex !== entryIndex) } : current) })}>
              {(entry, entryIndex) => <div className="grid min-w-0 gap-[9px]"><div className="grid grid-cols-3 gap-[9px] max-[600px]:grid-cols-1"><Field label="Rank"><select className={editorSelectClassName} value={entry.rank} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: current.entries.map((currentEntry, itemEntryIndex) => itemEntryIndex === entryIndex ? { ...currentEntry, rank: event.target.value } : currentEntry) } : current) })}><option value="">Select rank</option>{entry.rank && !spellRankOptions.some((option) => option.value === entry.rank) ? <option value={entry.rank}>{entry.rank}</option> : null}{spellRankOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Uses"><input className={inputClassName} maxLength={80} placeholder="Optional" value={entry.uses ?? ""} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: current.entries.map((currentEntry, itemEntryIndex) => itemEntryIndex === entryIndex ? { ...currentEntry, uses: nullableValue(event.target.value) } : currentEntry) } : current) })} /></Field><Field label="Frequency"><input className={inputClassName} maxLength={160} placeholder="Optional" value={entry.frequency ?? ""} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: current.entries.map((currentEntry, itemEntryIndex) => itemEntryIndex === entryIndex ? { ...currentEntry, frequency: nullableValue(event.target.value) } : currentEntry) } : current) })} /></Field></div><StringList name={`spellcasting ${index + 1} entry ${entryIndex + 1} spells`} addLabel="spell" values={entry.spells} maxItems={32} placeholder="Spell name" onChange={(spells) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: current.entries.map((currentEntry, itemEntryIndex) => itemEntryIndex === entryIndex ? { ...currentEntry, spells } : currentEntry) } : current) })} /><Field label="Notes"><textarea className={textAreaClassName} maxLength={400} value={entry.notes} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, entries: current.entries.map((currentEntry, itemEntryIndex) => itemEntryIndex === entryIndex ? { ...currentEntry, notes: event.target.value } : currentEntry) } : current) })} /></Field></div>}
            </RepeatableList>
            <Field label="Spellcasting notes"><textarea className={textAreaClassName} maxLength={800} value={casting.notes} onChange={(event) => onChange({ ...value, spellcasting: value.spellcasting.map((current, itemIndex) => itemIndex === index ? { ...current, notes: event.target.value } : current) })} /></Field>
          </div>}
        </RepeatableList>
      </Section>

      <Section title="SPECIAL ABILITIES">
        <RepeatableList name="special abilities" addLabel="special ability" items={value.specialAbilities} maxItems={64} onAdd={() => onChange({ ...value, specialAbilities: [...value.specialAbilities, newSpecialAbility()] })} onRemove={(index) => onChange({ ...value, specialAbilities: value.specialAbilities.filter((_, itemIndex) => itemIndex !== index) })}>
          {(ability, index) => <div className="grid min-w-0 gap-[10px]"><div className="grid grid-cols-4 gap-[9px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1"><Field label="Section"><select className={editorSelectClassName} value={ability.section} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, section: event.target.value as SpecialAbility["section"] } : current) })}>{abilitySections.map((section) => <option key={section} value={section}>{section.toUpperCase()}</option>)}</select></Field><Field label="Name"><input className={inputClassName} maxLength={160} value={ability.name} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, name: event.target.value } : current) })} /></Field><Field label="Activation"><select className={editorSelectClassName} value={ability.activation} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, activation: event.target.value as SpecialAbility["activation"] } : current) })}>{abilityActivations.map((activation) => <option key={activation} value={activation}>{activation.toUpperCase()}</option>)}</select></Field><Field label="Action cost"><input className={inputClassName} maxLength={20} placeholder="Optional" value={ability.actionCost ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, actionCost: nullableValue(event.target.value) } : current) })} /></Field></div>
            <StringList name={`special ability ${index + 1} traits`} addLabel="ability trait" values={ability.traits} maxItems={32} placeholder="Trait" onChange={(traits) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, traits } : current) })} />
            <div className="grid grid-cols-3 gap-[9px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1"><Field label="Frequency"><input className={inputClassName} maxLength={160} placeholder="Optional" value={ability.frequency ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, frequency: nullableValue(event.target.value) } : current) })} /></Field><Field label="Trigger"><input className={inputClassName} maxLength={800} placeholder="Optional" value={ability.trigger ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, trigger: nullableValue(event.target.value) } : current) })} /></Field><Field label="Requirements"><input className={inputClassName} maxLength={800} placeholder="Optional" value={ability.requirements ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, requirements: nullableValue(event.target.value) } : current) })} /></Field><Field label="Area"><input className={inputClassName} maxLength={160} placeholder="Optional" value={ability.area ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, area: nullableValue(event.target.value) } : current) })} /></Field><Field label="Save"><input className={inputClassName} maxLength={160} placeholder="Optional" value={ability.save ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, save: nullableValue(event.target.value) } : current) })} /></Field><Field label="Cooldown"><input className={inputClassName} maxLength={160} placeholder="Optional" value={ability.cooldown ?? ""} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, cooldown: nullableValue(event.target.value) } : current) })} /></Field></div>
            <Field label="Effect"><textarea className={textAreaClassName} maxLength={4000} value={ability.effect} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, effect: event.target.value } : current) })} /></Field>
            <Field label="Raw text"><textarea className={textAreaClassName} maxLength={4000} value={ability.rawText} onChange={(event) => onChange({ ...value, specialAbilities: value.specialAbilities.map((current, itemIndex) => itemIndex === index ? { ...current, rawText: event.target.value } : current) })} /></Field>
          </div>}
        </RepeatableList>
      </Section>

      <Section title="UNPARSED FRAGMENTS">
        <RepeatableList name="unparsed fragments" addLabel="unparsed fragment" items={value.unparsedFragments} maxItems={24} onAdd={() => onChange({ ...value, unparsedFragments: [...value.unparsedFragments, newUnparsedFragment()] })} onRemove={(index) => onChange({ ...value, unparsedFragments: value.unparsedFragments.filter((_, itemIndex) => itemIndex !== index) })}>
          {(fragment, index) => <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] gap-[9px] max-[600px]:grid-cols-1"><Field label="Label"><input className={inputClassName} maxLength={160} value={fragment.label} onChange={(event) => onChange({ ...value, unparsedFragments: value.unparsedFragments.map((current, itemIndex) => itemIndex === index ? { ...current, label: event.target.value } : current) })} /></Field><Field label="Text"><textarea className={textAreaClassName} maxLength={2400} value={fragment.text} onChange={(event) => onChange({ ...value, unparsedFragments: value.unparsedFragments.map((current, itemIndex) => itemIndex === index ? { ...current, text: event.target.value } : current) })} /></Field><Field label="Reason"><input className={inputClassName} maxLength={400} value={fragment.reason} onChange={(event) => onChange({ ...value, unparsedFragments: value.unparsedFragments.map((current, itemIndex) => itemIndex === index ? { ...current, reason: event.target.value } : current) })} /></Field></div>}
        </RepeatableList>
      </Section>
    </fieldset>
  </section>;
}
