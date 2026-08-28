import { Skull } from "lucide-react";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { recordMainClassName, recordRowClassName } from "@/components/ui/recordStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import type { ApiEnemy } from "@/lib/campaign/types";

export default function EnemyCard({ enemy, selected, isGM, onSelect }: { enemy: ApiEnemy; selected: boolean; isGM: boolean; onSelect: (enemyId: string) => void }) {
  const artUrl = getAttachedArtUrl(enemy.art_url, enemy.art_path);
  return <button
    aria-label={`Select ${enemy.name}`}
    aria-controls="archive-preview-panel"
    aria-pressed={selected}
    className={`${recordRowClassName} w-full cursor-pointer text-left focus-visible:outline-1 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-[-1px] ${selected ? "bg-[rgba(255,92,154,.095)] hover:bg-[rgba(255,92,154,.14)]" : "hover:bg-[rgba(255,92,154,.045)]"}`}
    onClick={() => onSelect(enemy.id)}
    type="button"
  >
    <RecordPortrait src={artUrl} label={`${enemy.name} artwork`} className="grid h-[62px] w-[62px] flex-[0_0_62px] place-items-center border border-[rgba(255,92,154,.38)] bg-[rgba(255,92,154,.08)] text-[var(--pink)] max-[760px]:h-[56px] max-[760px]:w-[56px] max-[760px]:flex-[0_0_56px]" fallback={<Skull size={19} />} />
    <div className={recordMainClassName}>
      <h3 className="m-0 text-[13px] text-[var(--ink)] [overflow-wrap:anywhere]">{enemy.name}</h3>
      <p>{enemy.player_description || "No player-safe brief recorded."}</p>
      {isGM ? <small className="font-mono text-[8px] tracking-[.08em] text-[var(--pink)]">LEVEL {enemy.level ?? "?"}{" // "}{(enemy.rarity ?? "unknown").toUpperCase()}</small> : null}
    </div>
  </button>;
}
