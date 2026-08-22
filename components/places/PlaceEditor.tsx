"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { CirclePlus, LockKeyhole, Sparkles, Trash2, X } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import {
  markCampaignArtPersisted,
  useCampaignArtEditor,
} from "@/components/archive/CampaignArtField";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import type { ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree, isPlaceDescendant } from "@/lib/places";

type PlaceDraft = {
  name: string;
  kind: string;
  description: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  parentPlaceId: string | null;
  artSubject: string | null;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyPlaceDraft: PlaceDraft = {
  name: "",
  kind: "location",
  description: "",
  playerNotesMarkdown: "",
  gmNotesMarkdown: "",
  parentPlaceId: null,
  artSubject: null,
  artPath: null,
  artUrl: null,
  artPrompt: null,
  artProvider: null,
};

function toDraft(
  place: ApiPlace | undefined,
  parentPlaceId: string | null,
): PlaceDraft {
  return place
    ? {
        name: place.name,
        kind: place.kind,
        description: place.description,
        playerNotesMarkdown: place.player_notes_markdown,
        gmNotesMarkdown: place.gm_notes_markdown ?? "",
        parentPlaceId: place.parent_place_id,
        artSubject: place.art_subject,
        artPath: place.art_path,
        artUrl: place.art_url ?? null,
        artPrompt: place.art_prompt,
        artProvider: place.art_provider ?? null,
      }
    : { ...emptyPlaceDraft, parentPlaceId };
}

export default function PlaceEditor({
  campaignId,
  places,
  place,
  parentPlaceId = null,
  onSaved,
  onDeleted,
  onCancel: parentOnCancel,
}: {
  campaignId: string;
  places: ApiPlace[];
  place?: ApiPlace;
  parentPlaceId?: string | null;
  onSaved?: (place: ApiPlace) => void;
  onDeleted?: (placeId: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraftState] = useState<PlaceDraft>(() =>
    toDraft(place, parentPlaceId),
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { setDirty, clearDirty } = useDirtyForm();
  const setDraft = (updater: (current: PlaceDraft) => PlaceDraft) => {
    setDirty();
    setDraftState(updater);
  };
  const update = (field: keyof PlaceDraft, value: string | null) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const onCancel = () => {
    clearDirty();
    parentOnCancel?.();
  };
  const flattenedPlaces = flattenPlaceTree(places);

  useCampaignArtEditor({
    campaignId,
    kind: "place",
    value: draft.artPath,
    trackUnsavedUploads: true,
    url: draft.artUrl,
    subject: draft.artSubject ?? `${draft.kind}: ${draft.name}`,
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
        `/api/campaigns/${encodeURIComponent(campaignId)}/places${place ? `/${encodeURIComponent(place.id)}` : ""}`,
        {
          method: place ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        place?: ApiPlace;
      };
      if (!response.ok || !result.place)
        throw new Error(result.error ?? "Place could not be saved.");

      markCampaignArtPersisted(campaignId, result.place.art_path);
      clearDirty();
      onSaved?.(result.place);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Place could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deletePlace = async () => {
    if (
      !place ||
      isSaving ||
      !window.confirm(
        `Delete ${place.name} from the place archive? Children will become root places.`,
      )
    )
      return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/places/${encodeURIComponent(place.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? "Place could not be deleted.");
      clearDirty();
      onDeleted?.(place.id);
      onCancel?.();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Place could not be deleted.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={`${editorPanelClassName} mb-[18px]`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
          <p className="eyebrow">GM PLACE RECORD</p>
          <h2 className="mt-[6px] text-[19px]">
            {place
              ? `Edit ${place.name}`
              : draft.parentPlaceId
                ? "Add a child place"
                : "Add a root place"}
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
            {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE PLACE"}
          </button>
          <button
            aria-label="Close place editor"
            className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
            onClick={onCancel}
            title="Close place editor"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
      </div>
      {assistantOpen ? (
        <AiDraftAssistant
          campaignId={campaignId}
          endpoint="/api/ai/place"
          entityLabel="place"
          mode={place ? "refine" : "create"}
          requestFields={{
            ...(draft.parentPlaceId
              ? { parentPlaceId: draft.parentPlaceId }
              : {}),
            name: draft.name,
            kind: draft.kind,
          }}
          currentDraft={{
            name: draft.name,
            kind: draft.kind,
            description: draft.description,
            playerNotes: draft.playerNotesMarkdown,
            gmNotes: draft.gmNotesMarkdown,
            visualPrompt: draft.artSubject ?? "",
          }}
          fields={[
            { key: "name", label: "Name", maxLength: 160 },
            { key: "kind", label: "Kind", maxLength: 80 },
            {
              key: "description",
              label: "Description",
              maxLength: 4000,
              multiline: true,
            },
            {
              key: "playerNotes",
              label: "Player notes",
              maxLength: 2400,
              multiline: true,
            },
            {
              key: "gmNotes",
              label: "GM notes",
              maxLength: 2400,
              multiline: true,
            },
            {
              key: "visualPrompt",
              label: "Visual subject",
              maxLength: 1600,
              multiline: true,
            },
          ]}
          onApply={(candidate) =>
            setDraft((current) => ({
              ...current,
              name: candidate.name ?? current.name,
              kind: candidate.kind ?? current.kind,
              description: candidate.description ?? current.description,
              playerNotesMarkdown:
                candidate.playerNotes ?? current.playerNotesMarkdown,
              gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown,
              artSubject: candidate.visualPrompt || current.artSubject,
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
            Kind
            <input
              required
              maxLength={80}
              placeholder="Planet, city, dungeon, room..."
              value={draft.kind}
              onChange={(event) => update("kind", event.target.value)}
            />
          </label>
          <label className="place-parent-field">
            Parent
            <select
              className={editorSelectClassName}
              value={draft.parentPlaceId ?? ""}
              onChange={(event) =>
                update("parentPlaceId", event.target.value || null)
              }
            >
              <option value="">ROOT PLACE</option>
              {flattenedPlaces
                .filter(
                  ({ place: candidate }) =>
                    !place ||
                    (candidate.id !== place.id &&
                      !isPlaceDescendant(places, candidate.id, place.id)),
                )
                .map(({ place: candidate, depth }) => (
                  <option
                    key={candidate.id}
                    value={candidate.id}
                  >{`${"  ".repeat(depth)}${depth ? "|- " : ""}${candidate.name} [${candidate.kind}]`}</option>
                ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            maxLength={4000}
            placeholder="What can the campaign safely reveal about this place?"
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
            <CirclePlus size={15} />{" "}
            {isSaving ? "SAVING..." : place ? "SAVE CHANGES" : "ADD PLACE"}
          </button>
          {place ? (
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[rgba(255,92,154,.42)] bg-[rgba(255,92,154,.08)] !text-[var(--pink)] hover:!border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]"
              disabled={isSaving}
              onClick={() => void deletePlace()}
              type="button"
            >
              <Trash2 size={14} /> REMOVE
            </button>
          ) : null}
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
