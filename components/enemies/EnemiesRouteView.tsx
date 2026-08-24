"use client";

import { useMemo, useState } from "react";
import { CirclePlus, Skull } from "lucide-react";
import ArchiveMasterDetail from "@/components/ui/ArchiveMasterDetail";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import EnemyCard from "@/components/enemies/EnemyCard";
import EnemyEditor from "@/components/enemies/EnemyEditor";
import EnemyPreview from "@/components/enemies/EnemyPreview";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { ApiEnemy } from "@/lib/campaign/types";
import type { EnemyRarity, EnemySize } from "@/lib/validation/enemy";

const sizes: EnemySize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
const rarities: EnemyRarity[] = ["common", "uncommon", "rare", "unique"];
const levels = Array.from({ length: 27 }, (_, index) => index - 1);

type FilterSelectProps = { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode };

function FilterSelect({ label, value, onChange, children }: FilterSelectProps) {
  return <label className="grid min-w-[112px] flex-1 gap-[7px] text-[var(--dim)] font-mono text-[8px] tracking-[.12em]">{label}<select className="h-[36px] w-full border border-[rgba(139,151,169,.28)] bg-[#0a1118] px-[8px] text-[var(--ink)] font-mono text-[9px] outline-0 focus:border-[var(--cyan)]" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ALL</option>{children}</select></label>;
}

export default function EnemiesRouteView({ campaignId, role, initialEnemies }: { campaignId: string; role: "gm" | "player"; initialEnemies: ApiEnemy[] }) {
  const isGM = role === "gm";
  const [enemies, setEnemies] = useState(initialEnemies);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [trait, setTrait] = useState("");
  const [size, setSize] = useState("");
  const [rarity, setRarity] = useState("");
  const [sort, setSort] = useState<"name" | "level" | "updated">("name");
  const selectedEnemy = enemies.find((enemy) => enemy.id === selectedEnemyId) ?? null;
  const traits = useMemo(() => [...new Set(enemies.flatMap((enemy) => enemy.traits ?? []))].sort((left, right) => left.localeCompare(right)), [enemies]);
  const visibleEnemies = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return enemies.filter((enemy) => {
      if (normalizedSearch && !`${enemy.name} ${enemy.player_description} ${(enemy.traits ?? []).join(" ")}`.toLocaleLowerCase().includes(normalizedSearch)) return false;
      if (level !== "" && enemy.level !== Number(level)) return false;
      if (trait !== "" && !(enemy.traits ?? []).some((value) => value.toLocaleLowerCase() === trait.toLocaleLowerCase())) return false;
      if (size !== "" && enemy.size !== size) return false;
      if (rarity !== "" && enemy.rarity !== rarity) return false;
      return true;
    }).sort((left, right) => {
      if (sort === "level") return (left.level ?? 0) - (right.level ?? 0) || left.name.localeCompare(right.name);
      if (sort === "updated") return right.updated_at.localeCompare(left.updated_at) || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });
  }, [enemies, level, rarity, search, size, sort, trait]);

  const saveNewEnemy = (saved: ApiEnemy) => {
    setEnemies((current) => [saved, ...current]);
    setSelectedEnemyId(saved.id);
    setEditorOpen(false);
  };

  return <PageLayout eyebrow="ARCHIVE // THREAT INDEX" title="Enemies" description="Creature records for the campaign. Players see only revealed names, approved artwork, and the brief you choose to publish." action={isGM && !editorOpen ? "ADD ENEMY" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => setEditorOpen(true)}>
    {editorOpen ? <EnemyEditor campaignId={campaignId} onCancel={() => setEditorOpen(false)} onSaved={saveNewEnemy} /> : enemies.length ? <ArchiveMasterDetail
      selectedId={selectedEnemyId}
      toolbar={<div data-enemies-toolbar="true" className="grid gap-[13px] mb-[18px] p-[15px_17px] border border-[var(--line)] bg-[linear-gradient(105deg,rgba(255,92,154,.06),rgba(98,232,255,.025))]">
        <div className="flex items-end justify-between gap-[20px] max-[760px]:items-stretch max-[760px]:flex-col"><div className="grid gap-[7px]"><p className={`${eyebrowClassName} !m-0`}>{visibleEnemies.length.toString().padStart(2, "0")} OF {enemies.length.toString().padStart(2, "0")} THREATS</p><strong className="text-[var(--ink)] text-[13px] font-[550]">{isGM ? "GM threat index" : "Revealed threats"}</strong></div><label className="grid w-[min(100%,330px)] gap-[7px] text-[var(--dim)] font-mono text-[8px] tracking-[.12em] max-[760px]:w-full">SEARCH ENEMIES<input className="h-[36px] w-full border border-[rgba(139,151,169,.28)] bg-[#0a1118] p-[0_10px] text-[var(--ink)] font-mono text-[10px] outline-0 placeholder:text-[#4d5a6b] focus:border-[var(--cyan)]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, description, or trait" /></label></div>
        <div className="flex flex-wrap items-end gap-[8px] border-t border-[rgba(139,151,169,.14)] pt-[12px]">{isGM ? <><FilterSelect label="LEVEL" value={level} onChange={setLevel}>{levels.map((value) => <option key={value} value={value}>{value < 0 ? "-1" : value}</option>)}</FilterSelect><FilterSelect label="TRAIT / TYPE" value={trait} onChange={setTrait}>{traits.map((value) => <option key={value} value={value}>{value}</option>)}</FilterSelect><FilterSelect label="SIZE" value={size} onChange={setSize}>{sizes.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</FilterSelect><FilterSelect label="RARITY" value={rarity} onChange={setRarity}>{rarities.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</FilterSelect></> : null}<FilterSelect label="SORT" value={sort} onChange={(value) => setSort(value as "name" | "level" | "updated")}><option value="name">NAME</option><option value="level">LEVEL</option><option value="updated">UPDATED</option></FilterSelect></div>
      </div>}
      layoutDataAttribute="data-enemies-layout"
      selectorPanelDataAttribute="data-enemies-selector-panel"
      previewPanelDataAttribute="data-enemies-detail-panel"
      previewContentDataAttribute="data-enemies-detail"
      selectorEyebrow="THREAT ROSTER"
      selectorTitle="Known enemies"
      selectorIcon={<Skull size={17} />}
      selector={<div data-enemy-list="true" className="grid grid-cols-1 gap-[1px] p-[10px]">{visibleEnemies.length ? visibleEnemies.map((enemy) => <EnemyCard enemy={enemy} isGM={isGM} key={enemy.id} onSelect={setSelectedEnemyId} selected={selectedEnemyId === enemy.id} />) : <EmptyState icon={Skull} title="No matching enemies." message="Try a different name, level, trait, size, or rarity." />}</div>}
      preview={selectedEnemy ? <EnemyPreview campaignId={campaignId} enemy={selectedEnemy} isGM={isGM} /> : null}
      emptyPreview={<div data-enemies-detail="true" className="min-w-0 p-[21px] max-[760px]:p-[17px]"><Skull className="text-[var(--pink)]" size={24} /><p className={eyebrowClassName}>ROUTE-OWNED THREAT FILES</p><h2>Choose an enemy from the roster.</h2><p>Select a record to inspect its revealed brief. GM users can open the full private record for mechanics, tactics, and notes.</p></div>}
    /> : <EmptyState icon={Skull} title="No enemies recorded yet." message={isGM ? "Add a manual enemy or import one creature from Archives of Nethys." : "The GM has not revealed any enemies yet."} />}
  </PageLayout>;
}
