"use client";

import { useEffect, useRef, useState } from "react";
import AiModelPricing from "@/components/archive/AiModelPricing";

type AiCapability = "structured-text" | "image";

type AiModel = {
  id: string;
  label: string;
  capability: AiCapability;
  description: string;
  available: boolean;
  compatible: boolean;
  enabled: boolean;
  providerName: string | null;
  pricing: Record<string, string> | null;
  contextLength: number | null;
  inputModalities?: string[];
  supportedParameters?: string[];
  parameterValues?: Record<string, string[]>;
  reason?: string;
};

export type AiModelOptions = {
  supportedParameters: string[];
  parameterValues: Record<string, string[]>;
};

type AiModelPickerProps = {
  campaignId: string | null;
  capability: AiCapability;
  value: string | null;
  onChange: (model: string) => void;
  onModelOptionsChange?: (options: AiModelOptions | null) => void;
  requiresImageInput?: boolean;
};

type CatalogStatus = "live" | "stale" | "unavailable" | "loading";

type CatalogState = {
  key: string;
  models: AiModel[];
  defaultModel: string | null;
  status: CatalogStatus;
};

export default function AiModelPicker({
  campaignId,
  capability,
  value,
  onChange,
  onModelOptionsChange,
  requiresImageInput = false,
}: AiModelPickerProps) {
  const catalogKey = `${campaignId ?? "none"}:${capability}:${requiresImageInput ? "vision" : "all"}`;
  const [catalog, setCatalog] = useState<CatalogState>({
    key: "",
    models: [],
    defaultModel: null,
    status: "loading",
  });
  const selectedValueRef = useRef(value);

  useEffect(() => {
    selectedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    if (!campaignId) {
      onModelOptionsChange?.(null);
      return () => {
        cancelled = true;
      };
    }

    void fetch(
      `/api/ai/models?campaignId=${encodeURIComponent(campaignId)}&capability=${encodeURIComponent(capability)}&sort=most-popular`,
    )
      .then(async (response) => {
        const result = (await response.json()) as {
          defaultModel?: string;
          status?: "live" | "stale" | "unavailable";
          models?: AiModel[];
        };
        if (!response.ok || !result.models)
          throw new Error("AI model catalog unavailable.");
        if (cancelled) return;

        const compatibleModels = uniqueModels(
          result.models.filter(
            (model) =>
              model.enabled !== false &&
              (!requiresImageInput || model.inputModalities?.includes("image")) &&
              (model.compatible || result.status === "unavailable"),
          ),
        );
        setCatalog({
          key: catalogKey,
          models: compatibleModels,
          defaultModel: result.defaultModel ?? compatibleModels[0]?.id ?? null,
          status: result.status ?? "unavailable",
        });

        const selectedEntry = compatibleModels.find((model) => model.id === selectedValueRef.current);
        const nextModel = selectedEntry?.id ?? (
          result.defaultModel && compatibleModels.some((model) => model.id === result.defaultModel)
            ? result.defaultModel
            : compatibleModels[0]?.id
        );
        const nextEntry = compatibleModels.find((model) => model.id === nextModel);
        onModelOptionsChange?.(toModelOptions(nextEntry));
        if (!selectedEntry && nextModel) onChange(nextModel);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog({
            key: catalogKey,
            models: [],
            defaultModel: null,
            status: "unavailable",
          });
          onModelOptionsChange?.(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, capability, catalogKey, onChange, onModelOptionsChange, requiresImageInput]);

  const hasCurrentCatalog = Boolean(campaignId) && catalog.key === catalogKey;
  const visibleModels = hasCurrentCatalog ? catalog.models : [];
  const visibleStatus = campaignId
    ? hasCurrentCatalog
      ? catalog.status
      : "loading"
    : "unavailable";
  const selectedModel =
    value ?? (hasCurrentCatalog ? catalog.defaultModel : null) ?? "";
  const selectedEntry = visibleModels.find(
    (model) => model.id === selectedModel,
  );

  return (
    <div className="grid gap-[7px] w-full min-w-0 text-[var(--dim)] font-mono text-[8px] tracking-[.1em]">
      <span className="text-[var(--dim)]">
        {capability === "image" ? "IMAGE MODEL" : "TEXT MODEL"}
      </span>
      <select
        className="w-full min-w-0 h-[35px] border border-[rgba(139,151,169,.28)] outline-none px-[10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[9px] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)] disabled:text-[var(--dim)] disabled:cursor-wait !h-[43px] !text-[10px]"
        aria-label={`${capability === "image" ? "Image" : "Text"} generation model`}
        disabled={!visibleModels.length}
        value={selectedEntry ? selectedModel : ""}
        onChange={(event) => {
          const nextModel = event.target.value;
          onChange(nextModel);
          onModelOptionsChange?.(toModelOptions(visibleModels.find((model) => model.id === nextModel)));
        }}
      >
        <option value="" disabled>
          {visibleStatus === "loading"
            ? "LOADING CATALOG..."
            : "SELECT A MODEL"}
        </option>
        {visibleModels.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      {selectedEntry ? (
        <AiModelPricing
          campaignId={campaignId}
          modelId={selectedEntry.id}
          capability={selectedEntry.capability}
          pricing={selectedEntry.pricing}
          className="text-[var(--dim)] text-[10px] tracking-[.03em] leading-[1.5] [word-spacing:.12em]"
        />
      ) : (
        <span className="text-[var(--dim)] text-[10px] tracking-[.03em] leading-[1.5] [word-spacing:.12em]">
          {visibleStatus === "stale"
            ? "Using the last verified catalog."
            : visibleStatus === "unavailable"
              ? "Live model verification is unavailable."
              : ""}
        </span>
      )}
    </div>
  );
}

function toModelOptions(model: AiModel | undefined): AiModelOptions | null {
  if (!model) return null;
  return {
    supportedParameters: model.supportedParameters ?? [],
    parameterValues: model.parameterValues ?? {},
  };
}

function uniqueModels(models: AiModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}
