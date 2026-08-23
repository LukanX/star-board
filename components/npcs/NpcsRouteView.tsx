"use client";

import { useState } from "react";
import { CirclePlus, UserRound } from "lucide-react";
import NpcCard from "@/components/npcs/NpcCard";
import NpcEditor from "@/components/npcs/NpcEditor";
import NpcPreview from "@/components/npcs/NpcPreview";
import ArchiveMasterDetail from "@/components/ui/ArchiveMasterDetail";
import EmptyState from "@/components/ui/EmptyState";
import PageLayout from "@/components/ui/PageLayout";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { mapApiNpc } from "@/lib/campaign/mappers";
import type { ApiNpc, ApiPlace, NpcRecord } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";

export default function NpcsRouteView({ campaignId, role, initialNpcs, initialPlaces }: { campaignId: string; role: "gm" | "player"; initialNpcs: ApiNpc[]; initialPlaces: ApiPlace[] }) {
  const [npcs, setNpcs] = useState<NpcRecord[]>(() => initialNpcs.map(mapApiNpc));
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const places = initialPlaces;
  const selectedNpc = npcs.find((npc) => npc.id === selectedNpcId) ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleNpcs = normalizedSearch
    ? npcs.filter((npc) => `${npc.name} ${npc.species} ${npc.role} ${getPlaceBreadcrumb(places, npc.place_id)}`.toLowerCase().includes(normalizedSearch))
    : npcs;

  return <PageLayout eyebrow="ARCHIVE // CONTACTS" title="NPCs" description="People worth knowing, watching, or avoiding. Their private context stays behind the GM lock." action={role === "gm" ? "ADD NPC" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => setEditorOpen(true)}>
    {editorOpen ? <NpcEditor campaignId={campaignId} places={places} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { const nextNpc = mapApiNpc(saved, npcs.length); setNpcs((current) => [nextNpc, ...current]); setSelectedNpcId(saved.id); setEditorOpen(false); }} /> : null}
    {npcs.length ? <ArchiveMasterDetail
      selectedId={selectedNpcId}
      toolbar={<div data-npcs-toolbar="true" className="flex items-end justify-between gap-[20px] mb-[18px] pb-[13px] p-[15px_17px] border border-[var(--line)] bg-[linear-gradient(105deg,rgba(98,232,255,.055),rgba(255,92,154,.025))] max-[760px]:items-stretch max-[760px]:flex-col max-[760px]:gap-[15px] max-[760px]:p-[14px] max-[420px]:p-[12px]"><div className="grid gap-[7px]"><p className={`${eyebrowClassName} !m-0`}>{npcs.length.toString().padStart(2, "0")} RECORDED CONTACTS</p><strong className="text-[var(--ink)] text-[13px] font-[550]">{npcs.length ? "Campaign contacts" : "No NPC records yet"}</strong></div><label className="grid gap-[7px] w-[min(100%,330px)] text-[var(--dim)] font-mono text-[8px] tracking-[.12em] max-[760px]:w-full">SEARCH NPCS<input className="w-full h-[36px] border border-[rgba(139,151,169,.28)] outline-0 p-[0_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)] placeholder:text-[#4d5a6b]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, species, role, or place" /></label></div>}
      selectorEyebrow="CONTACT ROSTER"
      selectorTitle="Known contacts"
      selectorIcon={<UserRound size={17} />}
      selector={<div data-npc-list="true" className="border-t border-[var(--line)]">{visibleNpcs.length ? visibleNpcs.map((npc) => <NpcCard campaignId={campaignId} key={npc.id} npc={npc} selected={selectedNpcId === npc.id} onSelect={setSelectedNpcId} />) : <EmptyState icon={UserRound} title="No matching NPCs." message="Try a different name, species, role, or place." />}</div>}
      preview={selectedNpc ? <NpcPreview campaignId={campaignId} npc={selectedNpc} places={places} isGM={role === "gm"} /> : null}
      emptyPreview={<div data-npc-detail="true" className="min-w-0 p-[21px] max-[760px]:p-[17px]"><UserRound className="text-[var(--cyan)]" size={24} /><p className={eyebrowClassName}>ROUTE-OWNED CONTACT FILES</p><h2>Choose a contact from the roster.</h2><p>Select a record to inspect its public brief, notes, location, and GM-only context where available.</p></div>}
    /> : <EmptyState icon={UserRound} title="No NPCs recorded yet." message={role === "gm" ? "Add the first contact to this campaign archive." : "The GM has not recorded any contacts yet."} />}
  </PageLayout>;
}