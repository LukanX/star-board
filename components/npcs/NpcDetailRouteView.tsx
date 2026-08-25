"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import NpcEditor from "@/components/npcs/NpcEditor";
import NpcPublicRecord from "@/components/npcs/NpcPublicRecord";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { mapApiNpc } from "@/lib/campaign/mappers";
import type { ApiNpc, ApiPlace } from "@/lib/campaign/types";
import type { CampaignNpcResult } from "@/lib/campaign/npcs-server";

export default function NpcDetailRouteView({ campaignId, initialResult, initialPlaces }: { campaignId: string; initialResult: CampaignNpcResult; initialPlaces: ApiPlace[] }) {
  const router = useRouter();
  const [npc, setNpc] = useState<ApiNpc>(initialResult.npc);
  const [places] = useState<ApiPlace[]>(initialPlaces);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return <><CampaignArtEditorSlot />{editorOpen ? <NpcEditor campaignId={campaignId} places={places} npc={npc} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setNpc(saved); setEditorOpen(false); }} /> : <><NpcPublicRecord campaignId={campaignId} npc={mapApiNpc(npc, 0)} places={places} isGM={initialResult.role === "gm"} related={initialResult.related} actions={initialResult.role === "gm" ? <RecordEditAction recordName={npc.name} disabled={isDeleting} onClick={() => { setError(null); setEditorOpen(true); }} /> : null} />{initialResult.role === "gm" ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><RecordDeleteAction recordName={npc.name} disabled={isDeleting} onClick={() => void deleteNpc()} /></div> : null}</>}{error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}</>;
}