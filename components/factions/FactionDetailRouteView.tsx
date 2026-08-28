"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import FactionEditor from "@/components/factions/FactionEditor";
import FactionPublicRecord from "@/components/factions/FactionPublicRecord";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import type { CampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { mapApiFaction } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace, ApiFaction } from "@/lib/campaign/types";
import type { CampaignFactionResult } from "@/lib/campaign/factions-server";

export default function FactionDetailRouteView({ campaignId, initialResult, initialPlaces, initialAffiliations }: { campaignId: string; initialResult: CampaignFactionResult; initialPlaces: ApiPlace[]; initialAffiliations: CampaignAffiliationContext }) {
  const router = useRouter();
  const [faction, setFaction] = useState<ApiFaction>(initialResult.faction);
  const [places] = useState<ApiPlace[]>(initialPlaces);
  const [affiliations, setAffiliations] = useState<CampaignAffiliationContext>(initialAffiliations);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const memberNpcs = affiliations.npcs.filter((npc) => npc.factionId === faction.id);
  const related = { ...initialResult.related, npcs: memberNpcs };

  return <><CampaignArtEditorSlot />{editorOpen ? <FactionEditor campaignId={campaignId} places={places} npcs={affiliations.npcs} factions={affiliations.factions} faction={faction} onCancel={() => setEditorOpen(false)} onSaved={(saved, memberNpcIds) => { setFaction(saved); setAffiliations((current) => { const selectedNpcIds = new Set(memberNpcIds); const nextSummary = { id: saved.id, name: saved.name, status: saved.status }; return { ...current, factions: current.factions.map((currentFaction) => currentFaction.id === saved.id ? nextSummary : currentFaction), npcs: current.npcs.map((npc) => selectedNpcIds.has(npc.id) ? { ...npc, factionId: saved.id } : npc.factionId === saved.id ? { ...npc, factionId: null } : npc) }; }); setEditorOpen(false); }} /> : <><FactionPublicRecord campaignId={campaignId} faction={mapApiFaction(faction, 0)} places={places} isGM={initialResult.role === "gm"} related={related} actions={initialResult.role === "gm" ? <RecordEditAction recordName={faction.name} disabled={isDeleting} onClick={() => { setError(null); setEditorOpen(true); }} /> : null} />{initialResult.role === "gm" ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><RecordDeleteAction recordName={faction.name} disabled={isDeleting} onClick={() => void deleteFaction()} /></div> : null}</>} {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}</>;
}