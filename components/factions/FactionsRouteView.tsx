"use client";

import { useEffect, useState } from "react";
import { CirclePlus, Network } from "lucide-react";
import FactionCard from "@/components/factions/FactionCard";
import FactionEditor from "@/components/factions/FactionEditor";
import PageLayout from "@/components/ui/PageLayout";
import { fetchCampaignPlaces } from "@/lib/campaign/client/places";
import { mapApiFaction } from "@/lib/campaign/mappers";
import type { ApiFaction, ApiPlace, FactionRecord } from "@/lib/campaign/types";

export default function FactionsRouteView({ campaignId, role, initialFactions }: { campaignId: string; role: "gm" | "player"; initialFactions: ApiFaction[] }) {
  const [factions, setFactions] = useState<FactionRecord[]>(() => initialFactions.map(mapApiFaction));
  const [places, setPlaces] = useState<ApiPlace[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    void fetchCampaignPlaces(campaignId).then(setPlaces).catch(() => setPlaces([]));
  }, [campaignId]);

  return <PageLayout eyebrow="ARCHIVE // POWER MAP" title="Factions" description="The groups shaping this campaign. Use them as mission givers and campaign context." action={role === "gm" ? "ADD FACTION" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => setEditorOpen(true)}>{editorOpen ? <FactionEditor campaignId={campaignId} places={places} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setFactions((current) => [mapApiFaction(saved, current.length), ...current]); setEditorOpen(false); }} /> : null}{factions.length ? <div className="faction-grid">{factions.map((faction) => <FactionCard campaignId={campaignId} faction={faction} key={faction.id} places={places} />)}</div> : <div className="character-empty"><Network size={22} /><h2>No factions recorded yet.</h2><p>{role === "gm" ? "Add the first faction to establish campaign context." : "The GM has not recorded any factions yet."}</p></div>}</PageLayout>;
}