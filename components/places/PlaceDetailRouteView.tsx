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

  const actions = isGM ? <><button aria-label={`Edit ${place.name}`} className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]" onClick={() => { setError(null); setEditorMode("edit"); }} title={`Edit ${place.name}`} type="button"><Pencil size={15} /></button><button aria-label={`Add child under ${place.name}`} className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]" onClick={() => { setError(null); setEditorMode("child"); }} title={`Add child under ${place.name}`} type="button"><Plus size={15} /></button></> : null;

  return <><CampaignArtEditorSlot />{editorMode ? null : <><PlacePublicRecord campaignId={campaignId} place={place} places={places} isGM={isGM} actions={actions} related={initialResult.related} />{isGM ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]" disabled={isDeleting} onClick={() => void deletePlace()} type="button"><Trash2 size={14} /> {isDeleting ? "DELETING..." : "DELETE PLACE"}</button></div> : null}</>}{error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}{editorMode ? <PlaceEditor key={`${editorMode}:${place.id}`} campaignId={campaignId} places={places} place={editorMode === "edit" ? place : undefined} parentPlaceId={editorMode === "child" ? place.id : null} onCancel={() => setEditorMode(null)} onSaved={savePlace} onDeleted={() => router.push(campaignSectionPath(campaignId, "places"))} /> : null}</>;
}