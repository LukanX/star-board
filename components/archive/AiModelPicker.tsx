"use client";

import { useEffect, useRef, useState } from "react";
import { formatAiModelPricing } from "@/lib/ai/model-pricing";

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
  reason?: string;
};

type AiModelPickerProps = {
  campaignId: string | null;
  capability: AiCapability;
  value: string | null;
  onChange: (model: string) => void;
};

type CatalogStatus = "live" | "stale" | "unavailable" | "loading";

type CatalogState = {
  key: string;
  models: AiModel[];
  defaultModel: string | null;
  status: CatalogStatus;
};

export default function AiModelPicker({ campaignId, capability, value, onChange }: AiModelPickerProps) {
  const catalogKey = `${campaignId ?? "none"}:${capability}`;
  const [catalog, setCatalog] = useState<CatalogState>({ key: "", models: [], defaultModel: null, status: "loading" });
  const selectedValueRef = useRef(value);

  useEffect(() => {
    selectedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    if (!campaignId) {
      return () => {
        cancelled = true;
      };
    }

    void fetch(`/api/ai/models?campaignId=${encodeURIComponent(campaignId)}&capability=${encodeURIComponent(capability)}&sort=most-popular`).then(async (response) => {
      const result = (await response.json()) as { defaultModel?: string; status?: "live" | "stale" | "unavailable"; models?: AiModel[] };
      if (!response.ok || !result.models) throw new Error("AI model catalog unavailable.");
      if (cancelled) return;

      const compatibleModels = uniqueModels(result.models.filter((model) => model.enabled !== false && (model.compatible || result.status === "unavailable")));
      setCatalog({ key: catalogKey, models: compatibleModels, defaultModel: result.defaultModel ?? compatibleModels[0]?.id ?? null, status: result.status ?? "unavailable" });

      if (!selectedValueRef.current || !compatibleModels.some((model) => model.id === selectedValueRef.current)) {
        const nextModel = result.defaultModel && compatibleModels.some((model) => model.id === result.defaultModel) ? result.defaultModel : compatibleModels[0]?.id;
        if (nextModel) onChange(nextModel);
      }
    }).catch(() => {
      if (!cancelled) setCatalog({ key: catalogKey, models: [], defaultModel: null, status: "unavailable" });
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, capability, catalogKey, onChange]);

  const hasCurrentCatalog = Boolean(campaignId) && catalog.key === catalogKey;
  const visibleModels = hasCurrentCatalog ? catalog.models : [];
  const visibleStatus = campaignId ? (hasCurrentCatalog ? catalog.status : "loading") : "unavailable";
  const selectedModel = value ?? (hasCurrentCatalog ? catalog.defaultModel : null) ?? "";
  const selectedEntry = visibleModels.find((model) => model.id === selectedModel);

  return <div className="ai-model-picker">
    <span className="ai-model-picker-label">{capability === "image" ? "IMAGE MODEL" : "TEXT MODEL"}</span>
    <select className="ai-model-picker-select" aria-label={`${capability === "image" ? "Image" : "Text"} generation model`} disabled={!visibleModels.length} value={selectedEntry ? selectedModel : ""} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled>{visibleStatus === "loading" ? "LOADING CATALOG..." : "SELECT A MODEL"}</option>
      {visibleModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
    </select>
    <span className="ai-model-picker-meta">{selectedEntry ? formatAiModelPricing(selectedEntry.capability, selectedEntry.pricing) : visibleStatus === "stale" ? "Using the last verified catalog." : visibleStatus === "unavailable" ? "Live model verification is unavailable." : ""}</span>
  </div>;
}

function uniqueModels(models: AiModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}