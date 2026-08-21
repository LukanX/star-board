"use client";

import { useState } from "react";
import PageLayout from "@/components/ui/PageLayout";
import CharacterCard from "@/components/characters/CharacterCard";
import CharacterEditor from "@/components/characters/CharacterEditor";
import { mapApiCharacter } from "@/lib/campaign/mappers";
import type { ApiCharacter, Character } from "@/lib/campaign/types";

export default function CharactersRouteView({ campaignId, initialCharacters }: { campaignId: string; initialCharacters: ApiCharacter[] }) {
  const [characters, setCharacters] = useState<Character[]>(() => initialCharacters.map(mapApiCharacter));
  const [editorOpen, setEditorOpen] = useState(false);
  return <PageLayout eyebrow="ARCHIVE // CREW ROSTER" title="Characters" description="The people, androids, and mysteries currently recorded in this campaign." action="ADD CHARACTER" onAction={() => setEditorOpen(true)}>
    {editorOpen ? <CharacterEditor campaignId={campaignId} onCancel={() => setEditorOpen(false)} onSaved={(saved) => { setCharacters((current) => [...current, mapApiCharacter(saved, current.length)]); setEditorOpen(false); }} /> : null}
    {characters.length ? <div className="character-grid">{characters.map((character) => <CharacterCard campaignId={campaignId} character={character} key={character.id} />)}</div> : <div className="character-empty"><h2>No characters in the roster yet.</h2><p>Add the first crew record to begin the campaign manifest.</p></div>}
  </PageLayout>;
}