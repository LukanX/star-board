"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, CirclePlus, Map } from "lucide-react";
import PageLayout from "@/components/ui/PageLayout";
import PlaceCard from "@/components/places/PlaceCard";
import PlaceEditor from "@/components/places/PlaceEditor";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import { buildPlaceTree, getPlaceBreadcrumb } from "@/lib/places";
import Link from "next/link";

type EditorState = { place?: ApiPlace; parentPlaceId: string | null };

export default function PlacesRouteView({ campaignId, role, initialPlaces }: { campaignId: string; role: "gm" | "player"; initialPlaces: ApiPlace[] }) {
  const [places, setPlaces] = useState(initialPlaces);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(initialPlaces.filter((place) => place.parent_place_id).map((place) => place.parent_place_id!)));
  const [search, setSearch] = useState("");
  const isGM = role === "gm";
  const placeTree = useMemo(() => buildPlaceTree(places), [places]);
  const normalizedSearch = search.trim().toLowerCase();
  const visiblePlaces = normalizedSearch ? places.filter((place) => `${place.name} ${place.kind} ${getPlaceBreadcrumb(places, place.id)}`.toLowerCase().includes(normalizedSearch)) : places;
  const visiblePlaceIds = new Set(visiblePlaces.map((place) => place.id));

  const openEditor = (place?: ApiPlace, parentPlaceId: string | null = null) => {
    if (!isGM) return;
    setEditorState({ place, parentPlaceId });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePlace = (savedPlace: ApiPlace) => {
    setPlaces((current) => editorState?.place ? current.map((place) => place.id === savedPlace.id ? savedPlace : place) : [...current, savedPlace]);
    setEditorState(null);
  };

  const deletePlace = (deletedPlaceId: string) => {
    setPlaces((current) => current.filter((place) => place.id !== deletedPlaceId).map((place) => place.parent_place_id === deletedPlaceId ? { ...place, parent_place_id: null } : place));
    setEditorState(null);
  };

  return <PageLayout eyebrow="ARCHIVE // PLACE ATLAS" title="Places" description="A genre-neutral atlas for worlds, regions, sites, and the spaces between them." action={isGM ? "ADD ROOT PLACE" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorState ? <PlaceEditor key={`${editorState.place?.id ?? "new"}:${editorState.parentPlaceId ?? "root"}`} campaignId={campaignId} places={places} place={editorState.place} parentPlaceId={editorState.parentPlaceId} onCancel={() => setEditorState(null)} onSaved={savePlace} onDeleted={deletePlace} /> : null}
    <div className="places-toolbar"><div className="places-toolbar-heading"><p className="eyebrow">{places.length.toString().padStart(2, "0")} RECORDED PLACES</p><strong>{places.length ? "Campaign geography" : "No place records yet"}</strong></div><label className="places-search">SEARCH PLACES<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, kind, or breadcrumb" /></label></div>
    {places.length ? <div className="places-layout"><section className="panel places-tree-panel"><div className="panel-topline"><div><p className="eyebrow">PLACE TREE</p><h2>Atlas structure</h2></div><Map className="accent-icon-cyan" size={17} /></div>{normalizedSearch ? <div className="place-search-results">{visiblePlaces.length ? visiblePlaces.map((place) => <Link className="place-search-result" href={campaignEntityPath(campaignId, "places", place.id)} key={place.id}><span><strong>{place.name}</strong><small>{getPlaceBreadcrumb(places, place.id)}</small></span><ArrowUpRight size={14} /></Link>) : <div className="character-empty"><Map size={22} /><h2>No matching places.</h2><p>Try a different name, kind, or breadcrumb.</p></div>}</div> : <div className="place-tree">{placeTree.map((node) => <PlaceCard key={node.id} campaignId={campaignId} node={node} expandedIds={expandedIds} onToggle={toggleExpanded} onAddChild={(parentId) => openEditor(undefined, parentId)} isGM={isGM} visiblePlaceIds={visiblePlaceIds} />)}</div>}</section><section className="panel place-detail-panel"><div className="place-detail"><Map className="accent-icon-cyan" size={24} /><p className="eyebrow">ROUTE-OWNED PLACE FILES</p><h2>Choose a place from the atlas.</h2><p>Open a record to inspect its public brief, notes, breadcrumb, and GM-only context where available.</p></div></section></div> : <div className="character-empty"><Map size={22} /><h2>No places recorded yet.</h2><p>{isGM ? "Add a root place to start building the campaign atlas." : "The GM has not recorded any places yet."}</p></div>}
  </PageLayout>;
}