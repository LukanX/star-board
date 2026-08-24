import { Network } from "lucide-react";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import type { FactionRecord } from "@/lib/campaign/types";

const factionEmblemSizeClassNames = {
  compact: "w-[64px] h-[64px] flex-[0_0_64px]",
  fill: "w-full h-full",
};

export function FactionEmblem({ faction, iconSize, size = "compact" }: { faction: FactionRecord; iconSize: number; size?: keyof typeof factionEmblemSizeClassNames }) {
  const src = getAttachedArtUrl(faction.art_url, faction.art_path);
  const artClasses = src ? "bg-contain" : "bg-[repeating-linear-gradient(135deg,rgba(98,232,255,.08)_0_1px,transparent_1px_9px)]";

  return <div aria-label={`${faction.name} emblem`} className={`${factionEmblemSizeClassNames[size]} grid place-items-center overflow-hidden border border-current bg-[#0a1118] bg-center bg-no-repeat text-current ${artClasses}`} role="img" style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Network className="opacity-75" size={iconSize} />}</div>;
}

const factionSelectionClassNames = {
  selected: "border-[rgba(98,232,255,.65)] bg-[rgba(98,232,255,.095)] hover:bg-[rgba(98,232,255,.14)]",
  idle: "hover:border-[rgba(98,232,255,.45)]",
};

export default function FactionCard({ faction, selected, onSelect }: { faction: FactionRecord; selected: boolean; onSelect: (factionId: string) => void }) {
  return <button aria-label={`Select ${faction.name}`} aria-controls="archive-preview-panel" aria-pressed={selected} className={`faction-${faction.color} flex min-h-[92px] w-full items-center gap-[14px] cursor-pointer overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-[14px_16px] text-left focus-visible:outline-1 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-[-1px] ${factionSelectionClassNames[selected ? "selected" : "idle"]}`} onClick={() => onSelect(faction.id)} type="button"><FactionEmblem faction={faction} iconSize={24} /><h3 className="m-0 min-w-0 text-[13px] font-[550] text-[var(--ink)] [overflow-wrap:anywhere]">{faction.name}</h3></button>;
}