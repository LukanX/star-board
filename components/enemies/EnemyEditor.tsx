"use client";

import { useState, type FormEvent } from "react";
import { Download, FileSearch, LockKeyhole, RefreshCw, Sparkles, X } from "lucide-react";
import { markCampaignArtPersisted, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { ApiEnemy } from "@/lib/campaign/types";
import { enemyAiDraftSchema, enemyBriefDraftSchema, enemyImportPreviewSchema, enemySizeSchema, enemyRaritySchema, enemyStatBlockSchema, type EnemyAiDraft, type EnemyBriefDraft, type EnemyImportPreview, type EnemyRarity, type EnemySize, type EnemySourceSnapshot, type EnemyStatBlockV1, createEnemySchema } from "@/lib/validation/enemy";

function defaultStatBlock(): EnemyStatBlockV1 {
  return enemyStatBlockSchema.parse({ schemaVersion: 1 });
}

type EnemyDraft = {
  name: string;
  playerDescription: string;
  level: number;
  size: EnemySize;
  rarity: EnemyRarity;
  traitsText: string;
  family: string;
  gmNotesMarkdown: string;
  isRevealed: boolean;
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
  origin: "manual" | "ai" | "aon";
  sourceSnapshot: EnemySourceSnapshot | null;
  statBlock: EnemyStatBlockV1;
};

type ApprovedImport = {
  expectedSourceHash: string | null;
  sourceHash: string;
};

function toSourceSnapshot(enemy: ApiEnemy): EnemySourceSnapshot | null {
  const result = enemy.source_snapshot ? enemyImportPreviewSchema.shape.sourceSnapshot.safeParse(enemy.source_snapshot) : null;
  return result?.success ? result.data : null;
}

function toDraft(enemy?: ApiEnemy): EnemyDraft {
  return enemy ? {
    name: enemy.name,
    playerDescription: enemy.player_description,
    level: enemy.level ?? 0,
    size: enemy.size ?? "medium",
    rarity: enemy.rarity ?? "common",
    traitsText: (enemy.traits ?? []).join(", "),
    family: enemy.family ?? "",
    gmNotesMarkdown: enemy.gm_notes_markdown ?? "",
    isRevealed: enemy.is_revealed,
    artSubject: enemy.art_subject ?? "",
    artPath: enemy.art_path,
    artUrl: enemy.art_url ?? null,
    artPrompt: enemy.art_prompt ?? null,
    artProvider: enemy.art_provider ?? null,
    origin: enemy.origin ?? "manual",
    sourceSnapshot: toSourceSnapshot(enemy),
    statBlock: enemy.stat_block ?? defaultStatBlock(),
  } : {
    name: "",
    playerDescription: "",
    level: 0,
    size: "medium",
    rarity: "common",
    traitsText: "",
    family: "",
    gmNotesMarkdown: "",
    isRevealed: false,
    artSubject: "",
    artPath: null,
    artUrl: null,
    artPrompt: null,
    artProvider: null,
    origin: "manual",
    sourceSnapshot: null,
    statBlock: defaultStatBlock(),
  };
}

function traitsFromText(value: string): string[] {
  return [...new Set(value.split(",").map((trait) => trait.trim()).filter(Boolean))];
}

export default function EnemyEditor({ campaignId, enemy, initialImportPreview, onSaved, onCancel: parentOnCancel }: { campaignId: string; enemy?: ApiEnemy; initialImportPreview?: EnemyImportPreview | null; onSaved?: (enemy: ApiEnemy) => void; onCancel?: () => void }) {
  const [draft, setDraftState] = useState<EnemyDraft>(() => toDraft(enemy));
  const [statBlockText, setStatBlockText] = useState(() => JSON.stringify(toDraft(enemy).statBlock, null, 2));
  const [aiCandidate, setAiCandidate] = useState<EnemyAiDraft | null>(null);
  const [briefCandidate, setBriefCandidate] = useState<EnemyBriefDraft | null>(null);
  const [importUrl, setImportUrl] = useState(() => initialImportPreview?.sourceSnapshot.canonicalUrl ?? "");
  const [importPreview, setImportPreview] = useState<EnemyImportPreview | null>(() => initialImportPreview ?? null);
  const [approvedImport, setApprovedImport] = useState<ApprovedImport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBriefGenerating, setIsBriefGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setDirty, clearDirty } = useDirtyForm();

  const setDraft = (updater: (current: EnemyDraft) => EnemyDraft) => {
    setDirty();
    setDraftState(updater);
  };
  const update = <K extends keyof EnemyDraft>(field: K, value: EnemyDraft[K]) => {
    if (field === "name" || field === "level" || field === "size" || field === "rarity" || field === "traitsText" || field === "family" || field === "statBlock" || field === "origin" || field === "sourceSnapshot") {
      setApprovedImport(null);
    }
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const onCancel = () => { clearDirty(); parentOnCancel?.(); };

  useCampaignArtEditor({
    campaignId,
    kind: "enemy",
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

  const generationBody = () => {
    let currentStatBlock = draft.statBlock;
    try {
      const parsed = enemyStatBlockSchema.safeParse(JSON.parse(statBlockText));
      if (parsed.success) currentStatBlock = parsed.data;
    } catch {
      // The save action reports invalid JSON; keep generation on the last valid draft.
    }
    return { campaignId, mode: enemy ? "refine" : "create", name: draft.name, level: draft.level, size: draft.size, rarity: draft.rarity, traits: traitsFromText(draft.traitsText), family: draft.family || null, currentDraft: { name: draft.name, playerDescription: draft.playerDescription, level: draft.level, size: draft.size, rarity: draft.rarity, traits: traitsFromText(draft.traitsText), family: draft.family || null, statBlock: currentStatBlock, gmNotesMarkdown: draft.gmNotesMarkdown, artSubject: draft.artSubject } };
  };

  const generateEnemy = async () => {
    setIsGenerating(true); setError(null);
    try {
      const response = await fetch("/api/ai/enemy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generationBody()) });
      const result = (await response.json()) as { error?: string; draft?: unknown };
      if (!response.ok || !result.draft) throw new Error(result.error ?? "Enemy generation failed.");
      const candidate = enemyAiDraftSchema.parse(result.draft);
      setAiCandidate(candidate);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Enemy generation failed.");
    } finally { setIsGenerating(false); }
  };

  const applyEnemyCandidate = () => {
    if (!aiCandidate) return;
    setDraft((current) => ({ ...current, name: aiCandidate.name, playerDescription: aiCandidate.playerDescription, level: aiCandidate.level, size: aiCandidate.size, rarity: aiCandidate.rarity, traitsText: aiCandidate.traits.join(", "), family: aiCandidate.family ?? "", gmNotesMarkdown: aiCandidate.gmNotesMarkdown, artSubject: aiCandidate.artSubject, statBlock: aiCandidate.statBlock, origin: "ai", sourceSnapshot: null }));
    setApprovedImport(null);
    setStatBlockText(JSON.stringify(aiCandidate.statBlock, null, 2));
    setAiCandidate(null);
  };

  const generateBrief = async () => {
    setIsBriefGenerating(true); setError(null);
    try {
      const response = await fetch("/api/ai/enemy/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generationBody()) });
      const result = (await response.json()) as { error?: string; draft?: unknown };
      if (!response.ok || !result.draft) throw new Error(result.error ?? "Enemy brief generation failed.");
      setBriefCandidate(enemyBriefDraftSchema.parse(result.draft));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Enemy brief generation failed.");
    } finally { setIsBriefGenerating(false); }
  };

  const applyBriefCandidate = () => {
    if (!briefCandidate) return;
    setDraft((current) => ({ ...current, playerDescription: briefCandidate.playerDescription, artSubject: briefCandidate.artSubject }));
    setBriefCandidate(null);
  };

  const previewImport = async () => {
    setIsImporting(true); setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/enemies/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: importUrl, existingEnemyId: enemy?.id }) });
      const result = (await response.json()) as { error?: string; preview?: unknown };
      if (!response.ok || !result.preview) throw new Error(result.error ?? "Enemy source preview failed.");
      setImportPreview(enemyImportPreviewSchema.parse(result.preview));
      setApprovedImport(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Enemy source preview failed.");
    } finally { setIsImporting(false); }
  };

  const applyImport = () => {
    if (!importPreview) return;
    const imported = importPreview.draft;
    setDraft((current) => ({ ...current, name: imported.name, level: imported.level, size: imported.size, rarity: imported.rarity, traitsText: imported.traits.join(", "), family: imported.family ?? "", statBlock: imported.statBlock, sourceSnapshot: importPreview.sourceSnapshot, origin: "aon" }));
    setApprovedImport(enemy && importPreview.existingEnemyId === enemy.id ? {
      expectedSourceHash: importPreview.existingSourceHash,
      sourceHash: importPreview.sourceSnapshot.contentHash,
    } : null);
    setStatBlockText(JSON.stringify(imported.statBlock, null, 2));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setIsSaving(true); setError(null);
    try {
      let statBlock: EnemyStatBlockV1;
      try {
        const result = enemyStatBlockSchema.safeParse(JSON.parse(statBlockText));
        if (!result.success) throw new Error("The structured stat block JSON is invalid.");
        statBlock = result.data;
      } catch (parseError) {
        throw new Error(parseError instanceof Error ? parseError.message : "The structured stat block JSON is invalid.");
      }
      const payload = { name: draft.name, playerDescription: draft.playerDescription, isRevealed: draft.isRevealed, artPath: draft.artPath, artUrl: draft.artUrl, level: draft.level, size: draft.size, rarity: draft.rarity, traits: traitsFromText(draft.traitsText), family: draft.family || null, statBlock, gmNotesMarkdown: draft.gmNotesMarkdown, origin: draft.origin, artSubject: draft.artSubject || null, artPrompt: draft.artPrompt, artProvider: draft.artProvider, sourceSnapshot: draft.sourceSnapshot, ...(enemy ? { expectedUpdatedAt: enemy.updated_at } : {}) };
      const validated = createEnemySchema.safeParse(payload);
      if (!validated.success) throw new Error(validated.error.issues[0]?.message ?? "Enemy details are invalid.");
      const reviewedSource = enemy && approvedImport && importPreview?.existingEnemyId === enemy.id && draft.origin === "aon" && draft.sourceSnapshot?.contentHash === approvedImport.sourceHash ? importPreview : null;
      const saveUrl = reviewedSource
        ? `/api/campaigns/${encodeURIComponent(campaignId)}/enemies/${encodeURIComponent(enemy?.id ?? "")}/reimport`
        : `/api/campaigns/${encodeURIComponent(campaignId)}/enemies${enemy ? `/${encodeURIComponent(enemy.id)}` : ""}`;
      const response = await fetch(saveUrl, { method: reviewedSource ? "POST" : enemy ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reviewedSource ? {
        expectedSourceHash: approvedImport?.expectedSourceHash ?? null,
        expectedUpdatedAt: enemy!.updated_at,
        url: reviewedSource.sourceSnapshot.canonicalUrl,
        reviewedSource: {
          name: reviewedSource.draft.name,
          level: reviewedSource.draft.level,
          size: reviewedSource.draft.size,
          rarity: reviewedSource.draft.rarity,
          traits: reviewedSource.draft.traits,
          family: reviewedSource.draft.family,
          statBlock: reviewedSource.draft.statBlock,
          sourceSnapshot: reviewedSource.sourceSnapshot,
        },
        preserved: {
          playerDescription: draft.playerDescription,
          isRevealed: draft.isRevealed,
          artPath: draft.artPath,
          gmNotesMarkdown: draft.gmNotesMarkdown,
          artSubject: draft.artSubject || null,
          artPrompt: draft.artPrompt,
          artProvider: draft.artProvider,
        },
      } : payload) });
      const result = (await response.json()) as { error?: string; enemy?: ApiEnemy };
      if (!response.ok || !result.enemy) throw new Error(result.error ?? "Enemy could not be saved.");
      markCampaignArtPersisted(campaignId, result.enemy.art_path); clearDirty(); onSaved?.(result.enemy);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Enemy could not be saved."); }
    finally { setIsSaving(false); }
  };

  return <section className={`${editorPanelClassName} mb-5`} data-enemy-editor="true"><div className="editor-heading flex items-start justify-between gap-4 mb-[18px]"><div><p className={eyebrowClassName}>GM ENEMY RECORD</p><h2 className="mt-[6px] text-[19px]">{enemy ? `Edit ${enemy.name}` : "Add an enemy"}</h2></div><button aria-label="Close enemy editor" className="w-8 h-8 inline-grid place-items-center border border-transparent bg-transparent text-[var(--muted)] cursor-pointer p-0 hover:text-[var(--ink)] hover:border-[var(--line)] hover:bg-[rgba(255,255,255,.035)]" onClick={onCancel} title="Close enemy editor" type="button"><X size={17} /></button></div>
    <div className="grid gap-[12px] mb-4">
      <section className="grid gap-[10px] p-[12px] border border-[rgba(98,232,255,.24)] bg-[rgba(98,232,255,.035)]"><div className="flex items-center gap-2"><FileSearch size={15} className="text-[var(--cyan)]" /><p className={`${eyebrowClassName} !m-0`}>ARCHIVES OF NETHYS IMPORT</p></div><p className="m-0 text-[var(--muted)] text-[10px] leading-[1.5]">Paste one creature URL to preview normalized mechanics and provenance. Nothing is saved until you review and submit this form.</p><div className="flex gap-2 max-[600px]:flex-col"><input className="min-w-0 flex-1 h-[37px] border border-[rgba(139,151,169,.28)] outline-0 p-[9px_10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[10px]" placeholder="https://2e.aonsrd.com/creatures/..." value={importUrl} onChange={(event) => { setImportUrl(event.target.value); setImportPreview(null); }} /><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[12px] border border-[var(--cyan)] bg-[rgba(98,232,255,.08)] text-[var(--cyan)] font-mono text-[8px] tracking-[.1em] cursor-pointer" disabled={isImporting || !importUrl.trim()} onClick={() => void previewImport()} type="button">{isImporting ? <RefreshCw className="animate-spin" size={13} /> : <FileSearch size={13} />} {isImporting ? "READING..." : "PREVIEW SOURCE"}</button></div>{importPreview ? <div className="grid gap-2 border-t border-[rgba(98,232,255,.16)] pt-3"><p className="m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.09em]">{importPreview.sourceSnapshot.sourceTitle}{" // PAGE "}{importPreview.sourceSnapshot.sourcePage}{" // "}{importPreview.sourceSnapshot.contentHash.slice(0, 12)}...</p><div className="grid gap-1">{importPreview.differences.filter((difference) => difference.status !== "unchanged").map((difference) => <p className="m-0 text-[var(--muted)] text-[9px]" key={difference.section}>{difference.section.toUpperCase()}: {difference.summary}</p>)}</div>{importPreview.warnings.length ? <p className="m-0 text-[var(--amber)] text-[9px]">Warnings: {importPreview.warnings.join(" // ")}</p> : null}<button className="h-[34px] inline-flex w-fit items-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-[11px] text-[#061017] font-mono text-[8px] tracking-[.1em] cursor-pointer" onClick={applyImport} type="button"><Download size={13} /> APPLY IMPORT TO EDITOR</button></div> : null}</section>
      <section className="grid gap-[10px] p-[12px] border border-[rgba(185,146,255,.3)] bg-[rgba(185,146,255,.055)]"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Sparkles size={15} className="text-[var(--purple)]" /><p className={`${eyebrowClassName} !m-0 text-[var(--purple)]`}>AI COMPLETE CREATURE DRAFT</p></div><button className="h-[32px] inline-flex items-center gap-2 border border-[rgba(255,92,154,.4)] bg-[rgba(255,92,154,.08)] px-[10px] text-[var(--pink)] font-mono text-[8px] tracking-[.08em] cursor-pointer" disabled={isGenerating} onClick={() => void generateEnemy()} type="button">{isGenerating ? <RefreshCw className="animate-spin" size={13} /> : <Sparkles size={13} />} {isGenerating ? "GENERATING..." : "GENERATE"}</button></div><p className="m-0 text-[var(--muted)] text-[10px] leading-[1.5]">Generates a reviewable full stat block. It does not save or overwrite this editor until you apply the candidate.</p>{aiCandidate ? <div className="grid gap-2 border-t border-[rgba(185,146,255,.18)] pt-2"><p className="m-0 text-[var(--ink)] text-[11px]">{aiCandidate.name}{" // Level "}{aiCandidate.level}{" // "}{aiCandidate.size} {aiCandidate.rarity}</p><p className="m-0 text-[var(--muted)] text-[10px]">{aiCandidate.playerDescription}</p><pre className="max-h-[180px] overflow-auto m-0 p-2 bg-[#0a1118] text-[var(--dim)] text-[8px] leading-[1.4]">{JSON.stringify(aiCandidate.statBlock, null, 2)}</pre><button className="h-[34px] inline-flex w-fit items-center gap-2 border border-[var(--purple)] bg-[rgba(185,146,255,.12)] px-[11px] text-[var(--purple)] font-mono text-[8px] tracking-[.1em] cursor-pointer" onClick={applyEnemyCandidate} type="button">APPLY COMPLETE DRAFT</button></div> : null}</section>
      <section className="grid gap-[10px] p-[12px] border border-[rgba(245,184,75,.25)] bg-[rgba(245,184,75,.035)]"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Sparkles size={15} className="text-[var(--amber)]" /><p className={`${eyebrowClassName} !m-0 text-[var(--amber)]`}>SPOILER-SAFE PLAYER BRIEF</p></div><button className="h-[32px] inline-flex items-center gap-2 border border-[rgba(245,184,75,.4)] bg-[rgba(245,184,75,.08)] px-[10px] text-[var(--amber)] font-mono text-[8px] tracking-[.08em] cursor-pointer" disabled={isBriefGenerating} onClick={() => void generateBrief()} type="button">{isBriefGenerating ? <RefreshCw className="animate-spin" size={13} /> : <Sparkles size={13} />} {isBriefGenerating ? "GENERATING..." : "GENERATE BRIEF"}</button></div><p className="m-0 text-[var(--muted)] text-[10px]">The brief route receives GM context but returns only player description and art direction.</p>{briefCandidate ? <div className="grid gap-2 border-t border-[rgba(245,184,75,.18)] pt-2"><p className="m-0 text-[var(--muted)] text-[10px]">{briefCandidate.playerDescription}</p><p className="m-0 text-[var(--dim)] text-[9px]">ART: {briefCandidate.artSubject}</p><button className="h-[34px] inline-flex w-fit items-center gap-2 border border-[var(--amber)] bg-[rgba(245,184,75,.1)] px-[11px] text-[var(--amber)] font-mono text-[8px] tracking-[.1em] cursor-pointer" onClick={applyBriefCandidate} type="button">APPLY PLAYER BRIEF</button></div> : null}</section>
    </div>
    <form className="character-form grid gap-[13px] [&_label]:grid [&_label]:gap-[7px] [&_label]:text-[var(--dim)] [&_label]:font-mono [&_label]:text-[8px] [&_label]:tracking-[.12em] [&_input]:w-full [&_input]:border [&_input]:border-[rgba(139,151,169,.28)] [&_input]:outline-0 [&_input]:p-[10px_12px] [&_input]:bg-[#0a1118] [&_input]:text-[var(--ink)] [&_input]:font-mono [&_input]:text-[11px] [&_input]:h-[42px] [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[rgba(139,151,169,.28)] [&_textarea]:outline-0 [&_textarea]:p-[10px_12px] [&_textarea]:bg-[#0a1118] [&_textarea]:text-[var(--ink)] [&_textarea]:font-mono [&_textarea]:text-[11px] [&_textarea]:min-h-[110px] [&_textarea]:resize-y [&_textarea]:leading-[1.55]" onSubmit={save}>
      <div className="grid grid-cols-[1.4fr_90px_130px_130px] gap-[10px] max-[760px]:grid-cols-2 max-[420px]:grid-cols-1"><label className="max-[420px]:[grid-column:auto]">Name<input required maxLength={160} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>Level<input required type="number" min={-1} max={25} value={draft.level} onChange={(event) => update("level", Number(event.target.value))} /></label><label>Size<select className={editorSelectClassName} value={draft.size} onChange={(event) => update("size", enemySizeSchema.parse(event.target.value))}>{enemySizeSchema.options.map((size) => <option key={size} value={size}>{size.toUpperCase()}</option>)}</select></label><label>Rarity<select className={editorSelectClassName} value={draft.rarity} onChange={(event) => update("rarity", enemyRaritySchema.parse(event.target.value))}>{enemyRaritySchema.options.map((rarity) => <option key={rarity} value={rarity}>{rarity.toUpperCase()}</option>)}</select></label></div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[10px] max-[600px]:grid-cols-1"><label>Traits / type<input maxLength={400} value={draft.traitsText} onChange={(event) => update("traitsText", event.target.value)} placeholder="Aberration, aquatic, occult" /></label><label>Family<input maxLength={160} value={draft.family} onChange={(event) => update("family", event.target.value)} placeholder="Optional creature family" /></label></div>
      <label>Player-safe description<textarea maxLength={4000} value={draft.playerDescription} onChange={(event) => update("playerDescription", event.target.value)} /></label>
      <label>Structured mechanics <span className="text-[var(--pink)]">{"// JSON V1 // GM ONLY"}</span><textarea className="!min-h-[320px] font-mono !text-[9px]" value={statBlockText} onChange={(event) => { setDirty(); setApprovedImport(null); setStatBlockText(event.target.value); }} /></label>
      <label>GM notes <span className="inline-flex items-center gap-1 text-[var(--pink)]"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => update("gmNotesMarkdown", event.target.value)} /></label>
      <label>Artwork subject <span className="text-[var(--dim)]">{"// one creature only"}</span><textarea maxLength={1600} value={draft.artSubject} onChange={(event) => update("artSubject", event.target.value)} /></label>
      <label className="flex !flex-row items-center gap-2 !text-[var(--ink)]"><input className="!w-auto !h-auto" type="checkbox" checked={draft.isRevealed} onChange={(event) => update("isRevealed", event.target.checked)} /> Reveal name, art, and player-safe brief to players</label>
      {draft.sourceSnapshot ? <p className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.07em]">SOURCE LOCKED{" // "}{draft.sourceSnapshot.canonicalUrl}{" // "}{draft.sourceSnapshot.contentHash}</p> : null}
      {error ? <p className="m-0 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
      <div className="flex items-center gap-[10px] flex-wrap"><button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] font-mono text-[9px] tracking-[.12em] cursor-pointer" disabled={isSaving} type="submit">{isSaving ? "SAVING..." : "SAVE ENEMY"}</button><button className="text-action inline-flex items-center gap-1 border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer" disabled={isSaving} onClick={onCancel} type="button">CANCEL</button></div>
    </form>
  </section>;
}
