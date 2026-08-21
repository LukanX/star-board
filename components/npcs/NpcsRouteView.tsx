"use client";

import { useEffect, useState } from "react";
import { CirclePlus, UserRound } from "lucide-react";
import NpcCard from "@/components/npcs/NpcCard";
import NpcEditor from "@/components/npcs/NpcEditor";
import PageLayout from "@/components/ui/PageLayout";
import { fetchCampaignPlaces } from "@/lib/campaign/client/places";
import { mapApiNpc } from "@/lib/campaign/mappers";
import type { ApiNpc, ApiPlace, NpcRecord } from "@/lib/campaign/types";

export default function NpcsRouteView({ campaignId, role, initialNpcs }: { campaignId: string; role: "gm" | "player"; initialNpcs: ApiNpc[] }) {
  const [npcs, setNpcs] = useState<NpcRecord[]>(() => initialNpcs.map(mapApiNpc));
  const [places, setPlaces] = useState<ApiPlace[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    void fetchCampaignPlaces(campaignId).then(setPlaces).catch(() => setPlaces([]));
  }, [campaignId]);

  return <PageLayout eyebrow="ARCHIVE // CONTACTS" title="NPCs" description="People worth knowing, watching, or avoiding. Their private context stays behind the GM lock." action={role === "gm" ? "ADD NPC" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => setEditorOpen(true)}>
    {editorOpen ? <NpcEditor campaignId={campaignId} places={places} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setNpcs((current) => [mapApiNpc(saved, current.length), ...current]); setEditorOpen(false); }} /> : null}
    {npcs.length ? <div className="record-list">{npcs.map((npc) => <NpcCard campaignId={campaignId} key={npc.id} npc={npc} />)}</div> : <div className="character-empty"><UserRound size={22} /><h2>No NPCs recorded yet.</h2><p>{role === "gm" ? "Add the first contact to this campaign archive." : "The GM has not recorded any contacts yet."}</p></div>}
  </PageLayout>;
}