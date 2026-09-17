"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import { markCampaignArtPersisted, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isArtBusy, setIsArtBusy] = useState(false);
  const { setDirty, clearDirty, confirmNavigation } = useDirtyForm();
  const canGeneratePortrait = Boolean(character?.id && character.can_generate_portrait);
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
    characterId: character?.id,
    portraitAiRole: character?.portrait_ai_role ?? undefined,
    visible: !assistantOpen,
    showGenerator: canGeneratePortrait,
    value: draft.artPath,
    trackUnsavedUploads: true,
    url: draft.artUrl,
    onBusyChange: setIsArtBusy,
    subject: draft.artSubject,
    currentPrompt: draft.artPrompt,
    onSubjectChange: (value) => update("artSubject", value),
    onChange: (value) => update("artPath", value),
    onUrlChange: (value) => update("artUrl", value),
    onPromptChange: (value) => update("artPrompt", value),
    onProviderChange: (value) => update("artProvider", value),
  });
  const onCancel = () => {
    if (!confirmNavigation()) return;
    clearDirty();
    parentOnCancel?.();
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving || isArtBusy) return;
    if (!confirmNavigation("Save this character and discard the unapplied AI description?", "ai")) return;
    setIsSaving(true);
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
      markCampaignArtPersisted(campaignId, result.character.art_path);
      clearDirty();
      onSaved?.(result.character);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Character could not be saved.",
      );
    } finally {
      setIsSaving(false);
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
        <div className="flex items-center gap-2">
          {canGeneratePortrait ? (
            <button
              className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
              disabled={isSaving || isArtBusy}
              onClick={() => setAssistantOpen((current) => !current)}
              type="button"
            >
              <Sparkles size={14} /> {assistantOpen ? "BACK TO EDITOR" : "OPEN AI WORKSPACE"}
            </button>
          ) : null}
          <button
            className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]"
            disabled={isSaving || isArtBusy}
            onClick={onCancel}
            type="button"
          >
            X
          </button>
        </div>
      </div>
      {canGeneratePortrait ? (
        <AiDraftAssistant
          descriptionOnly
          open={assistantOpen}
          onBack={() => setAssistantOpen(false)}
          onDirtyChange={(dirty) => (dirty ? setDirty("ai") : clearDirty("ai"))}
          campaignId={campaignId}
          endpoint="/api/ai/character"
          entityLabel="CHARACTER"
          mode={draft.artSubject.trim() ? "refine" : "create"}
          requestFields={{ characterId: character?.id }}
          identityKey={character?.id ?? "new"}
          currentDraft={{ visualPrompt: draft.artSubject }}
          fields={[{ key: "visualPrompt", label: "Image description", maxLength: 1200, multiline: true }]}
          showModelPicker={character?.portrait_ai_role === "gm"}
          toolLabel={character?.portrait_ai_role === "player" ? "PLAYER TOOL" : "GM TOOL"}
          onApply={(candidate) => update("artSubject", candidate.visualPrompt ?? "")}
        />
      ) : null}
      <form
        hidden={assistantOpen}
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
            disabled={isSaving || isArtBusy}
            type="submit"
          >
            SAVE CHARACTER
          </button>
          <button
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
            disabled={isSaving || isArtBusy}
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
