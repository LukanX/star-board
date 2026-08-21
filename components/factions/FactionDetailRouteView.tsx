"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import FactionEditor from "@/components/factions/FactionEditor";
import FactionPublicRecord from "@/components/factions/FactionPublicRecord";
import { fetchCampaignPlaces } from "@/lib/campaign/client/places";
import { mapApiFaction } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace, ApiFaction } from "@/lib/campaign/types";
import type { CampaignFactionResult } from "@/lib/campaign/factions-server";

export default function FactionDetailRouteView({ campaignId, initialResult }: { campaignId: string; initialResult: CampaignFactionResult }) {
  const router = useRouter();
  const [faction, setFaction] = useState<ApiFaction>(initialResult.faction);
  const [places, setPlaces] = useState<ApiPlace[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCampaignPlaces(campaignId).then(setPlaces).catch(() => setPlaces([]));
  }, [campaignId]);

  const deleteFaction = async () => {
    if (isDeleting || !window.confirm(`Delete ${faction.name} from this campaign?`)) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/factions/${encodeURIComponent(faction.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Faction could not be deleted.");
      router.push(campaignSectionPath(campaignId, "factions"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Faction could not be deleted.");
      setIsDeleting(false);
    }
  };

  return <><CampaignArtEditorSlot /><FactionPublicRecord campaignId={campaignId} faction={mapApiFaction(faction, 0)} places={places} />{initialResult.role === "gm" ? <div className="character-form-actions"><button className="button button-secondary" onClick={() => { setError(null); setEditorOpen(true); }} type="button"><Pencil size={15} /> EDIT FACTION</button><button className="button button-danger" disabled={isDeleting} onClick={() => void deleteFaction()} type="button"><Trash2 size={15} /> {isDeleting ? "DELETING..." : "DELETE FACTION"}</button></div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{editorOpen ? <FactionEditor campaignId={campaignId} places={places} faction={faction} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setFaction(saved); setEditorOpen(false); }} /> : null}</>;
}