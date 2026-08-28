"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LockKeyhole, Sparkles, Users, X } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import {
  markCampaignArtPersisted,
  useCampaignArtEditor,
} from "@/components/archive/CampaignArtField";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { CampaignAffiliationNpc } from "@/lib/campaign/affiliations-server";
import type { RelatedFactionSummary } from "@/lib/campaign/detail-types";
import type { ApiFaction, ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree } from "@/lib/places";

type FactionDraft = {
  name: string;
  description: string;
  status: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  placeId: string | null;
  memberNpcIds: string[];
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyFactionDraft: FactionDraft = {
  name: "",
  description: "",
  status: "active",
  playerNotesMarkdown: "",
  gmNotesMarkdown: "",
  placeId: null,
  memberNpcIds: [],
  artSubject: "",
  artPath: null,
  artUrl: null,
  artPrompt: null,
  artProvider: null,
};

function toDraft(faction: ApiFaction | undefined, npcs: CampaignAffiliationNpc[]): FactionDraft {
  return faction
    ? {
        name: faction.name,
        description: faction.description,
        status: faction.status,
        playerNotesMarkdown: faction.player_notes_markdown,
        gmNotesMarkdown: faction.gm_notes_markdown ?? "",
        placeId: faction.place_id,
        memberNpcIds: npcs.filter((npc) => npc.factionId === faction.id).map((npc) => npc.id),
        artSubject: faction.art_subject ?? "",
        artPath: faction.art_path,
        artUrl: faction.art_url ?? null,
        artPrompt: faction.art_prompt,
        artProvider: faction.art_provider ?? null,
      }
    : emptyFactionDraft;
}

export default function FactionEditor({
  campaignId,
  places,
  npcs = [],
  factions = [],
  faction,
  onSaved,
  onCancel: parentOnCancel,
}: {
  campaignId: string;
  places: ApiPlace[];
  npcs?: CampaignAffiliationNpc[];
  factions?: RelatedFactionSummary[];
  faction?: ApiFaction;
  onSaved?: (faction: ApiFaction, memberNpcIds: string[]) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraftState] = useState<FactionDraft>(() => toDraft(faction, npcs));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { setDirty, clearDirty } = useDirtyForm();
  const setDraft = (updater: (current: FactionDraft) => FactionDraft) => {
    setDirty();
    setDraftState(updater);
  };
  const update = (field: keyof FactionDraft, value: string | null) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const toggleMember = (npc: CampaignAffiliationNpc) => {
    const isMember = draft.memberNpcIds.includes(npc.id);
    if (!isMember && npc.factionId && npc.factionId !== faction?.id) {
      const sourceFaction = factions.find((candidate) => candidate.id === npc.factionId);
      const targetName = draft.name.trim() || faction?.name || "this faction";
      if (!window.confirm(`Transfer ${npc.name} from ${sourceFaction?.name ?? "its current faction"} to ${targetName}?`)) return;
    }

    setDraft((current) => ({
      ...current,
      memberNpcIds: isMember
        ? current.memberNpcIds.filter((memberId) => memberId !== npc.id)
        : [...current.memberNpcIds, npc.id],
    }));
  };
  const onCancel = () => {
    clearDirty();
    parentOnCancel?.();
  };

  useCampaignArtEditor({
    campaignId,
    kind: "faction",
    value: draft.artPath,
    trackUnsavedUploads: true,
    url: draft.artUrl,
    subject: draft.artSubject,
    currentPrompt: draft.artPrompt,
    onSubjectChange: (value) => update("artSubject", value),
    onChange: (value) => update("artPath", value),
    onUrlChange: (value) => update("artUrl", value),
    onPromptChange: (value) => update("artPrompt", value),
    onProviderChange: (value) => update("artProvider", value),
  });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/factions${faction ? `/${encodeURIComponent(faction.id)}` : ""}`,
        {
          method: faction ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        faction?: ApiFaction;
        memberNpcIds?: string[];
      };
      if (!response.ok || !result.faction)
        throw new Error(result.error ?? "Faction could not be saved.");
      markCampaignArtPersisted(campaignId, result.faction.art_path);
      clearDirty();
      onSaved?.(result.faction, result.memberNpcIds ?? draft.memberNpcIds);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Faction could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
          <p className={eyebrowClassName}>GM FACTION RECORD</p>
          <h2 className="mt-[6px] text-[19px]">
            {faction ? `Edit ${faction.name}` : "Add a faction"}
          </h2>
        </div>
        <div className="editor-heading-actions flex items-center justify-end gap-2 flex-wrap max-[420px]:w-full max-[420px]:justify-start">
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] max-[420px]:flex-1"
            disabled={isSaving}
            onClick={() => setAssistantOpen((current) => !current)}
            type="button"
          >
            <Sparkles size={14} />{" "}
            {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE FACTION"}
          </button>
          <button
            aria-label="Close faction editor"
            className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
            onClick={onCancel}
            title="Close faction editor"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
      </div>
      {assistantOpen ? (
        <AiDraftAssistant
          campaignId={campaignId}
          endpoint="/api/ai/faction"
          entityLabel="faction"
          mode={faction ? "refine" : "create"}
          requestFields={{ name: draft.name, status: draft.status }}
          currentDraft={{
            name: draft.name,
            status: draft.status,
            description: draft.description,
            playerNotes: draft.playerNotesMarkdown,
            gmNotes: draft.gmNotesMarkdown,
            visualPrompt: draft.artSubject,
          }}
          fields={[
            { key: "name", label: "Name", maxLength: 160 },
            { key: "status", label: "Status", maxLength: 80 },
            {
              key: "description",
              label: "Public description",
              maxLength: 4000,
              multiline: true,
            },
            {
              key: "playerNotes",
              label: "Player notes",
              maxLength: 20000,
              multiline: true,
            },
            {
              key: "gmNotes",
              label: "GM notes",
              maxLength: 20000,
              multiline: true,
            },
            {
              key: "visualPrompt",
              label: "Emblem or logo description",
              maxLength: 1600,
              multiline: true,
            },
          ]}
          onApply={(candidate) =>
            setDraft((current) => ({
              ...current,
              name: candidate.name ?? current.name,
              status: candidate.status ?? current.status,
              description: candidate.description ?? current.description,
              playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown,
              gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown,
              artSubject: candidate.visualPrompt ?? current.artSubject,
            }))
          }
        />
      ) : null}
      <form
        className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
        onSubmit={save}
      >
        <div className="character-form-grid grid grid-cols-[1.4fr_1fr_1.2fr_80px] gap-[10px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1">
          <label className="max-[760px]:[grid-column:1/-1] max-[420px]:[grid-column:auto]">
            Name
            <input
              required
              maxLength={160}
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>
          <label>
            Status
            <input
              required
              maxLength={80}
              value={draft.status}
              onChange={(event) => update("status", event.target.value)}
            />
          </label>
        </div>
        <label>
          Public description
          <textarea
            maxLength={4000}
            value={draft.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </label>
        <label>
          Player notes
          <textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => update("playerNotesMarkdown", event.target.value)} />
        </label>
        <label>
          GM notes <span className="inline-flex items-center gap-1 text-[var(--pink)]"><LockKeyhole size={11} /> PRIVATE</span>
          <textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => update("gmNotesMarkdown", event.target.value)} />
        </label>
        <fieldset className="grid gap-[10px] border border-[rgba(98,232,255,.25)] bg-[rgba(98,232,255,.025)] p-[13px]">
          <legend className="px-1 text-[var(--dim)] font-mono text-[8px] tracking-[.12em]">NPC ROSTER</legend>
          {npcs.length ? <div className="grid gap-[7px]">{npcs.map((npc) => {
            const currentFaction = factions.find((candidate) => candidate.id === npc.factionId);
            const isMember = draft.memberNpcIds.includes(npc.id);
            return <label key={npc.id} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] items-start gap-[9px] border border-[var(--line)] bg-[#0a1118] px-[10px] py-[9px] text-[var(--ink)]">
              <input aria-label={`Assign ${npc.name} to this faction`} className="mt-[2px] h-4 w-4 accent-[var(--cyan)]" checked={isMember} disabled={isSaving} onChange={() => toggleMember(npc)} type="checkbox" />
              <span className="min-w-0 [overflow-wrap:anywhere] text-[10px]">{npc.name}<small className="mt-1 block text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">{`${npc.species || "UNCLASSIFIED"} // ${npc.role || "CONTACT"}`}</small></span>
              <small className={`text-right font-mono text-[7px] tracking-[.08em] ${isMember ? "text-[var(--green)]" : currentFaction ? "text-[var(--amber)]" : "text-[var(--dim)]"}`}>{isMember ? "MEMBER" : currentFaction ? `CURRENT // ${currentFaction.name}` : "UNAFFILIATED"}</small>
            </label>;
          })}</div> : <p className="m-0 text-[var(--muted)] text-[10px]">No NPCs are available for this roster yet.</p>}
          <p className="m-0 flex items-center gap-2 text-[var(--dim)] font-mono text-[8px] tracking-[.06em]"><Users size={12} /> {draft.memberNpcIds.length} SELECTED</p>
        </fieldset>
        <label className="place-quick-field">
          Primary place
          <select
            className={editorSelectClassName}
            value={draft.placeId ?? ""}
            onChange={(event) => update("placeId", event.target.value || null)}
          >
            <option value="">NO PRIMARY PLACE</option>
            {flattenPlaceTree(places).map(({ place, depth }) => (
              <option
                key={place.id}
                value={place.id}
              >{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>
            ))}
          </select>
        </label>
        {error ? (
          <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap">
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff]"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "SAVING..." : "SAVE FACTION"}
          </button>
          <button
            className="text-action inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer hover:text-[#a1f3ff] max-[420px]:w-full max-[420px]:justify-start"
            disabled={isSaving}
            onClick={onCancel}
            type="button"
          >
            CANCEL
          </button>
        </div>
      </form>
    </section>
  );
}
