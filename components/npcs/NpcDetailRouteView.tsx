"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import NpcEditor from "@/components/npcs/NpcEditor";
import NpcPublicRecord from "@/components/npcs/NpcPublicRecord";
import { fetchCampaignPlaces } from "@/lib/campaign/client/places";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { mapApiNpc } from "@/lib/campaign/mappers";
import type { ApiNpc, ApiPlace } from "@/lib/campaign/types";
import type { CampaignNpcResult } from "@/lib/campaign/npcs-server";

export default function NpcDetailRouteView({ campaignId, initialResult }: { campaignId: string; initialResult: CampaignNpcResult }) {
  const router = useRouter();
  const [npc, setNpc] = useState<ApiNpc>(initialResult.npc);
  const [places, setPlaces] = useState<ApiPlace[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCampaignPlaces(campaignId).then(setPlaces).catch(() => setPlaces([]));
  }, [campaignId]);

  const deleteNpc = async () => {
    if (isDeleting || !window.confirm(`Delete ${npc.name} from this campaign?`)) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/npcs/${encodeURIComponent(npc.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "NPC could not be deleted.");
      router.push(campaignSectionPath(campaignId, "npcs"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "NPC could not be deleted.");
      setIsDeleting(false);
    }
  };

  return <><CampaignArtEditorSlot /><NpcPublicRecord campaignId={campaignId} npc={mapApiNpc(npc, 0)} places={places} />{initialResult.role === "gm" ? <div className="character-form-actions"><button className="button button-secondary" onClick={() => { setError(null); setEditorOpen(true); }} type="button"><Pencil size={15} /> EDIT NPC</button><button className="button button-danger" disabled={isDeleting} onClick={() => void deleteNpc()} type="button"><Trash2 size={15} /> {isDeleting ? "DELETING..." : "DELETE NPC"}</button></div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{editorOpen ? <NpcEditor campaignId={campaignId} places={places} npc={npc} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setNpc(saved); setEditorOpen(false); }} /> : null}</>;
}