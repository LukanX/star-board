"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import CharacterEditor from "@/components/characters/CharacterEditor";
import CharacterPublicRecord from "@/components/characters/CharacterPublicRecord";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
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
    {editorOpen ? <CharacterEditor campaignId={campaignId} character={character} onCancel={() => setEditorOpen(false)} onSaved={(savedCharacter) => { setCharacter(savedCharacter); setEditorOpen(false); }} /> : <>
      <CharacterPublicRecord
        campaignId={campaignId}
        character={mapApiCharacter(character, 0)}
        actions={character.can_edit ? <RecordEditAction recordName={character.name} disabled={isDeleting} onClick={() => { setError(null); setEditorOpen(true); }} /> : null}
      />
      {character.can_edit ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
        <RecordDeleteAction recordName={character.name} disabled={isDeleting} onClick={() => void deleteCharacter()} />
      </div> : null}
    </>}
    {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
  </>;
}