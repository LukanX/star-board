"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import CharacterEditor from "@/components/characters/CharacterEditor";
import CharacterPublicRecord from "@/components/characters/CharacterPublicRecord";
import { deleteCampaignCharacter } from "@/lib/campaign/client/characters";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { mapApiCharacter } from "@/lib/campaign/mappers";
import type { ApiCharacter } from "@/lib/campaign/types";

export default function CharacterDetailRouteView({ campaignId, initialCharacter }: { campaignId: string; initialCharacter: ApiCharacter }) {
  const router = useRouter();
  const [character, setCharacter] = useState(initialCharacter);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteCharacter = async () => {
    if (isDeleting || !window.confirm(`Delete ${character.name} from this campaign?`)) return;

    setIsDeleting(true);
    setError(null);

    try {
      await deleteCampaignCharacter(campaignId, character.id);
      router.push(campaignSectionPath(campaignId, "characters"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Character could not be deleted.");
      setIsDeleting(false);
    }
  };

  return <>
    <CampaignArtEditorSlot />
    <CharacterPublicRecord campaignId={campaignId} character={mapApiCharacter(character, 0)} />
    {character.can_edit ? <div className="character-form-actions">
      <button className="button button-secondary" onClick={() => { setError(null); setEditorOpen(true); }} type="button"><Pencil size={15} /> EDIT CHARACTER</button>
      <button className="button button-danger" disabled={isDeleting} onClick={() => void deleteCharacter()} type="button"><Trash2 size={15} /> {isDeleting ? "DELETING..." : "DELETE CHARACTER"}</button>
    </div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {editorOpen ? <CharacterEditor campaignId={campaignId} character={character} onCancel={() => setEditorOpen(false)} onSaved={(savedCharacter) => { setCharacter(savedCharacter); setEditorOpen(false); }} /> : null}
  </>;
}