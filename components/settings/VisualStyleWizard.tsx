"use client";

import { useRef, useState } from "react";
import { ArrowLeft, FileImage, LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import AiModelPicker from "@/components/archive/AiModelPicker";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import VisualStylePreview, { type VisualStylePreviewRecord } from "@/components/settings/VisualStylePreview";
import { panelClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { ImageDraft } from "@/lib/ai/image-job-polling";
import { visualStyleDirections, type VisualStyleDirection, type VisualStyleWizardInput } from "@/lib/validation/visual-style";

export type EditableVisualStyle = {
  id: string;
  name: string;
  visualStyle: string;
  status: "draft" | "ready";
  wizardInputs: VisualStyleWizardInput;
  revision: number;
  preview: VisualStylePreviewRecord["preview"];
};

type VisualStyleWizardProps = {
  campaignId: string;
  style?: EditableVisualStyle | null;
  onSaved: (styleId: string) => void;
  onCancel: () => void;
};

type DraftResponse = {
  draft?: { name: string; visualStyle: string; rationale: string };
  model?: string;
  error?: string;
};

const directionLabels: Record<VisualStyleDirection, string> = {
  "choose-for-me": "CHOOSE FOR ME",
  "inked-illustration": "INKED ILLUSTRATION",
  painterly: "PAINTERLY",
  "cinematic-realism": "CINEMATIC REALISM",
  "graphic-design": "GRAPHIC DESIGN",
};

const controlClassName = "w-full min-w-0 border border-[rgba(139,151,169,.28)] outline-none px-[10px] py-[9px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)]";
const labelClassName = "grid gap-[6px] min-w-0 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]";
const secondaryButtonClassName = "h-[35px] inline-flex items-center justify-center gap-2 px-[12px] border border-[var(--line)] bg-[rgba(255,255,255,.035)] text-[var(--muted)] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName = "h-[35px] inline-flex items-center justify-center gap-2 px-[12px] border border-[var(--cyan)] bg-[var(--cyan)] text-[#061017] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:bg-[#8ceeff] disabled:cursor-not-allowed disabled:opacity-50";

export default function VisualStyleWizard({ campaignId, style, onSaved, onCancel }: VisualStyleWizardProps) {
  const [step, setStep] = useState(style ? 2 : 1);
  const [campaignVibe, setCampaignVibe] = useState(style?.wizardInputs.campaignVibe ?? "");
  const [artDirection, setArtDirection] = useState<VisualStyleDirection>(style?.wizardInputs.artDirection ?? "choose-for-me");
  const [directionNotes, setDirectionNotes] = useState(style?.wizardInputs.directionNotes ?? "");
  const [name, setName] = useState(style?.name ?? "");
  const [visualStyle, setVisualStyle] = useState(style?.visualStyle ?? "");
  const [rationale, setRationale] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [references, setReferences] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<ImageDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const retainGeneratedPreviewRef = useRef<(() => void) | null>(null);
  const { setDirty, clearDirty } = useDirtyForm();

  const markChanged = () => {
    setDirty();
    setSavedNotice(null);
    setError(null);
  };

  const handlePreviewDraftChange = (nextDraft: ImageDraft | null, markRetained: () => void) => {
    setPreviewDraft(nextDraft);
    retainGeneratedPreviewRef.current = nextDraft ? markRetained : null;
  };

  const generateDraft = async () => {
    setIsGenerating(true);
    setError(null);
    setSavedNotice(null);

    try {
      const formData = new FormData();
      formData.set("campaignId", campaignId);
      formData.set("campaignVibe", campaignVibe.trim());
      formData.set("artDirection", artDirection);
      formData.set("directionNotes", directionNotes.trim());
      if (selectedModel) formData.set("model", selectedModel);
      references.forEach((file) => formData.append("referenceImages", file));

      const response = await fetch("/api/ai/visual-style", { method: "POST", body: formData });
      const result = (await response.json()) as DraftResponse;
      if (!response.ok || !result.draft) throw new Error(result.error ?? "The visual style draft could not be generated.");

      setName(result.draft.name);
      setVisualStyle(result.draft.visualStyle);
      setRationale(result.draft.rationale);
      setStep(2);
      setDirty();
    } catch (generationError: unknown) {
      setError(generationError instanceof Error ? generationError.message : "The visual style draft could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  };

  const save = async (status: "draft" | "ready", apply: boolean) => {
    if (!name.trim() || !visualStyle.trim()) {
      setError("Add a style name and visual language before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSavedNotice(null);
    const wizardInputs = { campaignVibe: campaignVibe.trim() || undefined, artDirection, directionNotes: directionNotes.trim() || undefined };
    const preview = previewDraft ? { generationRunId: previewDraft.generationRunId, prompt: previewDraft.prompt } : undefined;

    try {
      const endpoint = style
        ? `/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles/${encodeURIComponent(style.id)}`
        : `/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles`;
      const response = await fetch(endpoint, {
        method: style ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(style
          ? { name: name.trim(), visualStyle: visualStyle.trim(), status, wizardInputs, expectedRevision: style.revision, apply, preview }
          : { name: name.trim(), visualStyle: visualStyle.trim(), status, wizardInputs, apply, preview }),
      });
      const result = (await response.json()) as { styleId?: string; error?: string };
      if (!response.ok || !result.styleId) throw new Error(result.error ?? "The visual style could not be saved.");

      if (preview) retainGeneratedPreviewRef.current?.();
      clearDirty();
      setSavedNotice(apply ? "SAVED AND APPLIED AS CAMPAIGN DEFAULT." : status === "ready" ? "READY STYLE SAVED." : "DRAFT STYLE SAVED.");
      onSaved(result.styleId);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "The visual style could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const pickReferences = (files: FileList | null) => {
    const nextFiles = Array.from(files ?? []).slice(0, 3);
    setReferences(nextFiles);
    markChanged();
  };

  return (
    <section className={`${panelClassName} w-full min-w-0`} data-visual-style-wizard>
      <div className="panel-topline flex items-start justify-between gap-4 px-[21px] pb-3 pt-5">
        <div>
          <p className={`${eyebrowClassName} !mb-2`}>GM TOOL // VISUAL STYLE BUILDER</p>
          <h2>{style ? "Edit visual style" : "Create a visual style"}</h2>
        </div>
        <WandSparkles size={17} className="text-[var(--pink)]" />
      </div>
      <div className="grid gap-[6px] border-b border-[var(--line)] px-[21px] pb-4">
        <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.5]">Answer two small questions, then tune the reusable style text before saving it.</p>
        <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">STEP {step} OF 2 // REFERENCES ARE ANALYZED FOR THIS DRAFT ONLY.</span>
      </div>

      {step === 1 ? (
        <div className="grid gap-4 p-[18px_21px_21px]">
          <label className={labelClassName}>
            GENERAL CAMPAIGN VIBE <span className="text-[var(--dim)] tracking-normal">OPTIONAL</span>
            <textarea className={`${controlClassName} min-h-[82px] resize-y leading-[1.5]`} maxLength={600} placeholder="Hopeful frontier, haunted empire, pulpy expedition..." value={campaignVibe} onChange={(event) => { setCampaignVibe(event.target.value); markChanged(); }} />
          </label>
          <fieldset className="grid gap-2 m-0 min-w-0 border-0 p-0">
            <legend className="mb-[2px] text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">ART DIRECTION</legend>
            <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">
              {visualStyleDirections.map((direction) => (
                <label key={direction} className={`flex items-center gap-2 min-h-[37px] px-[10px] border cursor-pointer font-mono text-[8px] tracking-[.06em] ${artDirection === direction ? "border-[var(--pink)] bg-[rgba(255,92,154,.08)] text-[var(--pink)]" : "border-[rgba(139,151,169,.28)] bg-[rgba(255,255,255,.02)] text-[var(--muted)]"}`}>
                  <input className="accent-[var(--pink)]" type="radio" name="visual-style-direction" value={direction} checked={artDirection === direction} onChange={() => { setArtDirection(direction); markChanged(); }} />
                  {directionLabels[direction]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={labelClassName}>
            EXTRA ART NOTES <span className="text-[var(--dim)] tracking-normal">OPTIONAL</span>
            <textarea className={`${controlClassName} min-h-[70px] resize-y leading-[1.5]`} maxLength={600} placeholder="Materials, colors, things to avoid..." value={directionNotes} onChange={(event) => { setDirectionNotes(event.target.value); markChanged(); }} />
          </label>
          <div className="grid gap-2 border-t border-[var(--line)] pt-4">
            <label className={labelClassName}>
              EXAMPLE STYLE IMAGES <span className="text-[var(--dim)] tracking-normal">OPTIONAL // UP TO 3</span>
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => pickReferences(event.target.files)} />
              <button className={`${secondaryButtonClassName} justify-start`} type="button" onClick={() => fileInputRef.current?.click()}>
                <FileImage size={14} /> {references.length ? `${references.length} IMAGE${references.length === 1 ? "" : "S"} SELECTED` : "CHOOSE EXAMPLES"}
              </button>
            </label>
            {references.length ? <p className="m-0 text-[var(--dim)] font-mono text-[8px] leading-[1.5]">{references.map((file) => file.name).join(" // ")}</p> : null}
          </div>
          <div className="grid gap-3 border-t border-[var(--line)] pt-4">
            <AiModelPicker campaignId={campaignId} capability="structured-text" requiresImageInput={references.length > 0} value={selectedModel} onChange={setSelectedModel} />
            <div className="flex flex-wrap justify-between gap-2">
              <button className={secondaryButtonClassName} type="button" onClick={() => { setName(""); setVisualStyle(""); setRationale(""); setStep(2); setError(null); }}>START BLANK DRAFT</button>
              <button className={primaryButtonClassName} type="button" disabled={isGenerating} onClick={() => void generateDraft()}>
                {isGenerating ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={14} />} {isGenerating ? "DRAFTING..." : "DRAFT VISUAL STYLE"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-[18px_21px_21px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className={secondaryButtonClassName} type="button" onClick={() => setStep(1)}><ArrowLeft size={14} /> ADJUST QUESTIONS</button>
            {rationale ? <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">AI NOTE: {rationale}</span> : null}
          </div>
          <label className={labelClassName}>
            STYLE NAME
            <input className={controlClassName} maxLength={80} value={name} onChange={(event) => { setName(event.target.value); markChanged(); }} placeholder="A memorable library name" />
          </label>
          <label className={labelClassName}>
            REUSABLE VISUAL LANGUAGE <span className="text-[var(--dim)] tracking-normal">{visualStyle.length}/1200</span>
            <textarea className={`${controlClassName} min-h-[180px] resize-y leading-[1.5]`} maxLength={1200} value={visualStyle} onChange={(event) => { setVisualStyle(event.target.value); markChanged(); }} placeholder="Palette, light, materials, line treatment, texture, and composition rules..." />
          </label>
          {visualStyle.trim() ? <VisualStylePreview campaignId={campaignId} style={style ?? undefined} visualStyleOverride={visualStyle} canRetain={false} onDraftChange={handlePreviewDraftChange} /> : null}
          {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
          {savedNotice ? <p className="m-0 text-[var(--green)] font-mono text-[8px] tracking-[.08em]" role="status">{savedNotice}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-4">
            <button className={secondaryButtonClassName} type="button" disabled={isSaving} onClick={() => { clearDirty(); onCancel(); }}>CANCEL</button>
            <div className="flex flex-wrap gap-2">
              <button className={secondaryButtonClassName} type="button" disabled={isSaving} onClick={() => void save("draft", false)}>{isSaving ? <LoaderCircle className="animate-spin" size={13} /> : null} SAVE DRAFT</button>
              <button className={secondaryButtonClassName} type="button" disabled={isSaving} onClick={() => void save("ready", false)}>SAVE READY</button>
              <button className={primaryButtonClassName} type="button" disabled={isSaving} onClick={() => void save("ready", true)}><Sparkles size={13} /> SAVE & APPLY</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
