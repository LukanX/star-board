"use client";

import { useState } from "react";
import { Download, FileJson, LoaderCircle, X } from "lucide-react";
import { z } from "zod";

const exportPayloadSchema = z.object({
  actor: z.record(z.string(), z.unknown()),
  warnings: z.array(z.object({
    code: z.string(),
    message: z.string(),
    path: z.string().optional(),
  })),
  fileName: z.string().min(1),
});

type ExportPayload = z.infer<typeof exportPayloadSchema>;

const actionClassName = "h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-60";

function downloadActor(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload.actor, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = payload.fileName;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export default function EnemyFoundryExport({ campaignId, enemyId }: { campaignId: string; enemyId: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportData, setExportData] = useState<ExportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const prepareExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportData(null);
    setError(null);
    setStatus("");
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/enemies/${encodeURIComponent(enemyId)}/export/foundry`,
        { cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = z.object({ error: z.string(), errors: z.array(z.string()).optional() }).safeParse(payload);
        if (!failure.success) throw new Error("Foundry export could not be prepared.");
        throw new Error([failure.data.error, ...(failure.data.errors ?? [])].join(" "));
      }

      const parsed = exportPayloadSchema.safeParse(payload);
      if (!parsed.success) throw new Error("Foundry export returned an invalid response.");
      if (parsed.data.warnings.length) {
        setExportData(parsed.data);
        setStatus("Review the export warnings before downloading.");
      } else {
        downloadActor(parsed.data);
        setStatus("Foundry actor JSON downloaded.");
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Foundry export could not be prepared.");
    } finally {
      setIsExporting(false);
    }
  };

  return <>
    <button
      aria-busy={isExporting}
      aria-label="Export enemy to Foundry VTT"
      className={actionClassName}
      disabled={isExporting}
      onClick={() => void prepareExport()}
      type="button"
    >
      {isExporting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : <FileJson aria-hidden="true" size={15} />}
      {isExporting ? "PREPARING..." : "EXPORT FOUNDRY ACTOR"}
    </button>
    {error ? <p className="basis-full m-0 text-right font-mono text-[9px] text-[var(--pink)]" role="alert">{error}</p> : null}
    {status ? <p aria-live="polite" className="basis-full m-0 text-right font-mono text-[9px] text-[var(--muted)]">{status}</p> : null}
    {exportData ? <section aria-label="Foundry export warnings" className="basis-full min-w-0 border border-[rgba(245,184,75,.35)] bg-[rgba(245,184,75,.045)] p-3 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 font-mono text-[9px] text-[var(--amber)]">EXPORT REVIEW // FOUNDRY V14 / SF2E 1.6.1</p>
          <p className="mt-1 mb-0 text-[10px] text-[var(--muted)]">Some entries are text-only or need manual setup in Foundry.</p>
        </div>
        <button aria-label="Dismiss Foundry export review" className="grid h-7 w-7 shrink-0 place-items-center border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => { setExportData(null); setStatus(""); }} type="button">
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <ul className="my-3 grid gap-2 pl-4 font-mono text-[9px] leading-5 text-[var(--ink)]">
        {exportData.warnings.map((entry, index) => <li key={`${entry.code}:${entry.path ?? index}`}>
          {entry.message}{entry.path ? <span className="block break-all text-[var(--dim)]">{entry.path}</span> : null}
        </li>)}
      </ul>
      <button className={actionClassName} onClick={() => { downloadActor(exportData); setExportData(null); setStatus("Foundry actor JSON downloaded with the warnings shown above."); }} type="button">
        <Download aria-hidden="true" size={15} /> DOWNLOAD WITH WARNINGS
      </button>
    </section> : null}
  </>;
}