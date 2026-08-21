"use client";

import { useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import { CampaignArtEditorSlot, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import { buildPlaceTree, flattenPlaceTree, getPlaceBreadcrumb, isPlaceDescendant, type PlaceTreeNode } from "@/lib/places";
import type { ApiPlace } from "@/lib/campaign/types";
import { ArrowUpRight, ChevronDown, ChevronRight, CirclePlus, FileText, LockKeyhole, Map, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

export type { ApiPlace } from "@/lib/campaign/types";

type PlaceDraft = {
  name: string;
  kind: string;
  description: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  parentPlaceId: string | null;
  artSubject: string | null;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyPlaceDraft: PlaceDraft = {
  name: "",
  kind: "location",
  description: "",
  playerNotesMarkdown: "",
  gmNotesMarkdown: "",
  parentPlaceId: null,
  artSubject: null,
  artPath: null,
  artUrl: null,
  artPrompt: null,
  artProvider: null,
};

type PlacesViewProps = {
  places: ApiPlace[];
  campaignId: string | null;
  isGM: boolean;
  onPlacesChange: Dispatch<SetStateAction<ApiPlace[]>>;
  onAction: (message: string) => void;
};

export default function PlacesView({ places, campaignId, isGM, onPlacesChange, onAction }: PlacesViewProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<ApiPlace | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(places[0]?.id ?? null);
  const [draft, setDraft] = useState<PlaceDraft>(emptyPlaceDraft);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(places.filter((place) => place.parent_place_id).map((place) => place.parent_place_id!)));
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeTree = useMemo(() => buildPlaceTree(places), [places]);
  const flattenedPlaces = useMemo(() => flattenPlaceTree(places), [places]);
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const visiblePlaces = normalizedSearch
    ? places.filter((place) => `${place.name} ${place.kind} ${getPlaceBreadcrumb(places, place.id)}`.toLowerCase().includes(normalizedSearch))
    : places;
  const visiblePlaceIds = new Set(visiblePlaces.map((place) => place.id));

  useCampaignArtEditor(editorOpen ? {
    campaignId,
    kind: "place",
    value: draft.artPath,
    url: draft.artUrl,
    subject: draft.artSubject ?? `${draft.kind}: ${draft.name}`,
    currentPrompt: draft.artPrompt,
    onChange: (path) => setDraft((current) => ({ ...current, artPath: path })),
    onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })),
    onSubjectChange: (subject) => setDraft((current) => ({ ...current, artSubject: subject })),
    onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })),
    onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })),
  } : null);

  const openEditor = (place?: ApiPlace, parentPlaceId: string | null = null) => {
    if (!isGM) {
      onAction("Only a GM can edit places.");
      return;
    }

    setEditingPlace(place ?? null);
    setSelectedPlaceId(place?.id ?? parentPlaceId);
    setDraft(place ? {
      name: place.name,
      kind: place.kind,
      description: place.description,
      playerNotesMarkdown: place.player_notes_markdown,
      gmNotesMarkdown: place.gm_notes_markdown ?? "",
      parentPlaceId: place.parent_place_id,
      artSubject: place.art_subject,
      artPath: place.art_path,
      artUrl: place.art_url ?? null,
      artPrompt: place.art_prompt,
      artProvider: place.art_provider ?? null,
    } : { ...emptyPlaceDraft, parentPlaceId });
    setAssistantOpen(false);
    setError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingPlace(null);
    setError(null);
  };

  const savePlace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) {
      onAction("Campaign is unavailable. Return to the campaign selector and try again.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places${editingPlace ? `/${encodeURIComponent(editingPlace.id)}` : ""}`, {
        method: editingPlace ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; place?: ApiPlace };
      if (!response.ok || !result.place) throw new Error(result.error ?? "Place could not be saved.");

      const savedPlace = result.place;
      onPlacesChange((current) => {
        if (!editingPlace) return [...current, savedPlace];
        return current.map((place) => place.id === editingPlace.id ? savedPlace : place);
      });
      setSelectedPlaceId(savedPlace.id);
      closeEditor();
      onAction(editingPlace ? `${savedPlace.name} updated.` : `${savedPlace.name} added to the place archive.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Place could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deletePlace = async () => {
    if (!campaignId || !editingPlace || !window.confirm(`Delete ${editingPlace.name} from the place archive? Children will become root places.`)) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places/${encodeURIComponent(editingPlace.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Place could not be deleted.");

      onPlacesChange((current) => current.filter((place) => place.id !== editingPlace.id).map((place) => place.parent_place_id === editingPlace.id ? { ...place, parent_place_id: null } : place));
      setSelectedPlaceId(editingPlace.parent_place_id);
      closeEditor();
      onAction(`${editingPlace.name} removed from the place archive.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Place could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  const applyAiDraft = (candidate: Record<string, string>) => {
    setDraft((current) => ({
      ...current,
      name: candidate.name ?? current.name,
      kind: candidate.kind ?? current.kind,
      description: candidate.description ?? current.description,
      playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown,
      gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown,
      artSubject: candidate.visualPrompt || current.artSubject,
    }));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return <><CampaignArtEditorSlot /><div className="page-intro"><div><p className="eyebrow eyebrow-bright">ARCHIVE // PLACE ATLAS</p><h1>Places</h1><p className="intro-copy">A genre-neutral atlas for worlds, regions, sites, and the spaces between them.</p></div>{isGM ? <button className="button button-primary" onClick={() => openEditor()} type="button"><CirclePlus size={16} /> ADD ROOT PLACE</button> : null}</div>
    {editorOpen ? <section className="character-editor place-editor"><div className="editor-heading"><div><p className="eyebrow">{isGM ? "GM PLACE RECORD" : "PLACE RECORD"}</p><h2>{editingPlace ? `Edit ${editingPlace.name}` : draft.parentPlaceId ? "Add a child place" : "Add a root place"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE PLACE"}</button><button className="icon-button" aria-label="Close place editor" onClick={closeEditor} title="Close place editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/place" entityLabel="place" mode={editingPlace ? "refine" : "create"} requestFields={{ ...(draft.parentPlaceId ? { parentPlaceId: draft.parentPlaceId } : {}), name: draft.name, kind: draft.kind }} currentDraft={{ name: draft.name, kind: draft.kind, description: draft.description, playerNotes: draft.playerNotesMarkdown, gmNotes: draft.gmNotesMarkdown, visualPrompt: draft.artSubject ?? "" }} fields={[{ key: "name", label: "Name", maxLength: 160 }, { key: "kind", label: "Kind", maxLength: 80 }, { key: "description", label: "Description", maxLength: 4000, multiline: true }, { key: "playerNotes", label: "Player notes", maxLength: 2400, multiline: true }, { key: "gmNotes", label: "GM notes", maxLength: 2400, multiline: true }, { key: "visualPrompt", label: "Visual subject", maxLength: 1600, multiline: true }]} onApply={applyAiDraft} /> : null}<form className="character-form" onSubmit={savePlace}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Kind<input required maxLength={80} placeholder="Planet, city, dungeon, room..." value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))} /></label><label className="place-parent-field">Parent<select value={draft.parentPlaceId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, parentPlaceId: event.target.value || null }))}><option value="">ROOT PLACE</option>{flattenedPlaces.filter(({ place }) => !editingPlace || (place.id !== editingPlace.id && !isPlaceDescendant(places, place.id, editingPlace.id))).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}</select></label></div><label>Description<textarea maxLength={4000} placeholder="What can the campaign safely reveal about this place?" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, playerNotesMarkdown: event.target.value }))} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, gmNotesMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingPlace ? "SAVE CHANGES" : "ADD PLACE"}</button>{editingPlace ? <button className="button button-danger" disabled={isSaving} onClick={deletePlace} type="button"><Trash2 size={14} /> REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={closeEditor} type="button">CANCEL</button></div></form></section> : null}
    <div className="places-toolbar"><div className="places-toolbar-heading"><p className="eyebrow">{places.length.toString().padStart(2, "0")} RECORDED PLACES</p><strong>{places.length ? "Campaign geography" : "No place records yet"}</strong></div><label className="places-search">SEARCH PLACES<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, kind, or breadcrumb" /></label></div>
    {places.length ? <div className="places-layout"><section className="panel places-tree-panel"><div className="panel-topline"><div><p className="eyebrow">PLACE TREE</p><h2>Atlas structure</h2></div><Map size={17} className="accent-icon-cyan" /></div>{normalizedSearch ? <div className="place-search-results">{visiblePlaces.length ? visiblePlaces.map((place) => <button className={`place-search-result ${selectedPlaceId === place.id ? "place-search-result-active" : ""}`} key={place.id} onClick={() => setSelectedPlaceId(place.id)} type="button"><span><strong>{place.name}</strong><small>{getPlaceBreadcrumb(places, place.id)}</small></span><ArrowUpRight size={14} /></button>) : <div className="character-empty"><Map size={22} /><h2>No matching places.</h2><p>Try a different name, kind, or breadcrumb.</p></div>}</div> : <div className="place-tree">{placeTree.map((node) => <PlaceTreeNodeView key={node.id} node={node} selectedPlaceId={selectedPlaceId} expandedIds={expandedIds} onToggle={toggleExpanded} onSelect={setSelectedPlaceId} onAddChild={(parentId) => openEditor(undefined, parentId)} isGM={isGM} visiblePlaceIds={visiblePlaceIds} />)}</div>}</section><section className="panel place-detail-panel">{selectedPlace ? <PlaceDetail place={selectedPlace} places={places} isGM={isGM} onEdit={() => openEditor(selectedPlace)} onAddChild={() => openEditor(undefined, selectedPlace.id)} /> : <div className="character-empty"><Map size={22} /><h2>Select a place.</h2><p>Choose a record from the atlas tree to inspect its public brief.</p></div>}</section></div> : <div className="character-empty"><Map size={22} /><h2>No places recorded yet.</h2><p>{isGM ? "Add a root place to start building the campaign atlas." : "The GM has not recorded any places yet."}</p></div>}
  </>;
}

function PlaceArt({ place, className }: { place: ApiPlace; className: string }) {
  const src = place.art_url ?? (place.art_path?.startsWith("http") ? place.art_path : null);

  return <div aria-label={`${place.name} artwork`} className={`place-art ${className} ${src ? "has-art" : "no-art"}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Map size={18} />}</div>;
}

function PlaceTreeNodeView({ node, selectedPlaceId, expandedIds, onToggle, onSelect, onAddChild, isGM, visiblePlaceIds }: { node: PlaceTreeNode<ApiPlace>; selectedPlaceId: string | null; expandedIds: Set<string>; onToggle: (id: string) => void; onSelect: (id: string) => void; onAddChild: (id: string) => void; isGM: boolean; visiblePlaceIds: Set<string> }) {
  const visibleChildren = node.children.filter((child) => visiblePlaceIds.has(child.id));
  const hasChildren = visibleChildren.length > 0;
  const expanded = expandedIds.has(node.id);

  if (!visiblePlaceIds.has(node.id) && !visibleChildren.length) return null;

  return <div className="place-tree-branch"><div className={`place-tree-row ${selectedPlaceId === node.id ? "place-tree-row-active" : ""}`}><button className="place-tree-select" onClick={() => onSelect(node.id)} type="button"><span className="place-tree-chevron" onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(node.id); }}>{hasChildren ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span />}</span><PlaceArt place={node} className="place-tree-art" /><span className="place-tree-copy"><strong>{node.name}</strong><small>{node.kind}</small></span></button>{isGM ? <button className="icon-button place-tree-add" aria-label={`Add child place under ${node.name}`} onClick={() => onAddChild(node.id)} title={`Add child under ${node.name}`} type="button"><Plus size={14} /></button> : null}</div>{expanded ? <div className="place-tree-children">{visibleChildren.map((child) => <PlaceTreeNodeView key={child.id} node={child} selectedPlaceId={selectedPlaceId} expandedIds={expandedIds} onToggle={onToggle} onSelect={onSelect} onAddChild={onAddChild} isGM={isGM} visiblePlaceIds={visiblePlaceIds} />)}</div> : null}</div>;
}

function PlaceDetail({ place, places, isGM, onEdit, onAddChild }: { place: ApiPlace; places: ApiPlace[]; isGM: boolean; onEdit: () => void; onAddChild: () => void }) {
  return <div className="place-detail"><div className="place-detail-heading"><div><p className="eyebrow">{place.kind.toUpperCase()} RECORD</p><h2>{place.name}</h2><p className="place-breadcrumb"><Map size={13} /> {getPlaceBreadcrumb(places, place.id)}</p></div>{isGM ? <div className="record-row-actions"><button className="icon-button" aria-label={`Edit ${place.name}`} onClick={onEdit} title={`Edit ${place.name}`} type="button"><Pencil size={15} /></button><button className="icon-button" aria-label={`Add child under ${place.name}`} onClick={onAddChild} title={`Add child under ${place.name}`} type="button"><Plus size={15} /></button></div> : null}</div><PlaceArt place={place} className="place-detail-art" /><div className="place-detail-body"><div><p className="eyebrow">PUBLIC BRIEF</p><p>{place.description || "No public description recorded yet."}</p></div><div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span></div><p>{place.player_notes_markdown || "No player notes recorded yet."}</p></div>{isGM ? <div className="markdown-preview place-private-preview"><div className="preview-toolbar"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></div><p>{place.gm_notes_markdown || "No private notes recorded yet."}</p></div> : null}</div></div>;
}