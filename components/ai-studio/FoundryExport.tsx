"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { downloadArtBlob } from "@/components/ui/ArtDownloadButton";
import {
  getDefaultFoundryScale,
  getFoundryExportOptions,
  renderFoundryWebp,
  type FoundryExportOption,
  type FoundryExportScale,
} from "@/lib/art/foundry-export";
import { studioButton, studioGhostButton, studioInput, studioLabel } from "./studioStyles";

type ExportState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; image: ImageBitmap; options: FoundryExportOption[]; scale: FoundryExportScale };

function FoundryExportPanel({ src, name, disabled }: { src: string; name: string; disabled: boolean }) {
  const [state, setState] = useState<ExportState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let active = true;
    let decoded: ImageBitmap | undefined;

    void (async () => {
      try {
        const response = await fetch(src, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
        if (!response.ok) throw new Error("The battlemap could not be loaded. Refresh its preview and try again.");
        const blob = await response.blob();
        decoded = await createImageBitmap(blob);
        if (!active) {
          decoded.close();
          return;
        }
        const options = getFoundryExportOptions(decoded);
        setState({ status: "ready", image: decoded, options, scale: getDefaultFoundryScale(options) });
      } catch {
        if (active) {
          decoded?.close();
          decoded = undefined;
          setState({ status: "error", message: "The battlemap could not be loaded or decoded. Refresh its preview and try again." });
        }
      }
    })();

    return () => {
      active = false;
      mounted.current = false;
      controller.abort();
      decoded?.close();
    };
  }, [src, attempt]);

  async function download() {
    if (state.status !== "ready" || inFlight.current || disabled) return;
    inFlight.current = true;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await renderFoundryWebp(state.image, state.scale);
      if (mounted.current) downloadArtBlob(blob, `${name}-foundry-${state.scale}x`);
    } catch (error) {
      if (mounted.current) setDownloadError(error instanceof Error ? error.message : "The Foundry export could not be created.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setDownloading(false);
    }
  }

  return <section aria-label="Foundry battlemap export" className="min-w-0 space-y-3 border border-[var(--line)] p-3">
    <p className="m-0 text-xs text-[var(--muted)]">WebP export preserves the map layout. Enlarging adds pixels, not original detail; compression may change pixels slightly. Foundry grid alignment may still need adjustment.</p>
    {state.status === "loading" && <p role="status" className="m-0 flex items-center gap-2 text-xs text-[var(--cyan)]"><Loader2 aria-hidden="true" size={14} className="animate-spin" />Checking image dimensions...</p>}
    {state.status === "error" && <div className="space-y-2">
      <p role="alert" className="m-0 text-xs text-[var(--pink)]">{state.message}</p>
      <button type="button" className={studioButton} disabled={disabled} onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>Retry image</button>
    </div>}
    {state.status === "ready" && <>
      <label className={studioLabel}>Foundry export size
        <select aria-label="Foundry export size" className={studioInput} value={state.scale} disabled={disabled || downloading}
          onChange={(event) => {
            const option = state.options.find((candidate) => String(candidate.scale) === event.target.value && candidate.allowed);
            if (option) setState({ ...state, scale: option.scale });
          }}>
          {state.options.map((option) => <option key={option.scale} value={option.scale} disabled={!option.allowed}>
            {option.scale === 1 ? "Original" : `${option.scale}×`} — {option.width.toLocaleString()} × {option.height.toLocaleString()} pixels{option.allowed ? "" : " (exceeds limit)"}
          </option>)}
        </select>
      </label>
      <p className="m-0 text-xs text-[var(--muted)]">Output: {state.options.find((option) => option.scale === state.scale)?.width.toLocaleString()} × {state.options.find((option) => option.scale === state.scale)?.height.toLocaleString()} pixels</p>
      {state.options.some((option) => !option.allowed) && <p role="status" className="m-0 text-xs text-[var(--amber)]">Exports are limited to 8,192 pixels per edge and 64 million pixels total. Some devices may have lower limits.</p>}
      {downloadError && <p role="alert" className="m-0 break-words text-xs text-[var(--pink)]">{downloadError}</p>}
      <button type="button" className={studioButton} disabled={disabled || downloading || !state.options.find((option) => option.scale === state.scale)?.allowed} onClick={() => void download()}>
        {downloading ? <><Loader2 aria-hidden="true" size={14} className="animate-spin" />Preparing WebP...</> : <><Download aria-hidden="true" size={14} />Download WebP</>}
      </button>
    </>}
  </section>;
}

export default function FoundryExport({ src, name, disabled = false }: { src: string; name: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="min-w-0 space-y-2">
    <button type="button" className={studioGhostButton} disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      <Download aria-hidden="true" size={12} />Export for Foundry
    </button>
    <div id={id}>{open && <FoundryExportPanel key={src} src={src} name={name} disabled={disabled} />}</div>
  </div>;
}
