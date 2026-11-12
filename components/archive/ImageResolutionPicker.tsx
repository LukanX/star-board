"use client";

import type { AiModelOptions } from "./AiModelPicker";
import { getSupportedImageResolutions, type ImageResolution } from "@/lib/ai/image-options";

export default function ImageResolutionPicker({ options, value, disabled = false, ariaLabel = "Image resolution", onChange }: {
  options: AiModelOptions | null;
  value: ImageResolution | undefined;
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (resolution: ImageResolution) => void;
}) {
  const resolutions = getSupportedImageResolutions(options?.supportedParameters, options?.parameterValues);
  if (!options) return null;
  if (!resolutions.length) return <p role="status" className="m-0 text-xs text-[var(--muted)]">
    No selectable 1K, 2K or 4K resolutions are advertised for this model. The provider chooses the output size.
  </p>;
  return <label className="grid min-w-0 gap-2 font-mono text-[10px] tracking-[.08em] text-[var(--muted)]">
    Resolution
    <select aria-label={ariaLabel} disabled={disabled} value={value ?? resolutions[0]}
      className="h-[43px] w-full min-w-0 border border-[var(--line)] bg-[var(--background)] px-3 text-xs text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-50"
      onChange={(event) => {
        const selected = resolutions.find((resolution) => resolution === event.target.value);
        if (selected) onChange(selected);
      }}>
      {resolutions.map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
    </select>
    <span className="text-[9px] normal-case tracking-normal text-[var(--dim)]">Higher resolutions may cost more. Pixel dimensions vary by model.</span>
  </label>;
}
