"use client";

import { useState } from "react";
import { CirclePlus, Network } from "lucide-react";
import FactionCard from "@/components/factions/FactionCard";
import FactionEditor from "@/components/factions/FactionEditor";
import FactionPreview from "@/components/factions/FactionPreview";
import ArchiveMasterDetail from "@/components/ui/ArchiveMasterDetail";
import ArchivePreviewEmptyState from "@/components/ui/ArchivePreviewEmptyState";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { CampaignAffiliationContext } from "@/lib/campaign/affiliations-server";
import { mapApiFaction } from "@/lib/campaign/mappers";
import type { ApiFaction, ApiPlace, FactionRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function FactionsRouteView({ campaignId, role, initialFactions, initialPlaces, initialAffiliations }: { campaignId: string; role: "gm" | "player"; initialFactions: ApiFaction[]; initialPlaces: ApiPlace[]; initialAffiliations: CampaignAffiliationContext }) {
  const [factions, setFactions] = useState<FactionRecord[]>(() => initialFactions.map(mapApiFaction));
  const [affiliations, setAffiliations] = useState<CampaignAffiliationContext>(initialAffiliations);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const places = initialPlaces;
  const memberCounts = new Map<string, number>();
  affiliations.npcs.forEach((npc) => {
    if (npc.factionId) memberCounts.set(npc.factionId, (memberCounts.get(npc.factionId) ?? 0) + 1);
  });
  const selectedFaction = factions.find((faction) => faction.id === selectedFactionId) ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFactions = normalizedSearch
    ? factions.filter((faction) => `${faction.name} ${faction.status} ${getPlaceBreadcrumb(places, faction.place_id)}`.toLowerCase().includes(normalizedSearch))
    : factions;

  return <PageLayout eyebrow="ARCHIVE // POWER MAP" title="Factions" description="The groups shaping this campaign. Use them as mission givers and campaign context." action={role === "gm" && !editorOpen ? "ADD FACTION" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => setEditorOpen(true)}>{editorOpen ? <FactionEditor campaignId={campaignId} places={places} npcs={affiliations.npcs} factions={affiliations.factions} onCancel={() => setEditorOpen(false)} onSaved={(saved, memberNpcIds) => { const existingIndex = factions.findIndex((current) => current.id === saved.id); const nextFaction = mapApiFaction(saved, existingIndex >= 0 ? existingIndex : factions.length); setFactions((current) => current.some((currentFaction) => currentFaction.id === saved.id) ? current.map((currentFaction) => currentFaction.id === saved.id ? nextFaction : currentFaction) : [nextFaction, ...current]); setAffiliations((current) => { const selectedNpcIds = new Set(memberNpcIds); const nextSummary = { id: saved.id, name: saved.name, status: saved.status }; return { ...current, factions: current.factions.some((currentFaction) => currentFaction.id === saved.id) ? current.factions.map((currentFaction) => currentFaction.id === saved.id ? nextSummary : currentFaction) : [...current.factions, nextSummary], npcs: current.npcs.map((npc) => selectedNpcIds.has(npc.id) ? { ...npc, factionId: saved.id } : npc.factionId === saved.id ? { ...npc, factionId: null } : npc) }; }); setSelectedFactionId(saved.id); setEditorOpen(false); }} /> : factions.length ? <ArchiveMasterDetail
    selectedId={selectedFactionId}
    toolbar={<div data-factions-toolbar="true" className="flex items-end justify-between gap-[20px] mb-[18px] pb-[13px] p-[15px_17px] border border-[var(--line)] bg-[linear-gradient(105deg,rgba(98,232,255,.055),rgba(255,92,154,.025))] max-[760px]:items-stretch max-[760px]:flex-col max-[760px]:gap-[15px] max-[760px]:p-[14px] max-[420px]:p-[12px]"><div className="grid gap-[7px]"><p className={`${eyebrowClassName} !m-0`}>{factions.length.toString().padStart(2, "0")} RECORDED FACTIONS</p><strong className="text-[var(--ink)] text-[13px] font-[550]">{factions.length ? "Campaign powers" : "No faction records yet"}</strong></div><label className="grid gap-[7px] w-[min(100%,330px)] text-[var(--dim)] font-mono text-[8px] tracking-[.12em] max-[760px]:w-full">SEARCH FACTIONS<input className="w-full h-[36px] border border-[rgba(139,151,169,.28)] outline-0 p-[0_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)] placeholder:text-[#4d5a6b]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, status, or place" /></label></div>}
    selectorEyebrow="POWER MAP"
    selectorTitle="Known factions"
    selectorIcon={<Network size={17} />}
    selector={<div data-faction-grid="true" className="grid grid-cols-1 gap-[14px] p-[10px] max-[760px]:gap-[9px]">{visibleFactions.length ? visibleFactions.map((faction) => <FactionCard faction={faction} memberCount={memberCounts.get(faction.id) ?? 0} key={faction.id} selected={selectedFactionId === faction.id} onSelect={setSelectedFactionId} />) : <EmptyState icon={Network} title="No matching factions." message="Try a different name, status, or place." />}</div>}
    preview={selectedFaction ? <FactionPreview campaignId={campaignId} faction={selectedFaction} places={places} memberNpcs={affiliations.npcs.filter((npc) => npc.factionId === selectedFaction.id)} isGM={role === "gm"} /> : null}
    emptyPreview={<ArchivePreviewEmptyState data-faction-detail="true" icon={Network} eyebrow="ROUTE-OWNED POWER FILES" title="Choose a faction from the map." message="Select a record to inspect its public brief, status, location, and campaign role." />}
  /> : <EmptyState icon={Network} title="No factions recorded yet." message={role === "gm" ? "Add the first faction to establish campaign context." : "The GM has not recorded any factions yet."} />}</PageLayout>;
}