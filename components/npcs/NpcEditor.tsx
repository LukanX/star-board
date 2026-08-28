"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LockKeyhole, Sparkles, X } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import {
  markCampaignArtPersisted,
  useCampaignArtEditor,
} from "@/components/archive/CampaignArtField";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { RelatedFactionSummary } from "@/lib/campaign/detail-types";
import type { ApiNpc, ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree } from "@/lib/places";

type NpcDraft = {
  name: string;
  species: string;
  role: string;
  description: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  placeId: string | null;
  factionId: string | null;
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyNpcDraft: NpcDraft = {
  name: "",
  species: "",
  role: "",
  description: "",
  playerNotesMarkdown: "",
  gmNotesMarkdown: "",
  placeId: null,
  factionId: null,
  artSubject: "",
  artPath: null,
  artUrl: null,
  artPrompt: null,
  artProvider: null,
};

function toDraft(npc?: ApiNpc): NpcDraft {
  return npc
    ? {
        name: npc.name,
        species: npc.species,
        role: npc.role,
        description: npc.description,
        playerNotesMarkdown: npc.player_notes_markdown,
        gmNotesMarkdown: npc.gm_notes_markdown ?? "",
        placeId: npc.place_id,
        factionId: npc.faction_id,
        artSubject: npc.art_subject ?? "",
        artPath: npc.art_path,
        artUrl: npc.art_url ?? null,
        artPrompt: npc.art_prompt,
        artProvider: npc.art_provider ?? null,
      }
    : emptyNpcDraft;
}

export default function NpcEditor({
  campaignId,
  places,
  factions = [],
  npc,
  onSaved,
  onCancel: parentOnCancel,
}: {
  campaignId: string;
  places: ApiPlace[];
  factions?: RelatedFactionSummary[];
  npc?: ApiNpc;
  onSaved?: (npc: ApiNpc) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraftState] = useState<NpcDraft>(() => toDraft(npc));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { setDirty, clearDirty } = useDirtyForm();
  const setDraft = (updater: (current: NpcDraft) => NpcDraft) => {
    setDirty();
    setDraftState(updater);
  };
  const update = (field: keyof NpcDraft, value: string | null) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const onCancel = () => {
    clearDirty();
    parentOnCancel?.();
  };

  useCampaignArtEditor(
    npc || draft
      ? {
          campaignId,
          kind: "npc",
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
        }
      : null,
  );

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const previousFactionId = npc?.faction_id ?? null;
    const nextFactionId = draft.factionId ?? null;
    if (previousFactionId && nextFactionId && previousFactionId !== nextFactionId && !window.confirm("Transfer this NPC to the selected faction?")) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/npcs${npc ? `/${encodeURIComponent(npc.id)}` : ""}`,
        {
          method: npc ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        npc?: ApiNpc;
      };
      if (!response.ok || !result.npc)
        throw new Error(result.error ?? "NPC could not be saved.");
      markCampaignArtPersisted(campaignId, result.npc.art_path);
      clearDirty();
      onSaved?.(result.npc);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "NPC could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
          <p className={eyebrowClassName}>GM CONTACT RECORD</p>
          <h2 className="mt-[6px] text-[19px]">
            {npc ? `Edit ${npc.name}` : "Add an NPC"}
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
            {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE NPC"}
          </button>
          <button
            aria-label="Close NPC editor"
            className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
            onClick={onCancel}
            title="Close NPC editor"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
      </div>
      {assistantOpen ? (
        <AiDraftAssistant
          campaignId={campaignId}
          endpoint="/api/ai/npc"
          entityLabel="NPC"
          mode={npc ? "refine" : "create"}
          requestFields={{
            name: draft.name,
            species: draft.species,
            role: draft.role,
          }}
          currentDraft={{
            name: draft.name,
            species: draft.species,
            role: draft.role,
            shortDescription: draft.description,
            playerNotes: draft.playerNotesMarkdown,
            gmNotes: draft.gmNotesMarkdown,
            visualPrompt: draft.artSubject,
          }}
          fields={[
            { key: "name", label: "Name", maxLength: 160 },
            { key: "species", label: "Species", maxLength: 120 },
            { key: "role", label: "Role", maxLength: 160 },
            {
              key: "shortDescription",
              label: "Description",
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
              label: "Portrait description",
              maxLength: 1600,
              multiline: true,
            },
          ]}
          onApply={(candidate) =>
            setDraft((current) => ({
              ...current,
              name: candidate.name ?? current.name,
              species: candidate.species ?? current.species,
              role: candidate.role ?? current.role,
              description: candidate.shortDescription ?? current.description,
              playerNotesMarkdown:
                candidate.playerNotes ?? current.playerNotesMarkdown,
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
            Species
            <input
              maxLength={120}
              value={draft.species}
              onChange={(event) => update("species", event.target.value)}
            />
          </label>
          <label>
            Role
            <input
              maxLength={160}
              value={draft.role}
              onChange={(event) => update("role", event.target.value)}
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            maxLength={4000}
            value={draft.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </label>
        <label>
          Player notes
          <textarea
            maxLength={20000}
            value={draft.playerNotesMarkdown}
            onChange={(event) =>
              update("playerNotesMarkdown", event.target.value)
            }
          />
        </label>
        <label>
          GM notes{" "}
          <span className="inline-flex items-center gap-1 text-[var(--pink)]">
            <LockKeyhole size={11} /> PRIVATE
          </span>
          <textarea
            maxLength={20000}
            value={draft.gmNotesMarkdown}
            onChange={(event) => update("gmNotesMarkdown", event.target.value)}
          />
        </label>
        <label className="place-quick-field">
          Primary place
          <select className={editorSelectClassName} value={draft.placeId ?? ""} onChange={(event) => update("placeId", event.target.value || null)}>
            <option value="">NO PRIMARY PLACE</option>
            {flattenPlaceTree(places).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}
          </select>
        </label>
        <label>
          Faction
          <select className={editorSelectClassName} value={draft.factionId ?? ""} onChange={(event) => update("factionId", event.target.value || null)}>
            <option value="">NO FACTION</option>
            {factions.map((faction) => <option key={faction.id} value={faction.id}>{`${faction.name} [${faction.status}]`}</option>)}
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
            {isSaving ? "SAVING..." : "SAVE NPC"}
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
