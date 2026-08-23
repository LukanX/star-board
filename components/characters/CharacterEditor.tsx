"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName } from "@/components/ui/editorStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { ApiCharacter, CharacterDraft } from "@/lib/campaign/types";

const emptyDraft: CharacterDraft = {
  name: "",
  species: "",
  className: "",
  level: 1,
  backstoryMarkdown: "",
  physicalDescription: "",
  artSubject: "",
  artPath: null,
  artUrl: null,
  artPrompt: null,
  artProvider: null,
};

export default function CharacterEditor({
  campaignId,
  character,
  onSaved,
  onCancel: parentOnCancel,
}: {
  campaignId: string;
  character?: ApiCharacter;
  onSaved?: (character: ApiCharacter) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<CharacterDraft>(
    character
      ? {
          name: character.name,
          species: character.species,
          className: character.class_name,
          level: character.level,
          backstoryMarkdown: character.backstory_markdown,
          physicalDescription: character.physical_description,
          artSubject: character.art_subject ?? "",
          artPath: character.art_path,
          artUrl: character.art_url ?? null,
          artPrompt: character.art_prompt,
          artProvider: character.art_provider ?? null,
        }
      : emptyDraft,
  );
  const [error, setError] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { setDirty, clearDirty } = useDirtyForm();
  const update = (
    field: keyof CharacterDraft,
    value: string | number | null,
  ) => {
    setDirty();
    setDraft((current) => ({ ...current, [field]: value }));
  };
  useCampaignArtEditor({
    campaignId,
    kind: "character",
    value: draft.artPath,
    url: draft.artUrl,
    subject: draft.artSubject,
    currentPrompt: draft.artPrompt,
    onSubjectChange: (value) => update("artSubject", value),
    onChange: (value) => update("artPath", value),
    onUrlChange: (value) => update("artUrl", value),
    onPromptChange: (value) => update("artPrompt", value),
    onProviderChange: (value) => update("artProvider", value),
  });
  const onCancel = () => {
    clearDirty();
    parentOnCancel?.();
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/characters${character ? `/${encodeURIComponent(character.id)}` : ""}`,
        {
          method: character ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        character?: ApiCharacter;
      };
      if (!response.ok || !result.character)
        throw new Error(result.error ?? "Character could not be saved.");
      clearDirty();
      onSaved?.(result.character);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Character could not be saved.",
      );
    }
  };
  return (
    <section className={`${editorPanelClassName} mb-5`} data-editor-panel="true">
      <div className="editor-heading flex items-start justify-between gap-4 mb-[18px]">
        <div>
            <p className={eyebrowClassName}>{character ? "EDIT RECORD" : "NEW RECORD"}</p>
          <h2 className="mt-[6px] text-[19px]">
            {character ? `Edit ${character.name}` : "Add a character"}
          </h2>
        </div>
        <button
          className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
          onClick={onCancel}
          type="button"
        >
          X
        </button>
      </div>
      {assistantOpen ? (
        <AiDraftAssistant
          campaignId={campaignId}
          endpoint="/api/ai/character"
          entityLabel="character portrait"
          mode={character ? "refine" : "create"}
          toolLabel="PLAYER TOOL"
          showModelPicker={false}
          requestFields={{
            name: draft.name,
            species: draft.species,
            className: draft.className,
            level: draft.level,
            backstoryMarkdown: draft.backstoryMarkdown,
            physicalDescription: draft.physicalDescription,
          }}
          currentDraft={{
            name: draft.name,
            species: draft.species,
            className: draft.className,
            backstoryMarkdown: draft.backstoryMarkdown,
            physicalDescription: draft.physicalDescription,
            visualPrompt: draft.artSubject,
          }}
          fields={[
            {
              key: "visualPrompt",
              label: "Image generation prompt",
              maxLength: 1600,
              multiline: true,
            },
          ]}
          onApply={(candidate) =>
            update("artSubject", candidate.visualPrompt ?? draft.artSubject)
          }
        />
      ) : null}
      <button
        className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
        onClick={() => setAssistantOpen((value) => !value)}
        type="button"
      >
        {assistantOpen ? "CLOSE PORTRAIT TOOL" : "GENERATE PORTRAIT PROMPT"}
      </button>
      <form
        className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_input:focus]:border-[var(--cyan)] [&_input:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_input::placeholder]:text-[#4d5a6b] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55] [&_textarea:focus]:border-[var(--cyan)] [&_textarea:focus]:shadow-[0_0_0_2px_rgba(98,232,255,.1)] [&_textarea::placeholder]:text-[#4d5a6b]"
        onSubmit={save}
      >
        <div className="character-form-grid grid grid-cols-[1.4fr_1fr_1.2fr_80px] gap-[10px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1">
          <label className="max-[760px]:[grid-column:1/-1] max-[420px]:[grid-column:auto]">
            Name
            <input
              required
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </label>
          <label>
            Species
            <input
              value={draft.species}
              onChange={(event) => update("species", event.target.value)}
            />
          </label>
          <label>
            Class
            <input
              value={draft.className}
              onChange={(event) => update("className", event.target.value)}
            />
          </label>
          <label>
            Level
            <input
              type="number"
              min="1"
              max="20"
              value={draft.level}
              onChange={(event) => update("level", Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          Backstory
          <textarea
            value={draft.backstoryMarkdown}
            onChange={(event) =>
              update("backstoryMarkdown", event.target.value)
            }
          />
        </label>
        <label>
          Physical appearance
          <textarea
            value={draft.physicalDescription}
            onChange={(event) =>
              update("physicalDescription", event.target.value)
            }
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
            type="submit"
          >
            SAVE CHARACTER
          </button>
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
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
