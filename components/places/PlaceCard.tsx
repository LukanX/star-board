"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronRight, Map, Plus } from "lucide-react";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import type { PlaceTreeNode } from "@/lib/places";

export function PlaceArt({ place, className }: { place: ApiPlace; className: string }) {
  const src = place.art_url ?? (place.art_path?.startsWith("http") ? place.art_path : null);

  return <div aria-label={`${place.name} artwork`} className={`place-art ${className} ${src ? "has-art" : "no-art"}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Map size={18} />}</div>;
}

export default function PlaceCard({ campaignId, node, expandedIds, onToggle, onAddChild, isGM, visiblePlaceIds }: {
  campaignId: string;
  node: PlaceTreeNode<ApiPlace>;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (id: string) => void;
  isGM: boolean;
  visiblePlaceIds: Set<string>;
}) {
  const visibleChildren = node.children.filter((child) => visiblePlaceIds.has(child.id));
  const hasChildren = visibleChildren.length > 0;
  const expanded = expandedIds.has(node.id);

  if (!visiblePlaceIds.has(node.id) && !visibleChildren.length) return null;

  return <div className="place-tree-branch"><div className="place-tree-row"><button aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`} className="place-tree-chevron border-0 bg-transparent p-0 text-inherit" disabled={!hasChildren} onClick={() => onToggle(node.id)} type="button">{hasChildren ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span />}</button><Link aria-label={`Open public file for ${node.name}`} className="place-tree-select" href={campaignEntityPath(campaignId, "places", node.id)}><PlaceArt place={node} className="place-tree-art" /><span className="place-tree-copy"><strong>{node.name}</strong><small>{node.kind}</small></span><ArrowUpRight aria-hidden="true" size={13} /></Link>{isGM ? <button aria-label={`Add child place under ${node.name}`} className="icon-button place-tree-add" onClick={() => onAddChild(node.id)} title={`Add child under ${node.name}`} type="button"><Plus size={14} /></button> : null}</div>{expanded ? <div className="place-tree-children">{visibleChildren.map((child) => <PlaceCard key={child.id} campaignId={campaignId} node={child} expandedIds={expandedIds} onToggle={onToggle} onAddChild={onAddChild} isGM={isGM} visiblePlaceIds={visiblePlaceIds} />)}</div> : null}</div>;
}