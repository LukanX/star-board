"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import NpcEditor from "@/components/npcs/NpcEditor";
import NpcPublicRecord from "@/components/npcs/NpcPublicRecord";
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

  return <><CampaignArtEditorSlot /><NpcPublicRecord campaignId={campaignId} npc={mapApiNpc(npc, 0)} places={places} isGM={initialResult.role === "gm"} related={initialResult.related} />{initialResult.role === "gm" ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]" onClick={() => { setError(null); setEditorOpen(true); }} type="button"><Pencil size={15} /> EDIT NPC</button><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]" disabled={isDeleting} onClick={() => void deleteNpc()} type="button"><Trash2 size={15} /> {isDeleting ? "DELETING..." : "DELETE NPC"}</button></div> : null}{error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}{editorOpen ? <NpcEditor campaignId={campaignId} places={places} npc={npc} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setNpc(saved); setEditorOpen(false); }} /> : null}</>;
}