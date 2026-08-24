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
    {editorOpen ? <CharacterEditor campaignId={campaignId} character={character} onCancel={() => setEditorOpen(false)} onSaved={(savedCharacter) => { setCharacter(savedCharacter); setEditorOpen(false); }} /> : <>
      <CharacterPublicRecord campaignId={campaignId} character={mapApiCharacter(character, 0)} />
      {character.can_edit ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
        <button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]" onClick={() => { setError(null); setEditorOpen(true); }} type="button"><Pencil size={15} /> EDIT CHARACTER</button>
        <button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]" disabled={isDeleting} onClick={() => void deleteCharacter()} type="button"><Trash2 size={15} /> {isDeleting ? "DELETING..." : "DELETE CHARACTER"}</button>
      </div> : null}
    </>}
    {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
  </>;
}