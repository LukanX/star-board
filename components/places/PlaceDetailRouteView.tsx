"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import PlaceEditor from "@/components/places/PlaceEditor";
import PlacePublicRecord from "@/components/places/PlacePublicRecord";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import type { CampaignPlaceResult } from "@/lib/campaign/places-server";

export default function PlaceDetailRouteView({ campaignId, initialResult, initialPlaces }: { campaignId: string; initialResult: CampaignPlaceResult; initialPlaces: ApiPlace[] }) {
  const router = useRouter();
  const [place, setPlace] = useState(initialResult.place);
  const [places, setPlaces] = useState(initialPlaces);
  const [editorMode, setEditorMode] = useState<"edit" | "child" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGM = initialResult.role === "gm";

  const deletePlace = async () => {
    if (isDeleting || !window.confirm(`Delete ${place.name} from the place archive? Children will become root places.`)) return;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places/${encodeURIComponent(place.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Place could not be deleted.");
      router.push(campaignSectionPath(campaignId, "places"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Place could not be deleted.");
      setIsDeleting(false);
    }
  };

  const savePlace = (savedPlace: ApiPlace) => {
    setPlaces((current) => current.some((currentPlace) => currentPlace.id === savedPlace.id) ? current.map((currentPlace) => currentPlace.id === savedPlace.id ? savedPlace : currentPlace) : [...current, savedPlace]);
    if (savedPlace.id === place.id) setPlace(savedPlace);
    setEditorMode(null);
  };

  const actions = isGM ? <><button aria-label={`Edit ${place.name}`} className="icon-button" onClick={() => { setError(null); setEditorMode("edit"); }} title={`Edit ${place.name}`} type="button"><Pencil size={15} /></button><button aria-label={`Add child under ${place.name}`} className="icon-button" onClick={() => { setError(null); setEditorMode("child"); }} title={`Add child under ${place.name}`} type="button"><Plus size={15} /></button></> : null;

  return <><CampaignArtEditorSlot /><PlacePublicRecord campaignId={campaignId} place={place} places={places} isGM={isGM} actions={actions} />{isGM ? <div className="character-form-actions"><button className="button button-danger" disabled={isDeleting} onClick={() => void deletePlace()} type="button"><Trash2 size={14} /> {isDeleting ? "DELETING..." : "DELETE PLACE"}</button></div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{editorMode ? <PlaceEditor key={`${editorMode}:${place.id}`} campaignId={campaignId} places={places} place={editorMode === "edit" ? place : undefined} parentPlaceId={editorMode === "child" ? place.id : null} onCancel={() => setEditorMode(null)} onSaved={savePlace} onDeleted={() => router.push(campaignSectionPath(campaignId, "places"))} /> : null}</>;
}