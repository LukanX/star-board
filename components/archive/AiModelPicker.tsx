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

type AiModelSort = "most-popular" | "pricing-low-to-high" | "pricing-high-to-low";

const sortOptions: Array<{ value: AiModelSort; label: string }> = [
  { value: "most-popular", label: "MOST POPULAR" },
  { value: "pricing-low-to-high", label: "PRICE: LOW TO HIGH" },
  { value: "pricing-high-to-low", label: "PRICE: HIGH TO LOW" },
];

export default function AiModelPicker({ campaignId, capability, value, onChange }: AiModelPickerProps) {
  const [sort, setSort] = useState<AiModelSort>("most-popular");
  const [search, setSearch] = useState("");
  const catalogKey = `${campaignId ?? "none"}:${capability}:${sort}`;
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

    void fetch(`/api/ai/models?campaignId=${encodeURIComponent(campaignId)}&capability=${encodeURIComponent(capability)}&sort=${encodeURIComponent(sort)}`).then(async (response) => {
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
  }, [campaignId, capability, catalogKey, onChange, sort]);

  const hasCurrentCatalog = Boolean(campaignId) && catalog.key === catalogKey;
  const visibleModels = hasCurrentCatalog ? catalog.models : [];
  const visibleStatus = campaignId ? (hasCurrentCatalog ? catalog.status : "loading") : "unavailable";
  const selectedModel = value ?? (hasCurrentCatalog ? catalog.defaultModel : null) ?? "";
  const selectedEntry = visibleModels.find((model) => model.id === selectedModel);
  const normalizedSearch = search.trim().toLowerCase();
  const matchingModels = normalizedSearch
    ? visibleModels.filter((model) => `${model.label} ${model.id} ${model.providerName ?? ""}`.toLowerCase().includes(normalizedSearch))
    : visibleModels;
  const optionModels = selectedEntry && !matchingModels.some((model) => model.id === selectedEntry.id) ? [selectedEntry, ...matchingModels] : matchingModels;

  return <div className="ai-model-picker">
    <span className="ai-model-picker-label">{capability === "image" ? "IMAGE MODEL" : "TEXT MODEL"}</span>
    <div className="ai-model-picker-controls">
      <label>FIND MODEL<input aria-label="Find AI model" placeholder="NAME OR PROVIDER" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>SORT<select aria-label="Sort AI models" value={sort} onChange={(event) => setSort(event.target.value as AiModelSort)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </div>
    <select className="ai-model-picker-select" aria-label={`${capability === "image" ? "Image" : "Text"} generation model`} disabled={!visibleModels.length} value={selectedEntry ? selectedModel : ""} onChange={(event) => onChange(event.target.value)}>
      <option value="" disabled>{visibleStatus === "loading" ? "LOADING CATALOG..." : matchingModels.length ? "SELECT A MODEL" : "NO MODELS MATCH FILTER"}</option>
      {optionModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
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