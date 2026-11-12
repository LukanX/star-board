"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { ImageIcon, MapIcon, Wand2, X } from "lucide-react";
import AiModelPicker, { type AiModelOptions } from "@/components/archive/AiModelPicker";
import ImageResolutionPicker from "@/components/archive/ImageResolutionPicker";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import VisualAsset from "@/components/ui/VisualAsset";
import SubjectPicker from "./SubjectPicker";
import StudioPromptPanel, { type StudioPreview } from "./StudioPromptPanel";
import StudioDraftReview from "./StudioDraftReview";
import ArtEditPanel from "@/components/ui/ArtEditPanel";
import { studioBadge, studioButton, studioGhostButton, studioInput, studioKindIcons, studioKindLabels, studioKindTones, studioLabel, studioMicro, studioPanel, studioToggle } from "./studioStyles";
import { deleteStudioCheckpoint, forgetStoredStudioRecovery, freshStudioInputs, readStudioCheckpoint, readStudioRecovery, saveStudioCheckpoint, studioJobSchema, studioStorageEpoch, writeStudioRecovery, type StudioCheckpoint, type StudioForm, type StudioInputs, type StudioJob, type StudioRecovery } from "./studioSession";
import type { StudioComposition } from "@/lib/validation/studio";
import StudioDirection from "./StudioDirection";
import { addStudioSubject, subjectKindBySection, studioSubjectKey } from "./studioSubjects";
import { generationBlocker } from "./generationBlocker";
import type { CampaignEntitySearchResult } from "@/lib/campaign/entity-search";
import { imageDraftSchema } from "@/lib/validation/image";
import { getSupportedImageAspectRatios, getSupportedImageResolutions, type ImageAspectRatio, type ImageResolution } from "@/lib/ai/image-options";
import { waitForImageBackgroundJob, type ImageBackgroundJob, type ImageDraft } from "@/lib/ai/image-job-polling";
import type { StudioSubjectOption } from "@/lib/ai/studio-context";
import type { StudioAsset } from "@/lib/campaign/studio-server";

type Subject = StudioComposition["subjects"][number];
export type StudioComposerHandle = {
  leave: () => Promise<boolean>;
  reuse: (asset: StudioAsset) => Promise<boolean>;
  editSaved: (asset: StudioAsset) => Promise<boolean>;
};
const subjectKey = studioSubjectKey;
const subjectElementId = (key: string) => `studio-subject-${key.replace(":", "-")}`;
const unknownImageOutcomeMessage = "The image request ended without a confirmed result and may have been billed. Check OpenRouter usage before retrying.";
class StudioRequestError extends Error {
  constructor(message: string, readonly referenceSubject?: string) { super(message); }
}

async function jsonRequest(url: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json() as { error?: string; allowance?: number; draft?: ImageDraft | { prompt: string }; job?: ImageBackgroundJob; outcomeUnknown?: boolean; referenceSubject?: string };
  if (!response.ok) {
    const error = new StudioRequestError(result.error ?? "The Studio request failed.", result.referenceSubject);
    if (result.outcomeUnknown) error.name = "ImageJobOutcomeUnknownError";
    throw error;
  }
  return result;
}

export default function StudioComposer({ campaignId, userId, onSaved, ref }: {
  campaignId: string; userId: string; onSaved: () => void; ref?: Ref<StudioComposerHandle>;
}) {
  const [form, setFormState] = useState<StudioForm>(() => freshStudioInputs().form);
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  const [model, setModel] = useState<string | null>(null);
  const [textModel, setTextModel] = useState<string | null>(null);
  const [options, setOptions] = useState<AiModelOptions | null>(null);
  const [textOptions, setTextOptions] = useState<AiModelOptions | null>(null);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(() => freshStudioInputs().aspectRatio);
  const [selectedResolution, setSelectedResolution] = useState<ImageResolution>();
  const supportedResolutions = getSupportedImageResolutions(options?.supportedParameters, options?.parameterValues);
  const resolution = supportedResolutions.find((value) => value === selectedResolution) ?? supportedResolutions[0];
  const [checkpoint, setCheckpoint] = useState<StudioCheckpoint | null>(null);
  const [recovery, setRecovery] = useState<StudioRecovery>({ jobs: [], outcomeUnknown: false });
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [drafts, setDrafts] = useState<ImageDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"compose" | "review">("compose");
  const [styles, setStyles] = useState<{ id: string; name: string; status: string }[]>([]);
  const [feedback, setFeedback] = useState("");
  const [candidate, setCandidate] = useState<{ prompt: string; allowance: number; signature: string } | null>(null);
  const [preview, setPreview] = useState<{ data: StudioPreview; signature: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [session, setSession] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [referenceBlocker, setReferenceBlocker] = useState<{ key: string; message: string } | null>(null);
  const [editing, setEditing] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const focused = useRef<{ id: string } | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [redoOf, setRedoOf] = useState<string | null>(null);
  const [redoDirectionEditing, setRedoDirectionEditing] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [savedEdit, setSavedEdit] = useState<StudioAsset | null>(null);
  const epoch = useRef(0);
  const storageSession = useRef(studioStorageEpoch());
  const mounted = useRef(false);
  const controller = useRef(new AbortController());
  const busyRef = useRef<string | null>(null);
  const recoveryRef = useRef<StudioRecovery>({ jobs: [], outcomeUnknown: false });
  const recoveryLoaded = useRef(false);
  const transition = useRef<Promise<boolean> | null>(null);
  const leaveRef = useRef<() => Promise<boolean>>(async () => false);
  const dirtyForm = useDirtyForm();
  const { registerLeaveGuard } = dirtyForm;
  const dirtyFormRef = useRef(dirtyForm);
  const identity = useMemo(() => ({ campaignId, userId }), [campaignId, userId]);
  const inputs: StudioInputs = { form, model, textModel, aspectRatio, ...(resolution ? { resolution } : {}) };
  const dirty = (edited && JSON.stringify(inputs) !== JSON.stringify(checkpoint?.inputs)) || !!feedback.trim() || !!candidate || drafts.length > 0 || jobs.length > 0 || !!busy;
  const hasReferences = form.composition.subjects.some((subject) => subject.useImage);
  const ratios = getSupportedImageAspectRatios(options?.supportedParameters, options?.parameterValues);
  const visualStyleId = form.composition.useCampaignStyle && form.styleId ? form.styleId : undefined;
  const previewBody = useMemo(() => ({
    campaignId, purpose: "studio-art", targetKind: form.kind, mode: "create", subject: form.direction,
    studio: form.composition, visualStyleId,
  }), [campaignId, form.kind, form.direction, form.composition, visualStyleId]);
  const promptSignature = useMemo(() => JSON.stringify(previewBody), [previewBody]);
  const candidateSignature = JSON.stringify({ kind: form.kind, direction: form.direction, composition: form.composition, visualStyleId });
  const defaults = preview?.data.defaults;
  const previewCurrent = !!preview && preview.signature === promptSignature;
  const selected = drafts.find((draft) => draft.generationRunId === selectedId) ?? null;
  const redoDraft = redoOf ? drafts.find((draft) => draft.generationRunId === redoOf) ?? null : null;
  const subjectSelection = form.composition.subjects.map(subjectKey).join("|");

  const loadStorage = useCallback(() => {
    try {
      if (recoveryLoaded.current) writeStudioRecovery(identity, recoveryRef.current, sessionStorage);
      else {
        const previous = readStudioRecovery(identity, sessionStorage);
        recoveryRef.current = previous; setRecovery(previous); recoveryLoaded.current = true;
      }
      setCheckpoint(readStudioCheckpoint(identity, sessionStorage));
      setStorageError(null); setReady(true);
    } catch (failure) {
      setStorageError(failure instanceof Error ? `Studio browser storage could not be read: ${failure.message}` : "Studio browser storage could not be read.");
      setReady(false);
    }
  }, [identity]);
  const invalidateSession = useCallback(() => {
    epoch.current++; controller.current.abort();
  }, []);
  useEffect(() => {
    mounted.current = true;
    controller.current = new AbortController();
    // Tab-local storage is unavailable during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStorage();
    return () => {
      mounted.current = false; invalidateSession();
      dirtyFormRef.current.clearDirty("campaign-studio");
    };
  }, [loadStorage, invalidateSession]);
  useEffect(() => { dirtyFormRef.current = dirtyForm; });
  useEffect(() => {
    if (dirty) dirtyForm.setDirty("campaign-studio");
    else dirtyForm.clearDirty("campaign-studio");
  }, [dirty, dirtyForm]);
  useEffect(() => {
    if (!focusTarget || focused.current === focusTarget || view !== "compose") return;
    const element = document.getElementById(focusTarget.id);
    if (element) {
      element.scrollIntoView({ block: "center", behavior: "smooth" }); element.focus(); focused.current = focusTarget;
    }
  }, [focusTarget, view]);
  useEffect(() => {
    const active = new AbortController();
    void fetch(`/api/campaigns/${campaignId}/visual-styles`, { signal: active.signal, cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { styles?: { id: string; name: string; status: string }[]; error?: string };
      if (!response.ok || !result.styles) throw new Error(result.error ?? "Visual styles could not be loaded.");
      if (!active.signal.aborted) setStyles(result.styles.filter((style) => style.status === "ready"));
    }).catch((failure: unknown) => { if (!active.signal.aborted) setError(failure instanceof Error ? failure.message : "Visual styles could not be loaded."); });
    return () => active.abort();
  }, [campaignId]);
  useEffect(() => {
    if (!subjectSelection) return;
    const active = new AbortController();
    const requestedEpoch = epoch.current;
    const sections: Record<string, string> = { character: "characters", npc: "npcs", enemy: "enemies", place: "places" };
    void Promise.all(subjectSelection.split("|").map(async (key) => {
      const [kind, id] = key.split(":");
      if (!sections[kind] || !id) throw new Error("A selected subject reference is invalid.");
      const query = new URLSearchParams({ section: sections[kind], id });
      const response = await fetch(`/api/campaigns/${campaignId}/entities/preview?${query}`, { cache: "no-store", signal: active.signal });
      const result = await response.json() as { entity?: { id: string; name: string; imageUrl: string | null }; error?: string };
      if (!response.ok || !result.entity || result.entity.id !== id) throw new Error(result.error ?? "A selected subject could not be loaded. Remove it or retry the composition.");
      return { key, ...result.entity };
    })).then((subjects) => {
      if (active.signal.aborted || epoch.current !== requestedEpoch) return;
      setResolvedNames(Object.fromEntries(subjects.map((subject) => [subject.key, subject.name])));
      setThumbs(Object.fromEntries(subjects.map((subject) => [subject.key, subject.imageUrl])));
      setSubjectError(null);
    }).catch((failure: unknown) => {
      if (!active.signal.aborted && epoch.current === requestedEpoch) setSubjectError(failure instanceof Error ? failure.message : "Selected subjects could not be loaded.");
    });
    return () => active.abort();
  }, [campaignId, subjectSelection, session]);
  useEffect(() => {
    if (!ready) return;
    const active = new AbortController();
    const requestedEpoch = epoch.current;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      void fetch(`/api/campaigns/${campaignId}/studio/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: promptSignature, signal: active.signal, cache: "no-store" })
        .then(async (response) => {
          const result = await response.json() as Partial<StudioPreview> & { error?: string; referenceSubject?: string };
          if (active.signal.aborted || epoch.current !== requestedEpoch) return;
          if ((response.ok || response.status === 422) && typeof result.prompt === "string" && Array.isArray(result.sections)) {
            setPreview({ data: result as StudioPreview, signature: promptSignature });
            setPreviewError(response.status === 422 ? result.error ?? "The prompt is over budget." : null);
          } else {
            setPreviewError(result.error ?? "The prompt preview could not be built.");
            if (result.referenceSubject) { setReferenceBlocker({ key: result.referenceSubject, message: result.error ?? "A selected reference is unavailable." }); setEditing((current) => [...new Set([...current, result.referenceSubject!])]); }
          }
        })
        .catch((failure: unknown) => { if (!active.signal.aborted && epoch.current === requestedEpoch) setPreviewError(failure instanceof Error ? failure.message : "The prompt preview could not be built."); })
        .finally(() => { if (!active.signal.aborted && epoch.current === requestedEpoch) setPreviewLoading(false); });
    }, 450);
    return () => { clearTimeout(timer); active.abort(); };
  }, [ready, campaignId, promptSignature, previewNonce, session]);

  function setForm(next: StudioForm) { setFormState(next); setEdited(true); setPreviewError(null); }
  function changeComposition(composition: StudioComposition) { setForm({ ...form, composition }); }
  function updateSubject(key: string, patch: Partial<Subject>) {
    if (referenceBlocker?.key === key && patch.useImage === false) setReferenceBlocker(null);
    changeComposition({ ...form.composition, subjects: form.composition.subjects.map((subject) => subjectKey(subject) === key ? { ...subject, ...patch } : subject) });
  }
  function addSubject(subject: StudioSubjectOption, direction = form.direction) {
    setError(null);
    const checked = addStudioSubject(form.composition, subject, form.kind);
    if ("error" in checked) { setError(checked.error); return false; }
    setForm({ ...form, direction, composition: checked.composition, names: { ...form.names, [subjectKey(subject)]: subject.name } });
    setThumbs((current) => ({ ...current, [subjectKey(subject)]: subject.thumbnailUrl ?? null }));
    return true;
  }
  async function addMention(item: CampaignEntitySearchResult, direction: string, signal: AbortSignal) {
    const kind = subjectKindBySection[item.type];
    if (!kind) throw new Error("This record cannot be a visual subject.");
    const requestedEpoch = epoch.current;
    const original = form;
    const query = new URLSearchParams({ kind, id: item.id });
    const response = await fetch(`/api/campaigns/${campaignId}/studio/subjects?${query}`, { cache: "no-store", signal });
    const result = await response.json() as { subjects?: StudioSubjectOption[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "The selected subject could not be loaded.");
    const subject = result.subjects?.find((value) => value.id === item.id && value.kind === kind);
    if (!subject || typeof subject.hasReferenceImage !== "boolean") throw new Error("The selected subject is no longer available.");
    if (signal.aborted || epoch.current !== requestedEpoch || !mounted.current) return false;
    if (formRef.current !== original) throw new Error("The composition changed while selecting. Choose the subject again.");
    return addSubject(subject, direction);
  }
  function editSection(sectionId: string) {
    setView("compose");
    if (sectionId === "direction") setFocusTarget({ id: "studio-direction" });
    else if (sectionId === "style") { setAdvancedOpen(true); setFocusTarget({ id: "studio-style-text" }); }
    else if (sectionId.startsWith("subject:")) {
      const key = sectionId.slice("subject:".length);
      setEditing((current) => current.includes(key) ? current : [...current, key]); setFocusTarget({ id: subjectElementId(key) });
    }
  }
  function commitRecovery(next: StudioRecovery): boolean {
    if (storageSession.current !== studioStorageEpoch()) return false;
    recoveryRef.current = next;
    if (mounted.current) setRecovery(next);
    try { writeStudioRecovery(identity, next, sessionStorage); return true; }
    catch (failure) {
      if (mounted.current) {
        setReady(false);
        setStorageError(failure instanceof Error ? `Image-job recovery metadata could not be saved: ${failure.message}. Keep this tab open and retry browser storage or save completed artwork.` : "Image-job recovery metadata could not be saved. Keep this tab open and retry browser storage or save completed artwork.");
      }
      return false;
    }
  }
  function rememberJob(job: StudioJob) {
    return commitRecovery({ ...recoveryRef.current, jobs: [...new Map([...recoveryRef.current.jobs, job].map((value) => [value.generationRunId, value])).values()] });
  }
  function removeJob(id: string) {
    setJobs((current) => current.filter((job) => job.generationRunId !== id));
    setDrafts((current) => current.filter((draft) => draft.generationRunId !== id));
    setSelectedId((current) => current === id ? null : current);
    commitRecovery({ ...recoveryRef.current, jobs: recoveryRef.current.jobs.filter((job) => job.generationRunId !== id) });
  }
  async function deleteDraft(id: string) {
    const response = await fetch(`/api/campaigns/${campaignId}/studio/drafts/${id}`, { method: "DELETE", signal: AbortSignal.timeout(30_000) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The draft could not be discarded. Your composition has been kept; retry cleanup.");
    removeJob(id);
  }
  function resetSession(kind: StudioForm["kind"], next = freshStudioInputs(kind)) {
    invalidateSession(); controller.current = new AbortController();
    busyRef.current = null;
    setSession((current) => current + 1);
    setFormState(next.form); setModel(next.model); setTextModel(next.textModel); setAspectRatio(next.aspectRatio);
    setSelectedResolution(next.resolution);
    setOptions(null); setTextOptions(null); setEdited(false); setJobs([]); setDrafts([]); setSelectedId(null);
    setView("compose"); setFeedback(""); setCandidate(null); setPreview(null); setPreviewLoading(false); setPreviewError(null);
    setThumbs({}); setResolvedNames({}); setSubjectError(null); setReferenceBlocker(null); setEditing([]); setPickerOpen(false); setAdvancedOpen(false); setFocusTarget(null); setTitle(""); setCaption(""); setBusy(null); setError(null); setGenerationError(null); setRedoOf(null); setRedoDirectionEditing(false); setEditInstruction(""); setSavedEdit(null);
  }
  function replaceSession(kind: StudioForm["kind"], next?: StudioInputs): Promise<boolean> {
    if (transition.current) return transition.current;
    const performTransition = async () => {
      if (busyRef.current && !["Generating image...", "Editing image...", "Recovering image jobs...", "Rewriting direction..."].includes(busyRef.current)) {
        setError("Wait for the current save or cleanup to finish before leaving."); return false;
      }
      if (dirty && !window.confirm(`Discard unsaved composition changes and temporary review images?${jobs.length || busyRef.current === "Generating image..." || busyRef.current === "Editing image..." || busyRef.current === "Recovering image jobs..." ? " Submitted image requests may continue and may be billed. Known jobs remain available for explicit recovery; leaving does not cancel provider work." : ""}`)) return false;
      try {
        invalidateSession();
        busyRef.current = "Discarding temporary drafts..."; setBusy(busyRef.current);
        for (const draft of drafts) await deleteDraft(draft.generationRunId);
        resetSession(kind, next);
        return true;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Draft cleanup failed. Your composition has been kept; retry cleanup.");
        controller.current = new AbortController(); setPreviewLoading(false); setPreviewNonce((current) => current + 1);
        busyRef.current = null; setBusy(null); return false;
      }
    };
    transition.current = performTransition().finally(() => { transition.current = null; });
    return transition.current;
  }
  async function perform(label: string, action: (requestedEpoch: number, signal: AbortSignal) => Promise<void>, errorPlacement: "top" | "generation" = "top") {
    if (busyRef.current) return;
    const requestedEpoch = epoch.current;
    const signal = controller.current.signal;
    busyRef.current = label; setBusy(label); setError(null); setGenerationError(null);
    try { await action(requestedEpoch, signal); }
    catch (failure) {
      if (mounted.current && epoch.current === requestedEpoch && failure instanceof StudioRequestError && failure.referenceSubject) {
        const key = failure.referenceSubject;
        setReferenceBlocker({ key, message: failure.message });
        setEditing((current) => [...new Set([...current, key])]);
      }
      if (failure instanceof Error && failure.name === "ImageJobOutcomeUnknownError") {
        commitRecovery({ ...recoveryRef.current, outcomeUnknown: true });
      }
      if (mounted.current && epoch.current === requestedEpoch) {
        const message = failure instanceof Error ? failure.message : "Studio request failed.";
        if (errorPlacement === "generation") setGenerationError(message);
        else setError(message);
      }
    } finally {
      if (mounted.current && epoch.current === requestedEpoch) { busyRef.current = null; setBusy(null); }
    }
  }
  async function assist(requestedEpoch: number, signal: AbortSignal) {
    const signature = candidateSignature;
    if (candidate && candidate.signature !== signature) throw new Error("The direction, subjects or style changed. Discard the stale rewrite before requesting another.");
    const direction = feedback.trim() && candidate ? candidate.prompt : form.direction;
    const result = await jsonRequest("/api/ai/art-prompt", { campaignId, kind: form.kind, direction, composition: form.composition, visualStyleId, model: textModel ?? undefined, feedback: feedback || undefined }, AbortSignal.any([signal, AbortSignal.timeout(100_000)]));
    if (!result.draft || !("prompt" in result.draft) || typeof result.allowance !== "number") throw new Error("Prompt assistance returned no draft.");
    if (mounted.current && epoch.current === requestedEpoch && !signal.aborted) {
      setCandidate({ prompt: result.draft.prompt, allowance: result.allowance, signature });
      setFormState((current) => ({ ...current, directionAssisted: true })); setEdited(true);
    }
  }
  function showDraft(draft: ImageDraft, job: StudioJob, requestedEpoch: number) {
    if (!mounted.current || epoch.current !== requestedEpoch) return;
    setJobs((current) => [...new Map([...current, job].map((value) => [value.generationRunId, value])).values()]);
    setDrafts((current) => [...new Map([...current, draft].map((value) => [value.generationRunId, value])).values()]);
    setSelectedId(draft.generationRunId);
    setTitle(""); setCaption("");
    setView("review");
    if (redoOf) setFeedback("");
    setRedoOf(null); setRedoDirectionEditing(false);
  }
  async function submitImage(body: Record<string, unknown>, requestedEpoch: number, signal: AbortSignal) {
    if (recoveryRef.current.outcomeUnknown && !window.confirm("The previous request may have been billed. Check OpenRouter usage before starting another charged request. Continue?")) return;
    if (recoveryRef.current.jobs.length >= 20) throw new Error("Recover, save or discard previous images before generating more (20-request recovery limit).");
    let result: Awaited<ReturnType<typeof jsonRequest>>;
    let job: StudioJob;
    try {
      // A submitted request is allowed to finish so a late acknowledgement can still be recovered.
      result = await jsonRequest("/api/ai/image", body, AbortSignal.timeout(55_000));
      job = studioJobSchema.parse(result.job ?? { ...imageDraftSchema.parse(result.draft), status: "pending" });
    } catch (failure) {
      if (failure instanceof Error && ["TypeError", "TimeoutError", "AbortError", "SyntaxError", "ZodError"].includes(failure.name)) {
        const unknown = new Error(unknownImageOutcomeMessage);
        unknown.name = "ImageJobOutcomeUnknownError"; throw unknown;
      }
      throw failure;
    }
    rememberJob(job);
    if (!mounted.current || epoch.current !== requestedEpoch || signal.aborted) return;
    setJobs((current) => [...new Map([...current, job].map((value) => [value.generationRunId, value])).values()]);
    const draft = result.job ? await waitForImageBackgroundJob(result.job, { signal }) : imageDraftSchema.parse(result.draft);
    showDraft(draft, job, requestedEpoch);
  }
  async function generate(requestedEpoch: number, signal: AbortSignal) {
    if (blocker) throw new Error(blocker);
    if (!preview || !previewCurrent) throw new Error("Wait for the prompt preview to update before generating.");
    if (hasReferences) {
      await jsonRequest(`/api/campaigns/${campaignId}/studio/preview`, { ...previewBody, verifyReferences: true }, AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
      if (signal.aborted || epoch.current !== requestedEpoch || !mounted.current) return;
    }
    await submitImage({
      ...previewBody, ...(redoOf ? { mode: "refine", operation: "redo", parentRunId: redoOf } : {}),
      model: model ?? undefined, aspectRatio, resolution, currentPrompt: preview.data.prompt,
    }, requestedEpoch, signal);
  }
  const editBlockedReason = !model || !options
    ? "Choose an image model before editing."
    : !options.inputModalities?.includes("image")
      ? "The selected image model cannot edit images. Choose a model that accepts image input in the compose view's image generation settings."
      : null;
  const editResolution = selectedResolution === undefined && selected?.resolution && supportedResolutions.includes(selected.resolution)
    ? selected.resolution : resolution;
  const editResolutionPicker = <ImageResolutionPicker options={options} value={editResolution} ariaLabel="Edit image resolution"
    disabled={!!busy || !ready || !!editBlockedReason} onChange={(value) => { setSelectedResolution(value); setEdited(true); }} />;
  function editBody(edit: { instruction: string; source: Record<string, unknown> }, kind: StudioForm["kind"], sourceRatio: string) {
    return {
      campaignId, purpose: "studio-art", targetKind: kind, mode: "refine", operation: "edit", edit,
      model: model ?? undefined, aspectRatio: (ratios as string[]).includes(sourceRatio) ? sourceRatio : aspectRatio,
      resolution: editResolution,
    };
  }
  async function editDraft(requestedEpoch: number, signal: AbortSignal) {
    if (!selected?.studioManifest) throw new Error("Choose a completed Studio draft.");
    if (editBlockedReason) throw new Error(editBlockedReason);
    const instruction = editInstruction.trim();
    if (!instruction) throw new Error("Describe the change to apply.");
    await submitImage(editBody({ instruction, source: { type: "draft", generationRunId: selected.generationRunId, manifest: selected.studioManifest } }, selected.targetKind === "battlemap" ? "battlemap" : "scene", selected.aspectRatio), requestedEpoch, signal);
    if (mounted.current && epoch.current === requestedEpoch) setEditInstruction("");
  }
  async function editSavedAsset(requestedEpoch: number, signal: AbortSignal) {
    if (!savedEdit) throw new Error("Choose saved artwork to edit.");
    if (editBlockedReason) throw new Error(editBlockedReason);
    const instruction = editInstruction.trim();
    if (!instruction) throw new Error("Describe the change to apply.");
    await submitImage(editBody({ instruction, source: { type: "studio-asset", assetId: savedEdit.id } }, savedEdit.kind, savedEdit.aspect_ratio), requestedEpoch, signal);
    if (mounted.current && epoch.current === requestedEpoch) { setEditInstruction(""); setSavedEdit(null); }
  }
  async function recoverJobs(requestedEpoch: number, signal: AbortSignal) {
    for (const job of recoveryRef.current.jobs) {
      if (drafts.some((draft) => draft.generationRunId === job.generationRunId)) continue;
      const response = await fetch(`/api/ai/image/${job.generationRunId}`, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
      const result = await response.json() as {
        error?: string;
        outcomeUnknown?: boolean;
        job?: {
          status: string; image?: ImageDraft["image"]; temporaryPath?: string; model?: string; createdAt?: string;
          statusUpdatedAt?: string; error?: string; resolution?: ImageDraft["resolution"];
        };
      };
      if (!response.ok || !result.job) throw new Error(result.error ?? "A previous image job could not be recovered.");
      if (!mounted.current || epoch.current !== requestedEpoch || signal.aborted) return;
      let draft: ImageDraft;
      if (result.job.status === "complete") {
        draft = imageDraftSchema.parse({
          ...job, provider: "openrouter", image: result.job.image, temporaryPath: result.job.temporaryPath,
          model: result.job.model ?? job.model, createdAt: result.job.createdAt ?? job.createdAt,
          ...((result.job.resolution ?? job.resolution) ? { resolution: result.job.resolution ?? job.resolution } : {}),
        });
      } else if (result.job.status === "pending" || result.job.status === "running") {
        setJobs((current) => [...new Map([...current, job].map((value) => [value.generationRunId, value])).values()]);
        draft = await waitForImageBackgroundJob({ ...job, status: result.job.status, statusUpdatedAt: result.job.statusUpdatedAt }, { signal });
      } else if (result.outcomeUnknown) {
        commitRecovery({ ...recoveryRef.current, outcomeUnknown: true });
        const failure = new Error(result.error ?? "The previous image request may have been billed; check OpenRouter activity before generating again.");
        failure.name = "ImageJobOutcomeUnknownError";
        throw failure;
      } else throw new Error(result.job.error ?? result.error ?? "A previous image request failed or expired. Its metadata is retained until explicitly forgotten.");
      showDraft(draft, job, requestedEpoch);
    }
  }
  async function save(requestedEpoch: number) {
    if (!selected?.studioManifest) throw new Error("Choose a completed Studio draft.");
    await jsonRequest(`/api/campaigns/${campaignId}/studio`, { generationRunId: selected.generationRunId, title, caption, prompt: selected.prompt, manifest: selected.studioManifest }, AbortSignal.timeout(55_000));
    if (!mounted.current || epoch.current !== requestedEpoch) return;
    setError(null);
    removeJob(selected.generationRunId); setTitle(""); setCaption(""); setView("compose");
    if (selected.targetKind === form.kind && selected.studioManifest.direction === form.direction && JSON.stringify(selected.studioManifest.composition) === JSON.stringify(form.composition)) {
      setEdited(false); setFeedback(""); setCandidate(null);
    }
    onSaved();
  }
  async function discard() {
    if (!selected || !window.confirm("Discard this temporary image draft?")) return;
    await deleteDraft(selected.generationRunId); setTitle(""); setCaption(""); setView("compose");
  }
  function redoSelected() {
    if (!selected?.studioManifest || (selected.targetKind !== "scene" && selected.targetKind !== "battlemap")) return;
    const manifest = selected.studioManifest;
    const composition = manifest.composition.useCampaignStyle
      ? { ...manifest.composition, styleText: manifest.style }
      : manifest.composition;
    setForm({
      kind: selected.targetKind,
      direction: manifest.direction,
      composition,
      styleId: "",
      names: Object.fromEntries(manifest.sources.map((source) => [subjectKey(source), source.name])),
    });
    setAspectRatio(selected.aspectRatio);
    setSelectedResolution(selected.resolution);
    setFeedback("");
    setCandidate(null);
    setRedoDirectionEditing(false);
    setRedoOf(selected.generationRunId); setView("compose"); setFocusTarget({ id: "redo-direction-feedback" });
  }
  async function saveCheckpoint() {
    if (checkpoint && !window.confirm("Replace the saved composition for this campaign in this tab?")) return;
    const saved = saveStudioCheckpoint(identity, inputs, sessionStorage);
    setCheckpoint(saved); setFormState(saved.inputs.form);
  }
  async function deleteCheckpoint() {
    if (!window.confirm("Delete the saved composition? Current work and image jobs are unchanged.")) return;
    deleteStudioCheckpoint(identity, sessionStorage); setCheckpoint(null); setEdited(true);
  }
  async function forgetJobs() {
    if (!window.confirm("Forget previous image-job recovery metadata? This does not cancel provider requests, refund charges or immediately delete temporary images. Server retention still applies.")) return;
    const activeIds = new Set(drafts.map((draft) => draft.generationRunId));
    commitRecovery({ ...recoveryRef.current, jobs: recoveryRef.current.jobs.filter((job) => activeIds.has(job.generationRunId)) });
    setJobs((current) => current.filter((job) => activeIds.has(job.generationRunId)));
  }
  useEffect(() => { leaveRef.current = () => replaceSession(form.kind); });
  useEffect(() => registerLeaveGuard("campaign-studio", () => leaveRef.current()), [registerLeaveGuard]);
  useImperativeHandle(ref, () => ({
    leave: () => replaceSession(form.kind),
    reuse: async (asset) => {
      const composition = asset.manifest.composition.useCampaignStyle ? { ...asset.manifest.composition, styleText: asset.manifest.style } : asset.manifest.composition;
      const next = { ...freshStudioInputs(asset.kind), form: {
        kind: asset.kind, direction: asset.manifest.direction, composition, styleId: "",
        names: Object.fromEntries(asset.manifest.sources.map((source) => [subjectKey(source), source.name])),
      } };
      if (!await replaceSession(asset.kind, next)) return false;
      setEdited(true);
      return true;
    },
    editSaved: async (asset) => {
      if (!await replaceSession(asset.kind)) return false;
      setSavedEdit(asset); setEditInstruction("");
      return true;
    },

  }));
  const missingStyle = form.composition.useCampaignStyle && !!form.styleId && !styles.some((style) => style.id === form.styleId);
  const blocker = generationBlocker({ ready, busy, loading: previewLoading, modelAvailable: !!model && !!options, hasReferences,
    ratioSupported: ratios.includes(aspectRatio), missingStyle, subjectError: referenceBlocker?.message ?? subjectError, previewError, direction: form.direction,
    previewCurrent, overBy: preview?.data.overBy ?? 0, recoveryCount: recovery.jobs.length });
  const canGenerate = !blocker;
  const styleText = form.composition.styleText ?? defaults?.style ?? "";

  return <section aria-label="AI Studio composer" className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="m-0 text-sm font-semibold tracking-[.08em]">{view === "compose" ? "COMPOSE" : "REVIEW IMAGE"}</h2>
      <div className="flex flex-wrap gap-2">
        {view !== "compose" && <button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => setView("compose")}>Back to compose</button>}
        <button type="button" className={studioGhostButton} onClick={() => void replaceSession(form.kind)}>New composition</button>
      </div>
    </header>
    {error && <p role="alert" className="m-0 break-words border border-[var(--pink)]/50 p-3 text-sm text-[var(--pink)]">{error}</p>}
    {subjectError && <p role="alert" className="m-0 break-words text-sm text-[var(--pink)]">{subjectError}</p>}
    {storageError && <div className={studioPanel}><p role="alert" className="break-words text-sm text-[var(--pink)]">{storageError}</p><div className="flex flex-wrap gap-2">
      <button type="button" className={studioGhostButton} onClick={loadStorage}>Retry browser storage</button>
      <button type="button" className={studioGhostButton} onClick={() => void perform("Deleting composition...", async () => { await deleteCheckpoint(); loadStorage(); })}>Delete stored checkpoint</button>
      <button type="button" className={studioGhostButton} onClick={() => void perform("Forgetting recovery metadata...", async () => {
        if (!window.confirm("Forget stored image-job metadata? Recovery will no longer be possible in this tab. Provider work and charges are not cancelled.")) return;
        forgetStoredStudioRecovery(identity, sessionStorage); recoveryLoaded.current = false; loadStorage();
      })}>Forget stored job metadata</button>
    </div></div>}
    {recovery.outcomeUnknown && (generationError ?? error) !== unknownImageOutcomeMessage && <p role="alert" className="break-words text-xs text-[var(--amber)]">A previous image request had an unknown outcome and may have been billed. Check OpenRouter usage before retrying. Leaving or resetting does not cancel provider work.</p>}
    {view === "compose" && savedEdit && <div className={`${studioPanel} min-w-0 space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="m-0 break-words text-sm">Edit saved artwork: {savedEdit.title}</h3>
        <button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => { setSavedEdit(null); setEditInstruction(""); }}>Cancel edit</button>
      </div>
      <VisualAsset src={savedEdit.signedUrl} label={`${savedEdit.title} source artwork`} className="aspect-square max-h-[320px] w-full border border-[var(--line)] bg-contain" />
      <p className="m-0 text-xs text-[var(--dim)]">The edit creates a new draft for review. The saved library entry stays unchanged until you save the result.</p>
      <ArtEditPanel tone="cyan" sourceLabel={`SAVED ARTWORK // ${savedEdit.title}`} instruction={editInstruction} busy={busy === "Editing image..."} disabled={!!busy || !ready} blockedReason={editBlockedReason}
        onInstructionChange={setEditInstruction} onSubmit={() => void perform("Editing image...", editSavedAsset, "generation")}>{editResolutionPicker}</ArtEditPanel>
      {generationError && <p role="alert" className="m-0 break-words text-sm text-[var(--pink)]">{generationError}</p>}
    </div>}
    {view === "compose" && redoOf && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-[var(--cyan)]/40 p-3 text-xs text-[var(--muted)]">
      <span>Redoing a draft. Adjust the direction, subjects or style below, then generate a new image. The earlier draft is kept until you discard it.</span>
      <button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => { setRedoOf(null); setRedoDirectionEditing(false); setFeedback(""); }}>Stop redo</button>
    </div>}
    {view === "compose" && redoDraft && <div className={`${studioPanel} min-w-0 space-y-2`}>
      <h3 className="m-0 font-mono text-[10px] tracking-[.11em] text-[var(--cyan)]">ORIGINAL IMAGE // REDO REFERENCE</h3>
      <div
        className="max-h-[320px] w-full border border-[var(--cyan)]/40"
        style={{ aspectRatio: redoDraft.aspectRatio.replace(":", " / ") }}
      >
        <VisualAsset
          src={redoDraft.image.url ?? `data:${redoDraft.image.mediaType};base64,${redoDraft.image.base64}`}
          label="Original draft to redo"
          className="h-full w-full bg-contain"
        />
      </div>
      {redoDraft.studioManifest && <section aria-label="Original direction" className="grid gap-1 border border-[var(--line)] p-3">
        <h4 className="m-0 font-mono text-[9px] tracking-[.1em] text-[var(--dim)]">ORIGINAL DIRECTION // READ-ONLY</h4>
        <p className="m-0 whitespace-pre-wrap break-words text-sm text-[var(--ink)]">{redoDraft.studioManifest.direction}</p>
      </section>}
    </div>}
    {view === "compose" && <div key={session} className={`${studioPanel} min-w-0 space-y-5`}>
      <div className="flex flex-wrap gap-2" aria-label="Composition mode">
        {([["scene", "Art", ImageIcon], ["battlemap", "Battlemap", MapIcon]] as const).map(([kind, label, Icon]) =>
          <button key={kind} type="button" className={studioToggle} aria-pressed={form.kind === kind} onClick={() => { if (kind !== form.kind) void replaceSession(kind); }}><Icon aria-hidden="true" size={14} />{label}</button>)}
      </div>
      {(!redoOf || redoDirectionEditing) && <StudioDirection campaignId={campaignId} kind={form.kind} value={form.direction} disabled={!!busy} onChange={(direction) => setForm({ ...form, direction })} onMention={addMention} />}
      <div className="min-w-0 space-y-3" aria-label="Direction assistance">
        {redoOf && <label className={studioLabel}>Direction feedback for AI
          <input id="redo-direction-feedback" className={studioInput} aria-label="Direction feedback for AI" value={feedback} maxLength={600} disabled={!!busy} placeholder="What should change in the original direction?" onChange={(event) => setFeedback(event.target.value)} />
        </label>}
        {redoOf ? <div role="group" aria-label="Redo direction actions" className="flex flex-wrap gap-2">
          <button type="button" className={studioButton} disabled={!!busy || !ready || !textModel || !textOptions || !form.direction.trim() || (!!candidate && candidate.signature !== candidateSignature)}
            onClick={() => void perform("Rewriting direction...", assist)}><Wand2 aria-hidden="true" size={14} />Draft direction with AI</button>
          <button type="button" className={studioGhostButton} aria-pressed={redoDirectionEditing} disabled={!!busy} onClick={() => {
            setRedoDirectionEditing((editing) => !editing);
            if (!redoDirectionEditing) setFocusTarget({ id: "studio-direction" });
          }}>{redoDirectionEditing ? "Hide direct editor" : "Edit direction directly"}</button>
        </div> : <button type="button" className={studioButton} disabled={!!busy || !ready || !textModel || !textOptions || !form.direction.trim() || (!!candidate && candidate.signature !== candidateSignature)}
          onClick={() => void perform("Rewriting direction...", assist)}><Wand2 aria-hidden="true" size={14} />{feedback.trim() ? "Refine direction" : "Rewrite direction with AI"}</button>}
        <details className="min-w-0 border border-[var(--line)]">
          <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--muted)]">AI direction model</summary>
          <div className="p-3"><AiModelPicker campaignId={campaignId} capability="structured-text" value={textModel} onChange={setTextModel} onUserChange={() => setEdited(true)} disabled={!!busy} preserveSelection onModelOptionsChange={setTextOptions} /></div>
        </details>
        {!redoOf && form.directionAssisted && <label className={studioLabel}>Direction refinement feedback
          <input className={studioInput} value={feedback} maxLength={600} disabled={!!busy} placeholder="What should the rewrite change?" onChange={(event) => setFeedback(event.target.value)} />
        </label>}
        {candidate && <div className="space-y-2 border border-[var(--cyan)]/40 p-3">
          <span className={studioMicro}>{candidate.prompt.length} / {candidate.allowance} available</span><p className="m-0 whitespace-pre-wrap break-words text-sm">{candidate.prompt}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={studioButton} disabled={!!busy || candidate.signature !== candidateSignature} onClick={() => { setForm({ ...form, direction: candidate.prompt }); setCandidate(null); setFeedback(""); if (redoOf) setRedoDirectionEditing(true); }}>Apply direction</button><button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => setCandidate(null)}>Discard rewrite</button></div>
          {candidate.signature !== candidateSignature && <p role="status" className="text-xs text-[var(--amber)]">Direction, subjects or style changed. Discard this rewrite before requesting another.</p>}
        </div>}
        <p className="m-0 text-xs text-[var(--dim)]">Text assistance drafts Direction only. Review and apply it before image generation.</p>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 text-sm">{form.kind === "battlemap" ? "Place (optional)" : "Visual subjects (optional)"}</h3>
          <button type="button" className={studioButton} disabled={!!busy || !ready} aria-expanded={pickerOpen} aria-controls="studio-subject-picker" onClick={() => setPickerOpen(!pickerOpen)}>{pickerOpen ? "Close subject picker" : "Add subjects"}</button></div>
        {form.composition.subjects.length > 0 ? (["Actors", "Place"] as const).map((group) => {
          const subjects = form.composition.subjects.filter((subject) => (subject.kind === "place") === (group === "Place"));
          return subjects.length > 0 && <section key={group} aria-label={group} className="min-w-0 space-y-2"><h4 className={studioMicro}>{group}</h4><ul className="m-0 grid list-none gap-2 p-0" aria-label={group === "Actors" ? "Selected subjects" : "Selected Place"}>
          {subjects.map((subject) => {
            const key = subjectKey(subject);
            const Icon = studioKindIcons[subject.kind];
            const grounded = defaults?.subjects.find((value) => subjectKey(value) === key);
            const name = grounded?.name ?? resolvedNames[key] ?? form.names[key] ?? subject.kind;
            const included = subject.includeDescription !== false;
            const open = editing.includes(key);
            const value = subject.description ?? grounded?.description ?? "";
            return <li key={key} className="min-w-0 border border-[var(--line)]">
              <div className="flex min-w-0 items-center gap-2 p-2">
                <VisualAsset src={thumbs[key] ?? null} label={`${name} artwork`} className="h-12 w-12 shrink-0 bg-cover" />
                <div className="min-w-0 flex-1"><p className="m-0 break-words text-sm">{name}</p><span className="mt-1 flex flex-wrap items-center gap-1"><span className={`${studioBadge} ${studioKindTones[subject.kind]}`}><Icon aria-hidden="true" size={10} />{studioKindLabels[subject.kind]}</span><span className={studioMicro}>{subject.useImage ? " / IMAGE REFERENCE" : included ? " / TEXT" : " / NAME ONLY"}{subject.description !== undefined ? " / EDITED" : ""}</span></span></div>
                <button type="button" className={studioGhostButton} aria-expanded={open} aria-controls={`${subjectElementId(key)}-editor`} onClick={() => setEditing((current) => open ? current.filter((value) => value !== key) : [...current, key])}>Subject options</button>
                <button type="button" className={studioGhostButton} disabled={!!busy} aria-label={`Remove ${name}`} onClick={() => { setSubjectError(null); if (referenceBlocker?.key === key) setReferenceBlocker(null); changeComposition({ ...form.composition, subjects: form.composition.subjects.filter((value) => subjectKey(value) !== key) }); }}><X aria-hidden="true" size={14} /></button>
              </div>
              {open && <div id={`${subjectElementId(key)}-editor`} className="space-y-3 border-t border-[var(--line)] p-3">
                <div className="flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={subject.useImage} disabled={!!busy} onChange={(event) => updateSubject(key, { useImage: event.target.checked, ...(event.target.checked ? {} : { includeDescription: undefined }) })} />Use existing image</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={included} disabled={!!busy} onChange={(event) => updateSubject(key, { includeDescription: event.target.checked ? undefined : false })} />Include description</label></div>
                {subject.useImage && <button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => { setError(null); setSubjectError(null); updateSubject(key, { useImage: false, includeDescription: undefined }); }}>Use text instead</button>}
                {referenceBlocker?.key === key && <div className="space-y-2"><p role="alert" className="text-xs text-[var(--pink)]">{referenceBlocker.message}</p><button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => { setReferenceBlocker(null); setError(null); setPreviewError(null); setPreviewNonce((current) => current + 1); }}>Retry reference verification</button></div>}
                <label className={studioLabel} htmlFor={subjectElementId(key)}>Description for {name}
                  <textarea id={subjectElementId(key)} aria-label={`Description for ${name}`} className={studioInput} rows={4} maxLength={700} value={value} disabled={!!busy || !included || (!grounded && subject.description === undefined)} onChange={(event) => updateSubject(key, { description: event.target.value })} />
                </label>
                <div className="flex flex-wrap items-center gap-3"><span className={studioMicro}>{value.length}/700</span><button type="button" className={studioGhostButton} disabled={!!busy || subject.description === undefined} onClick={() => updateSubject(key, { description: undefined })}>Reset to record text</button><span className="text-xs text-[var(--dim)]">This composition only.</span></div>
                {grounded?.appearance && included && <p className="m-0 break-words text-xs text-[var(--muted)]">Library appearance (trimmed first): {grounded.appearance}</p>}
              </div>}
            </li>;
          })}
        </ul></section>;
        }) : <p className="m-0 text-xs text-[var(--dim)]">{form.kind === "battlemap" ? "Use one Place or a freeform brief. Maps never draw actor subjects." : "Add up to six actors and one Place, or use a freeform direction."}</p>}
        {pickerOpen && <div id="studio-subject-picker"><SubjectPicker campaignId={campaignId} placesOnly={form.kind === "battlemap"} disabled={!!busy} onSelect={addSubject} selectedKeys={form.composition.subjects.map(subjectKey)} /></div>}
      </div>
    </div>}
    {view === "compose" && <StudioPromptPanel key={`prompt-${session}`} preview={preview?.data ?? null} current={previewCurrent} loading={previewLoading} error={previewError} generationError={generationError} busy={busy} canGenerate={canGenerate} blocker={blocker} onEdit={editSection} onRefresh={() => setPreviewNonce((current) => current + 1)} onGenerate={() => void perform("Generating image...", generate, "generation")} generationSettings={<div aria-label="Image generation settings" className="min-w-0 space-y-3 pb-3">
      <h3 className="m-0 text-sm">Image generation settings</h3>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,.6fr)]">
        <label className={studioLabel}>Visual style<select aria-label="Visual style" className={studioInput} value={form.composition.useCampaignStyle ? form.styleId : "none"} disabled={!!busy}
          onChange={(event) => setForm({ ...form, styleId: event.target.value === "none" ? "" : event.target.value, composition: { ...form.composition, useCampaignStyle: event.target.value !== "none", styleText: undefined } })}>
          <option value="none">No campaign style</option><option value="">Campaign default</option>{styles.map((style) => <option value={style.id} key={style.id}>{style.name}</option>)}
          {missingStyle && <option value={form.styleId}>Unavailable saved style</option>}
        </select></label>
        <AiModelPicker campaignId={campaignId} capability="image" value={model} onChange={setModel} onUserChange={() => { setSelectedResolution(undefined); setEdited(true); }} disabled={!!busy} preserveSelection requiresImageInput={hasReferences} onModelOptionsChange={setOptions} />
        <label className={studioLabel}>Image aspect ratio<select aria-label="Image aspect ratio" className={studioInput} value={aspectRatio} disabled={!!busy || !options} onChange={(event) => { setAspectRatio(event.target.value as ImageAspectRatio); setEdited(true); }}>
          {!ratios.includes(aspectRatio) && <option value={aspectRatio}>{aspectRatio} (unsupported)</option>}{ratios.map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}
        </select></label>
      </div>
      <ImageResolutionPicker options={options} value={resolution} disabled={!!busy || !ready}
        onChange={(value) => { setSelectedResolution(value); setEdited(true); }} />
      {missingStyle && <p role="alert" className="text-xs text-[var(--pink)]">The saved visual style is unavailable. Choose another style.</p>}
      {hasReferences && <p className="m-0 text-xs text-[var(--muted)]">References require a compatible provider and may add cost. PNG/JPEG/WebP only; 5 MB each, 20 MB combined. Likeness is not guaranteed.</p>}
      <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="min-w-0 border border-[var(--line)]">
        <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--muted)]">Advanced composition settings</summary>
        <div className="space-y-3 border-t border-[var(--line)] p-3">
          {form.composition.useCampaignStyle && <div>
            <label className={studioLabel} htmlFor="studio-style-text">Style text <span className={studioMicro}>{styleText.length}/1200</span>
              <textarea id="studio-style-text" aria-label="Style text" className={studioInput} rows={4} maxLength={1200} value={styleText} disabled={!!busy || (!defaults && form.composition.styleText === undefined)} onChange={(event) => changeComposition({ ...form.composition, styleText: event.target.value })} />
            </label>
            <button type="button" className={studioGhostButton} disabled={!!busy || form.composition.styleText === undefined} onClick={() => changeComposition({ ...form.composition, styleText: undefined })}>Reset to saved style</button>
            <p className="text-xs text-[var(--dim)]">Edits apply here only; long style text is trimmed first.</p>
          </div>}
          {form.kind === "battlemap" && <label className={studioLabel}>Map grid<select className={studioInput} value={form.composition.grid} disabled={!!busy} onChange={(event) => changeComposition({ ...form.composition, grid: event.target.value as "gridless" | "drawn" })}><option value="gridless">Gridless (recommended)</option><option value="drawn">Model-drawn square grid</option></select><span className="text-xs text-[var(--amber)]">Illustrative images, not VTT maps; scale and square counts are not guaranteed.</span></label>}
        </div>
      </details>
    </div>} />}
    {view === "compose" && drafts.length > 0 && <button type="button" className={studioButton} onClick={() => setView("review")}>Review image drafts ({drafts.length})</button>}
    {view === "review" && <section aria-label="Review image draft" className={studioPanel}><StudioDraftReview key={selectedId ?? "none"} jobs={jobs} drafts={drafts} selectedId={selectedId} busy={busy} title={title} caption={caption} editInstruction={editInstruction} editBlockedReason={editBlockedReason} editSettings={editResolutionPicker}
      onSelect={(id) => {
      if (id === selectedId) return;
      setSelectedId(id);
      setTitle(""); setCaption("");
    }} onTitle={setTitle} onCaption={setCaption} onEditInstruction={setEditInstruction} onRedo={redoSelected} onEdit={() => void perform("Editing image...", editDraft, "top")} onSave={() => void perform("Saving artwork...", save)} onDiscard={() => void perform("Discarding draft...", discard)} onForget={() => void perform("Forgetting recovery metadata...", forgetJobs)} /></section>}
    {view !== "compose" && busy && <p role="status" className="text-sm text-[var(--cyan)]">{busy}</p>}
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
      <button type="button" className={studioGhostButton} disabled={!!busy || !ready} onClick={() => void perform("Saving composition...", saveCheckpoint)}>Save composition for later</button>
      {checkpoint && <><button type="button" className={studioGhostButton} onClick={() => void replaceSession(checkpoint.inputs.form.kind, checkpoint.inputs)}>Resume composition</button><button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => void perform("Deleting composition...", deleteCheckpoint)}>Delete saved composition</button><span role="status" className="text-xs text-[var(--muted)]">Composition saved in this tab.</span></>}
    </div>
    {recovery.jobs.length > 0 && <div className={`${studioPanel} space-y-2`}>
      <p className="m-0 text-xs text-[var(--muted)]">{recovery.jobs.length} previous image request{recovery.jobs.length === 1 ? "" : "s"} available for explicit recovery. Recovery reviews the original request; it never fills or replaces your current composition.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={studioButton} disabled={!!busy || !ready} onClick={() => void perform("Recovering image jobs...", recoverJobs)}>Recover previous image jobs</button><button type="button" className={studioGhostButton} disabled={!!busy} onClick={() => void perform("Forgetting recovery metadata...", forgetJobs)}>Forget previous image jobs</button></div>
    </div>}
    <p className="m-0 text-[11px] text-[var(--dim)]">Studio opens fresh. Save a composition explicitly to resume it in this tab. Browser Back/Forward leaves without an in-app confirmation; reload/close uses the browser&apos;s unsaved-change warning. Temporary images left this way expire through server retention.</p>
  </section>;
}
