"use client";

import { useState } from "react";
import { FileSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import EnemyEditor from "@/components/enemies/EnemyEditor";
import EnemyPublicRecord from "@/components/enemies/EnemyPublicRecord";
import { RecordDeleteAction, RecordEditAction } from "@/components/ui/RecordActions";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiEnemy } from "@/lib/campaign/types";
import type { CampaignEnemyResult } from "@/lib/campaign/enemies-server";
import { enemyImportPreviewSchema, type EnemyImportPreview } from "@/lib/validation/enemy";

const actionClassName = "h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]";

export default function EnemyDetailRouteView({ campaignId, initialResult }: { campaignId: string; initialResult: CampaignEnemyResult }) {
  const router = useRouter();
  const [enemy, setEnemy] = useState<ApiEnemy>(initialResult.enemy);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReimporting, setIsReimporting] = useState(false);
  const [reimportPreview, setReimportPreview] = useState<EnemyImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isGM = initialResult.role === "gm";

  const deleteEnemy = async () => {
    if (isDeleting || !window.confirm(`Delete ${enemy.name} from this campaign?`)) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/enemies/${encodeURIComponent(enemy.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Enemy could not be deleted.");
      router.push(campaignSectionPath(campaignId, "enemies"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Enemy could not be deleted.");
      setIsDeleting(false);
    }
  };

  const previewReimport = async () => {
    const sourceUrl = enemy.source_snapshot && typeof enemy.source_snapshot.canonicalUrl === "string" ? enemy.source_snapshot.canonicalUrl : null;
    if (isReimporting || enemy.source_provider !== "aon" || !sourceUrl) {
      setError("This enemy does not have a valid Archives of Nethys source to review.");
      return;
    }
    setIsReimporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/enemies/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, existingEnemyId: enemy.id }),
      });
      const result = (await response.json()) as { error?: string; preview?: unknown };
      if (!response.ok || !result.preview) throw new Error(result.error ?? "Enemy source preview failed.");
      setReimportPreview(enemyImportPreviewSchema.parse(result.preview));
      setEditorOpen(true);
    } catch (reimportError) {
      setError(reimportError instanceof Error ? reimportError.message : "Enemy source preview failed.");
    } finally {
      setIsReimporting(false);
    }
  };

  const actions = isGM ? <div className="flex flex-wrap items-center justify-end gap-2"><RecordEditAction recordName={enemy.name} disabled={isDeleting} onClick={() => { setError(null); setReimportPreview(null); setEditorOpen(true); }} />{enemy.source_provider === "aon" ? <button className={actionClassName} disabled={isReimporting} onClick={() => void previewReimport()} type="button"><FileSearch aria-hidden="true" size={15} /> {isReimporting ? "PREVIEWING..." : "REVIEW SOURCE UPDATE"}</button> : null}</div> : undefined;

  return <><CampaignArtEditorSlot />{editorOpen ? <EnemyEditor key={`${enemy.id}:${reimportPreview?.sourceSnapshot.contentHash ?? "manual"}`} campaignId={campaignId} enemy={enemy} initialImportPreview={reimportPreview} onCancel={() => { setEditorOpen(false); setReimportPreview(null); }} onSaved={(saved) => { setEnemy(saved); setEditorOpen(false); setReimportPreview(null); }} /> : <><EnemyPublicRecord campaignId={campaignId} enemy={enemy} isGM={isGM} actions={actions} />{isGM ? <div className="character-form-actions flex items-center gap-[10px] max-[760px]:flex-wrap"><RecordDeleteAction recordName={enemy.name} disabled={isDeleting} onClick={() => void deleteEnemy()} /></div> : null}</>}{error ? <p className="m-0 mt-3 text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}</>;
}
