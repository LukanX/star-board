"use client";

import { useEffect, useState } from "react";
import { Check, Edit3, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { panelClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import VisualStylePreview from "@/components/settings/VisualStylePreview";
import VisualStyleWizard, { type EditableVisualStyle } from "@/components/settings/VisualStyleWizard";
import type { CampaignVisualStyle } from "@/lib/campaign/visual-styles";

const actionButtonClassName = "h-[32px] inline-flex items-center justify-center gap-2 px-[10px] border border-[var(--line)] bg-[rgba(255,255,255,.035)] text-[var(--muted)] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName = "h-[35px] inline-flex items-center justify-center gap-2 px-[12px] border border-[var(--cyan)] bg-[var(--cyan)] text-[#061017] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:bg-[#8ceeff] disabled:cursor-not-allowed disabled:opacity-50";

export default function CampaignVisualStyles({ campaignId }: { campaignId: string }) {
  const [styles, setStyles] = useState<CampaignVisualStyle[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<EditableVisualStyle | null>(null);
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const loadKey = `${campaignId}:${reloadToken}`;
  const isLoading = loadedKey !== loadKey;

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { styles?: CampaignVisualStyle[]; error?: string };
        if (!response.ok || !result.styles) throw new Error(result.error ?? "Campaign visual styles are unavailable.");
        if (cancelled) return;
        setStyles(result.styles);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Campaign visual styles are unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(loadKey);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, loadKey]);

  const reload = () => setReloadToken((value) => value + 1);

  const openNew = () => {
    setError(null);
    setNotice(null);
    setEditingStyle(null);
    setWizardOpen(true);
  };

  const openEdit = (style: CampaignVisualStyle) => {
    setError(null);
    setNotice(null);
    setEditingStyle({ id: style.id, name: style.name, visualStyle: style.visualStyle, status: style.status, wizardInputs: style.wizardInputs, revision: style.revision });
    setWizardOpen(true);
  };

  const applyStyle = async (style: CampaignVisualStyle) => {
    setIsWorking(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles/${encodeURIComponent(style.id)}/apply`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The visual style could not be applied.");
      setNotice(`${style.name.toUpperCase()} IS NOW THE CAMPAIGN DEFAULT.`);
      reload();
    } catch (applyError: unknown) {
      setError(applyError instanceof Error ? applyError.message : "The visual style could not be applied.");
    } finally {
      setIsWorking(false);
    }
  };

  const deleteStyle = async (style: CampaignVisualStyle) => {
    if (!window.confirm(`Delete the visual style "${style.name}"?`)) return;
    setIsWorking(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/visual-styles/${encodeURIComponent(style.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The visual style could not be deleted.");
      setNotice("VISUAL STYLE DELETED.");
      if (expandedPreviewId === style.id) setExpandedPreviewId(null);
      reload();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "The visual style could not be deleted.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <>
      {wizardOpen ? (
        <VisualStyleWizard campaignId={campaignId} style={editingStyle} onCancel={() => setWizardOpen(false)} onSaved={() => { setWizardOpen(false); setNotice("VISUAL STYLE SAVED."); reload(); }} />
      ) : (
        <section className={`${panelClassName} w-full min-w-0`} data-campaign-visual-styles>
          <div className="panel-topline flex items-start justify-between gap-4 px-[21px] pb-3 pt-5">
            <div>
              <p className={`${eyebrowClassName} !mb-2`}>GM CONTROL // VISUAL LANGUAGE</p>
              <h2>Campaign visual styles</h2>
            </div>
            <Sparkles size={17} className="text-[var(--pink)]" />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] px-[21px] pb-4">
            <div className="grid gap-[6px]">
              <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.5]">Build a small library of reusable visual directions for campaign art.</p>
              <span className="text-[var(--dim)] font-mono text-[8px] tracking-[.06em]">THE APPLIED CAMPAIGN STYLE REMAINS THE AUTHORITATIVE DEFAULT SNAPSHOT.</span>
            </div>
            <button className={primaryButtonClassName} type="button" onClick={openNew}><Plus size={14} /> NEW STYLE</button>
          </div>
          {error ? <p className="m-0 border-b border-[var(--line)] px-[21px] py-[11px] text-[var(--pink)] text-[10px]" role="alert">{error}</p> : null}
          {notice ? <p className="m-0 border-b border-[var(--line)] px-[21px] py-[11px] text-[var(--green)] font-mono text-[8px] tracking-[.08em]" role="status">{notice}</p> : null}
          {isLoading ? <p className="flex items-center gap-2 m-0 p-[18px_21px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]"><LoaderCircle className="animate-spin" size={14} /> LOADING STYLE LIBRARY...</p> : null}
          {!isLoading && !styles.length ? <p className="m-0 p-[18px_21px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">NO SAVED VISUAL STYLES YET.</p> : null}
          <div className="grid gap-px p-[10px]">
            {styles.map((style) => (
              <article key={style.id} className="grid gap-3 min-w-0 p-[13px] border border-[rgba(139,151,169,.2)] bg-[rgba(255,255,255,.018)]">
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 text-[12px] text-[var(--ink)]">{style.name}</h3>
                      <span className={`font-mono text-[7px] tracking-[.1em] ${style.status === "ready" ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>{style.status.toUpperCase()}</span>
                      {style.isApplied ? <span className="inline-flex items-center gap-1 text-[var(--cyan)] font-mono text-[7px] tracking-[.1em]"><Check size={11} /> CAMPAIGN DEFAULT</span> : null}
                    </div>
                    <p className="m-0 mt-2 text-[var(--muted)] text-[10px] leading-[1.5]">{style.visualStyle}</p>
                  </div>
                  {style.preview ? <div className="w-[58px] h-[58px] shrink-0 border border-[rgba(255,92,154,.35)] bg-center bg-cover" role="img" aria-label={`${style.name} preview`} style={{ backgroundImage: `url(${style.preview.signedUrl})` }} /> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={actionButtonClassName} type="button" disabled={isWorking} onClick={() => openEdit(style)}><Edit3 size={13} /> EDIT</button>
                  {!style.isApplied && style.status === "ready" ? <button className={actionButtonClassName} type="button" disabled={isWorking} onClick={() => void applyStyle(style)}><Check size={13} /> APPLY DEFAULT</button> : null}
                  <button className={actionButtonClassName} type="button" disabled={isWorking} onClick={() => setExpandedPreviewId((current) => current === style.id ? null : style.id)}><Sparkles size={13} /> {expandedPreviewId === style.id ? "HIDE PREVIEW" : style.preview ? "REPLACE PREVIEW" : "TEST WITH PREVIEW"}</button>
                  <button className="h-[32px] inline-flex items-center justify-center gap-2 px-[10px] border border-[rgba(255,92,154,.28)] bg-[rgba(255,92,154,.04)] text-[var(--pink)] font-mono text-[8px] tracking-[.1em] cursor-pointer hover:border-[var(--pink)] disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={isWorking} onClick={() => void deleteStyle(style)}><Trash2 size={13} /> DELETE</button>
                </div>
                {expandedPreviewId === style.id ? <VisualStylePreview campaignId={campaignId} style={style} onSaved={() => { setNotice("STYLE PREVIEW RETAINED."); reload(); }} /> : null}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
