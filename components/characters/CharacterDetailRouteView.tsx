"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import CharacterEditor from "@/components/characters/CharacterEditor";
import CharacterPublicRecord from "@/components/characters/CharacterPublicRecord";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import { deleteCampaignCharacter } from "@/lib/campaign/client/characters";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { mapApiCharacter } from "@/lib/campaign/mappers";
import type { ApiCampaignMember, ApiCharacter } from "@/lib/campaign/types";

export default function CharacterDetailRouteView({ campaignId, currentUserId = "", initialCharacter, members = [], role = "player" }: { campaignId: string; currentUserId?: string; initialCharacter: ApiCharacter; members?: ApiCampaignMember[]; role?: "gm" | "player" }) {
  const router = useRouter();
  const [character, setCharacter] = useState(initialCharacter);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(initialCharacter.owner_id);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOwnershipSaving, setIsOwnershipSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);
  const [ownershipStatus, setOwnershipStatus] = useState<string | null>(null);

  const openEditor = () => {
    setError(null);
    setEditorOpen(true);
  };

  const ownerName = (ownerId: string | null) => {
    if (!ownerId) return "Unassigned";
    const member = members.find((candidate) => candidate.userId === ownerId);
    if (!member) return "Unassigned";
    return `${member.displayName}${member.role === "gm" ? " (GM)" : ""}`;
  };

  const saveOwnership = async () => {
    if (isOwnershipSaving || selectedOwnerId === character.owner_id) return;

    const nextOwnerName = ownerName(selectedOwnerId);
    const callerWillLoseEditAccess = character.owner_id === currentUserId && selectedOwnerId !== currentUserId;
    const confirmation = callerWillLoseEditAccess
      ? `Transfer ${character.name} to ${nextOwnerName}? You will lose edit access.`
      : `Assign ${character.name} to ${nextOwnerName}?`;

    if (!window.confirm(confirmation)) return;

    setIsOwnershipSaving(true);
    setOwnershipError(null);
    setOwnershipStatus(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(character.id)}/ownership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: selectedOwnerId }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; character?: ApiCharacter };

      if (!response.ok || !result.character) {
        throw new Error(result.error ?? "Character ownership could not be updated.");
      }

      setCharacter(result.character);
      setSelectedOwnerId(result.character.owner_id);
      setOwnershipStatus(`Assigned to ${ownerName(result.character.owner_id)}.`);
      router.refresh();
    } catch (saveError) {
      setOwnershipError(saveError instanceof Error ? saveError.message : "Character ownership could not be updated.");
    } finally {
      setIsOwnershipSaving(false);
    }
  };

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
    {editorOpen ? <CharacterEditor campaignId={campaignId} character={character} currentUserId={currentUserId} members={members} role={role} onCancel={() => setEditorOpen(false)} onSaved={(savedCharacter) => {
      setCharacter(savedCharacter);
      setEditorOpen(false);
    }} /> : <>
      <CharacterPublicRecord
        campaignId={campaignId}
        character={mapApiCharacter(character, 0)}
        actions={<>{character.can_edit ? <RecordEditAction recordName={character.name} disabled={isDeleting} onClick={openEditor} /> : null}</>}
      />
      {character.can_edit ? <section className="mt-[18px] grid gap-3 border border-[rgba(98,232,255,.24)] bg-[rgba(98,232,255,.04)] p-5">
        <div>
          <p className="m-0 mb-1 text-[var(--cyan)] font-mono text-[8px] tracking-[.12em]">CHARACTER OWNERSHIP</p>
          <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.6]">Current owner: {ownerName(character.owner_id)}</p>
        </div>
        <div className="flex items-end gap-3 max-[600px]:items-stretch max-[600px]:flex-col">
          <label className="grid flex-1 gap-[7px] text-[var(--dim)] font-mono text-[8px] tracking-[.12em]">
            ASSIGN TO
            <select
              className="w-full h-[42px] border border-[rgba(139,151,169,.28)] outline-0 px-[10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[11px] focus:border-[var(--cyan)]"
              disabled={isOwnershipSaving}
              onChange={(event) => {
                setSelectedOwnerId(event.target.value || null);
                setOwnershipError(null);
                setOwnershipStatus(null);
              }}
              value={selectedOwnerId ?? ""}
            >
              <option value="">Unassigned</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}{member.role === "gm" ? " (GM)" : ""}</option>)}
            </select>
          </label>
          <button
            className="h-[42px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--cyan)] bg-[var(--cyan)] text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isOwnershipSaving || selectedOwnerId === character.owner_id}
            onClick={() => void saveOwnership()}
            type="button"
          >
            <Check size={14} /> {isOwnershipSaving ? "APPLYING..." : "APPLY OWNER"}
          </button>
        </div>
        {ownershipError ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{ownershipError}</p> : null}
        {ownershipStatus ? <p className="m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.1em]" role="status">{ownershipStatus}</p> : null}
      </section> : null}
      {character.can_edit ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
        <RecordDeleteAction recordName={character.name} disabled={isDeleting} onClick={() => void deleteCharacter()} />
      </div> : null}
    </>}
    {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
  </>;
}