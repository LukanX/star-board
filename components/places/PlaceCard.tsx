"use client";

import { ArrowUpRight, ChevronDown, ChevronRight, Map, Plus } from "lucide-react";
import type { ApiPlace } from "@/lib/campaign/types";
import type { PlaceTreeNode } from "@/lib/places";

export function PlaceArt({ place, variant }: { place: ApiPlace; variant: "tree" | "detail" }) {
  const src = place.art_url ?? (place.art_path?.startsWith("http") ? place.art_path : null);
  const frameClasses = variant === "tree"
    ? "w-[38px] h-[38px] flex-[0_0_38px] max-[420px]:w-[34px] max-[420px]:h-[34px] max-[420px]:basis-[34px] border border-[rgba(98,232,255,.22)]"
    : "w-full min-h-[150px] aspect-[16/7] max-[420px]:min-h-[120px] border border-[rgba(98,232,255,.24)]";
  const fallbackClasses = src ? "" : "grid place-items-center bg-[repeating-linear-gradient(135deg,rgba(98,232,255,.08)_0_1px,transparent_1px_9px)]";

  return <div aria-label={`${place.name} artwork`} className={`overflow-hidden bg-[#0a1118] bg-center bg-no-repeat bg-cover text-[var(--cyan)] ${frameClasses} ${fallbackClasses}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Map size={18} />}</div>;
}

const placeSelectionClassNames = {
  selected: "bg-[rgba(98,232,255,.095)] text-[var(--ink)] hover:bg-[rgba(98,232,255,.14)]",
  idle: "text-[var(--ink)] hover:bg-[rgba(255,255,255,.025)]",
};

export default function PlaceCard({ campaignId, node, expandedIds, onToggle, onAddChild, isGM, visiblePlaceIds, selected, selectedPlaceId, onSelect }: {
  campaignId: string;
  node: PlaceTreeNode<ApiPlace>;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (id: string) => void;
  isGM: boolean;
  visiblePlaceIds: Set<string>;
  selected: boolean;
  selectedPlaceId?: string | null;
  onSelect: (placeId: string) => void;
}) {
  const visibleChildren = node.children.filter((child) => visiblePlaceIds.has(child.id));
  const hasChildren = visibleChildren.length > 0;
  const expanded = expandedIds.has(node.id);

  if (!visiblePlaceIds.has(node.id) && !visibleChildren.length) return null;

  return <div data-place-tree-branch="true" className="min-w-0"><div data-place-tree-row="true" className="flex items-center min-h-[44px] border-b border-[rgba(139,151,169,.09)] last:border-b-0"><button data-place-tree-chevron="true" aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`} className="w-[18px] h-[18px] grid place-items-center flex-[0_0_18px] border-0 bg-transparent p-0 text-[var(--cyan)]" disabled={!hasChildren} onClick={() => onToggle(node.id)} type="button">{hasChildren ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span />}</button><button data-place-tree-select="true" aria-label={`Select ${node.name}`} aria-controls="archive-preview-panel" aria-pressed={selected} className={`min-w-0 flex-1 flex items-center gap-[7px] min-h-[43px] border-0 p-[0_6px] text-left cursor-pointer ${placeSelectionClassNames[selected ? "selected" : "idle"]}`} onClick={() => onSelect(node.id)} type="button"><PlaceArt place={node} variant="tree" /><span data-place-tree-copy="true" className="min-w-0 grid gap-[3px]"><strong className="overflow-hidden text-[var(--ink)] text-[11px] font-[550] text-ellipsis whitespace-nowrap [overflow-wrap:anywhere]">{node.name}</strong><small className="text-[var(--dim)] font-mono text-[8px] tracking-[.08em] uppercase">{node.kind}</small></span><ArrowUpRight aria-hidden="true" size={13} /></button>{isGM ? <button data-place-tree-add="true" aria-label={`Add child place under ${node.name}`} className="w-8 h-8 inline-grid place-items-center flex-[0_0_30px] border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]" onClick={() => onAddChild(node.id)} title={`Add child under ${node.name}`} type="button"><Plus size={14} /></button> : null}</div>{expanded ? <div data-place-tree-children="true" className="ml-[18px] border-l border-[rgba(98,232,255,.18)] pl-[7px] max-[420px]:ml-[11px] max-[420px]:pl-[5px]">{visibleChildren.map((child) => <PlaceCard key={child.id} campaignId={campaignId} node={child} expandedIds={expandedIds} onToggle={onToggle} onAddChild={onAddChild} isGM={isGM} visiblePlaceIds={visiblePlaceIds} selected={selectedPlaceId ? selectedPlaceId === child.id : false} selectedPlaceId={selectedPlaceId} onSelect={onSelect} />)}</div> : null}</div>;
}