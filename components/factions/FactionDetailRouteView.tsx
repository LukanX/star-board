"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import FactionEditor from "@/components/factions/FactionEditor";
import FactionPublicRecord from "@/components/factions/FactionPublicRecord";
import { mapApiFaction } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace, ApiFaction } from "@/lib/campaign/types";
import type { CampaignFactionResult } from "@/lib/campaign/factions-server";

export default function FactionDetailRouteView({ campaignId, initialResult, initialPlaces }: { campaignId: string; initialResult: CampaignFactionResult; initialPlaces: ApiPlace[] }) {
  const router = useRouter();
  const [faction, setFaction] = useState<ApiFaction>(initialResult.faction);
  const [places] = useState<ApiPlace[]>(initialPlaces);
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

  return <><CampaignArtEditorSlot />{editorOpen ? <FactionEditor campaignId={campaignId} places={places} faction={faction} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setFaction(saved); setEditorOpen(false); }} /> : <><FactionPublicRecord campaignId={campaignId} faction={mapApiFaction(faction, 0)} places={places} related={initialResult.related} />{initialResult.role === "gm" ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]" onClick={() => { setError(null); setEditorOpen(true); }} type="button"><Pencil size={15} /> EDIT FACTION</button><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]" disabled={isDeleting} onClick={() => void deleteFaction()} type="button"><Trash2 size={15} /> {isDeleting ? "DELETING..." : "DELETE FACTION"}</button></div> : null}</>} {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}</>;
}