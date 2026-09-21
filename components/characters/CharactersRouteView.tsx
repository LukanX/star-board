"use client";

import { useState } from "react";
import PageLayout from "@/components/ui/PageLayout";
import EmptyState from "@/components/ui/EmptyState";
import CharacterCard from "@/components/characters/CharacterCard";
import CharacterEditor from "@/components/characters/CharacterEditor";
import { mapApiCharacter } from "@/lib/campaign/mappers";
import type { ApiCampaignMember, ApiCharacter, Character } from "@/lib/campaign/types";

export default function CharactersRouteView({ campaignId, currentUserId, initialCharacters, members, role }: { campaignId: string; currentUserId: string; initialCharacters: ApiCharacter[]; members: ApiCampaignMember[]; role: "gm" | "player" }) {
  const [characters, setCharacters] = useState<Character[]>(() => initialCharacters.map(mapApiCharacter));
  const [editorOpen, setEditorOpen] = useState(false);
  return <PageLayout eyebrow="ARCHIVE // CHARACTER ROSTER" title="Characters" description="The people, androids, and mysteries currently recorded in this campaign." action={editorOpen ? undefined : "ADD CHARACTER"} onAction={() => setEditorOpen(true)}>
    {editorOpen ? <CharacterEditor campaignId={campaignId} currentUserId={currentUserId} members={members} role={role} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setCharacters((current) => [...current, mapApiCharacter(saved, current.length)]); setEditorOpen(false); }} /> : characters.length ? <div data-character-grid="true" className="grid grid-cols-4 gap-[14px] max-[1100px]:grid-cols-2 max-[760px]:gap-[9px] max-[420px]:grid-cols-1">{characters.map((character) => <CharacterCard campaignId={campaignId} character={character} key={character.id} />)}</div> : <EmptyState title="No characters in the roster yet." message="Add the first character to start the roster." />}
  </PageLayout>;
}