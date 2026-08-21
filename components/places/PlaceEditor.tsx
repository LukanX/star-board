"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CirclePlus, LockKeyhole, Sparkles, Trash2, X } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import { markCampaignArtPersisted, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import type { ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree, isPlaceDescendant } from "@/lib/places";

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

function toDraft(place: ApiPlace | undefined, parentPlaceId: string | null): PlaceDraft {
  return place ? {
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
  } : { ...emptyPlaceDraft, parentPlaceId };
}

export default function PlaceEditor({ campaignId, places, place, parentPlaceId = null, onSaved, onDeleted, onCancel }: {
  campaignId: string;
  places: ApiPlace[];
  place?: ApiPlace;
  parentPlaceId?: string | null;
  onSaved?: (place: ApiPlace) => void;
  onDeleted?: (placeId: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<PlaceDraft>(() => toDraft(place, parentPlaceId));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const update = (field: keyof PlaceDraft, value: string | null) => setDraft((current) => ({ ...current, [field]: value }));
  const flattenedPlaces = flattenPlaceTree(places);

  useCampaignArtEditor({
    campaignId,
    kind: "place",
    value: draft.artPath,
    trackUnsavedUploads: true,
    url: draft.artUrl,
    subject: draft.artSubject ?? `${draft.kind}: ${draft.name}`,
    currentPrompt: draft.artPrompt,
    onSubjectChange: (value) => update("artSubject", value),
    onChange: (value) => update("artPath", value),
    onUrlChange: (value) => update("artUrl", value),
    onPromptChange: (value) => update("artPrompt", value),
    onProviderChange: (value) => update("artProvider", value),
  });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places${place ? `/${encodeURIComponent(place.id)}` : ""}`, {
        method: place ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; place?: ApiPlace };
      if (!response.ok || !result.place) throw new Error(result.error ?? "Place could not be saved.");

      markCampaignArtPersisted(campaignId, result.place.art_path);
      onSaved?.(result.place);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Place could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deletePlace = async () => {
    if (!place || isSaving || !window.confirm(`Delete ${place.name} from the place archive? Children will become root places.`)) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places/${encodeURIComponent(place.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Place could not be deleted.");
      onDeleted?.(place.id);
      onCancel?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Place could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="character-editor place-editor"><div className="editor-heading"><div><p className="eyebrow">GM PLACE RECORD</p><h2>{place ? `Edit ${place.name}` : draft.parentPlaceId ? "Add a child place" : "Add a root place"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE PLACE"}</button><button aria-label="Close place editor" className="icon-button" onClick={onCancel} title="Close place editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/place" entityLabel="place" mode={place ? "refine" : "create"} requestFields={{ ...(draft.parentPlaceId ? { parentPlaceId: draft.parentPlaceId } : {}), name: draft.name, kind: draft.kind }} currentDraft={{ name: draft.name, kind: draft.kind, description: draft.description, playerNotes: draft.playerNotesMarkdown, gmNotes: draft.gmNotesMarkdown, visualPrompt: draft.artSubject ?? "" }} fields={[{ key: "name", label: "Name", maxLength: 160 }, { key: "kind", label: "Kind", maxLength: 80 }, { key: "description", label: "Description", maxLength: 4000, multiline: true }, { key: "playerNotes", label: "Player notes", maxLength: 2400, multiline: true }, { key: "gmNotes", label: "GM notes", maxLength: 2400, multiline: true }, { key: "visualPrompt", label: "Visual subject", maxLength: 1600, multiline: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, name: candidate.name ?? current.name, kind: candidate.kind ?? current.kind, description: candidate.description ?? current.description, playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown, gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown, artSubject: candidate.visualPrompt || current.artSubject }))} /> : null}<form className="character-form" onSubmit={save}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>Kind<input required maxLength={80} placeholder="Planet, city, dungeon, room..." value={draft.kind} onChange={(event) => update("kind", event.target.value)} /></label><label className="place-parent-field">Parent<select value={draft.parentPlaceId ?? ""} onChange={(event) => update("parentPlaceId", event.target.value || null)}><option value="">ROOT PLACE</option>{flattenedPlaces.filter(({ place: candidate }) => !place || (candidate.id !== place.id && !isPlaceDescendant(places, candidate.id, place.id))).map(({ place: candidate, depth }) => <option key={candidate.id} value={candidate.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${candidate.name} [${candidate.kind}]`}</option>)}</select></label></div><label>Description<textarea maxLength={4000} placeholder="What can the campaign safely reveal about this place?" value={draft.description} onChange={(event) => update("description", event.target.value)} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => update("playerNotesMarkdown", event.target.value)} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => update("gmNotesMarkdown", event.target.value)} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : place ? "SAVE CHANGES" : "ADD PLACE"}</button>{place ? <button className="button button-danger" disabled={isSaving} onClick={() => void deletePlace()} type="button"><Trash2 size={14} /> REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={onCancel} type="button">CANCEL</button></div></form></section>;
}