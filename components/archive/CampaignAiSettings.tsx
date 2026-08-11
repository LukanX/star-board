"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Plus, Save, SlidersHorizontal, X } from "lucide-react";
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

type CampaignAiSettingsProps = {
  campaignId: string | null;
};

type ModelFilter = "all" | AiCapability;
type AiModelSort = "most-popular" | "pricing-low-to-high" | "pricing-high-to-low";

const capabilityLabels: Record<ModelFilter, string> = {
  all: "ALL MODELS",
  "structured-text": "TEXT DRAFTS",
  image: "IMAGE ART",
};

const sortOptions: Array<{ value: AiModelSort; label: string }> = [
  { value: "most-popular", label: "MOST POPULAR" },
  { value: "pricing-low-to-high", label: "PRICE: LOW TO HIGH" },
  { value: "pricing-high-to-low", label: "PRICE: HIGH TO LOW" },
];

export default function CampaignAiSettings({ campaignId }: CampaignAiSettingsProps) {
  const [models, setModels] = useState<AiModel[]>([]);
  const [enabledModelIds, setEnabledModelIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<ModelFilter>("all");
  const [sort, setSort] = useState<AiModelSort>("most-popular");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Loading campaign model access...");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedCampaignId, setLoadedCampaignId] = useState<string | null>(null);
  const [loadedSort, setLoadedSort] = useState<AiModelSort | null>(null);
  const loadedCampaignRef = useRef<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      loadedCampaignRef.current = null;
      return;
    }

    let cancelled = false;
    const query = new URLSearchParams({ sort });
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/ai-settings?${query.toString()}`).then(async (response) => {
      const result = (await response.json()) as { models?: AiModel[]; enabledModelIds?: string[]; status?: "live" | "stale" | "unavailable"; error?: string };
      if (!response.ok || !result.models || !result.enabledModelIds) throw new Error(result.error ?? "Campaign model settings are unavailable.");
      if (cancelled) return;
      setModels(result.models);
      if (loadedCampaignRef.current !== campaignId) {
        setEnabledModelIds(result.enabledModelIds);
        loadedCampaignRef.current = campaignId;
      }
      setLoadedCampaignId(campaignId);
      setLoadedSort(sort);
      setStatus(`${result.status === "live" ? "Live" : result.status === "stale" ? "Cached" : "Offline"} OpenRouter catalog // choose which models GMs can use for this campaign.`);
    }).catch((loadError: unknown) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : "Campaign model settings are unavailable.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [campaignId, sort]);

  const addModel = (modelId: string) => {
    setSaved(false);
    setError(null);
    setEnabledModelIds((current) => current.includes(modelId) ? current : [...current, modelId]);
  };

  const removeModel = (modelId: string) => {
    setSaved(false);
    setError(null);
    setEnabledModelIds((current) => current.filter((id) => id !== modelId));
  };

  const activeModels = loadedCampaignId === campaignId ? models : [];
  const isLoading = Boolean(campaignId) && (loadedCampaignId !== campaignId || loadedSort !== sort);

  const save = async () => {
    if (!campaignId) return;

    if (!activeModels.some((model) => model.capability === "structured-text" && enabledModelIds.includes(model.id))) {
      setError("Add at least one text model before saving.");
      return;
    }

    if (!activeModels.some((model) => model.capability === "image" && enabledModelIds.includes(model.id))) {
      setError("Add at least one image model before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModelIds }),
      });
      const result = (await response.json()) as { enabledModelIds?: string[]; error?: string };
      if (!response.ok || !result.enabledModelIds) throw new Error(result.error ?? "Campaign model settings could not be saved.");
      setEnabledModelIds(result.enabledModelIds);
      setSaved(true);
      setStatus("Campaign model access updated.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Campaign model settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const selectedTextModels = uniqueModels(activeModels.filter((model) => model.capability === "structured-text" && enabledModelIds.includes(model.id)));
  const selectedImageModels = uniqueModels(activeModels.filter((model) => model.capability === "image" && enabledModelIds.includes(model.id)));
  const visibleModels = uniqueModels(activeModels.filter((model) => (filter === "all" || model.capability === filter) && (!normalizedSearch || `${model.label} ${model.id} ${model.providerName ?? ""}`.toLowerCase().includes(normalizedSearch))));
  const addableModels = visibleModels.filter((model) => !enabledModelIds.includes(model.id));

  return <section className="panel campaign-ai-settings">
    <div className="panel-topline"><div><p className="eyebrow">GM CONTROL // AI ACCESS</p><h2>Campaign model access</h2></div><SlidersHorizontal size={17} className="accent-icon-cyan" /></div>
    <div className="campaign-ai-settings-copy"><p>Choose the models available during this campaign&apos;s text and image generation.</p><span>Add models from the catalog below. At least one text model and one image model are required to save.</span></div>
    <p className="campaign-ai-settings-status"><span className="live-dot" /> {campaignId ? status : "Select a campaign to manage model access."}</p>
    {error ? <p className="form-error campaign-ai-settings-error" role="alert">{error}</p> : null}
    <div className="campaign-ai-selected-columns">
      <div className="campaign-ai-selected-group">
        <div className="campaign-ai-group-heading"><span>TEXT MODELS</span><small>{selectedTextModels.length} SELECTED</small></div>
        <div className="campaign-ai-selected-list">{selectedTextModels.map((model) => <article className="campaign-ai-selected-model" key={model.id}><span className="campaign-ai-model-copy"><strong>{model.label}</strong><small className="campaign-ai-model-pricing">{formatAiModelPricing(model.capability, model.pricing)}</small></span><button aria-label={`Remove ${model.label}`} className="button button-secondary campaign-ai-remove-button" onClick={() => removeModel(model.id)} type="button"><X size={13} /> REMOVE</button></article>)}{!selectedTextModels.length ? <p className="campaign-ai-model-empty">NO TEXT MODELS ADDED.</p> : null}</div>
      </div>
      <div className="campaign-ai-selected-group">
        <div className="campaign-ai-group-heading"><span>IMAGE MODELS</span><small>{selectedImageModels.length} SELECTED</small></div>
        <div className="campaign-ai-selected-list">{selectedImageModels.map((model) => <article className="campaign-ai-selected-model" key={model.id}><span className="campaign-ai-model-copy"><strong>{model.label}</strong><small className="campaign-ai-model-pricing">{formatAiModelPricing(model.capability, model.pricing)}</small></span><button aria-label={`Remove ${model.label}`} className="button button-secondary campaign-ai-remove-button" onClick={() => removeModel(model.id)} type="button"><X size={13} /> REMOVE</button></article>)}{!selectedImageModels.length ? <p className="campaign-ai-model-empty">NO IMAGE MODELS ADDED.</p> : null}</div>
      </div>
    </div>
    <div className="campaign-ai-model-toolbar">
      <label>MODEL USE<select aria-label="Filter AI models by capability" value={filter} onChange={(event) => setFilter(event.target.value as ModelFilter)}>{Object.entries(capabilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>SORT<select aria-label="Sort campaign AI models" value={sort} onChange={(event) => setSort(event.target.value as AiModelSort)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="campaign-ai-model-search">FIND MODEL<input aria-label="Find campaign AI model" placeholder="NAME, ID, OR PROVIDER" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    </div>
    <div className="campaign-ai-model-groups"><div className="campaign-ai-group-heading"><span>ADD MODELS // {capabilityLabels[filter]}</span><small>{addableModels.length} AVAILABLE</small></div><div className="campaign-ai-model-list">{isLoading ? <p className="campaign-ai-model-empty">LOADING MODEL CATALOG...</p> : addableModels.map((model) => {
      const isUnavailable = !model.compatible;
      return <article className={`campaign-ai-model ${isUnavailable ? "campaign-ai-model-unavailable" : ""}`} key={model.id}>
        <span className="campaign-ai-model-copy"><strong>{model.label}</strong><small className="campaign-ai-model-pricing">{formatAiModelPricing(model.capability, model.pricing)}</small></span>
        <button aria-label={`Add ${model.label}`} className="button button-secondary campaign-ai-add-button" disabled={isUnavailable} onClick={() => addModel(model.id)} type="button"><Plus size={13} /> {isUnavailable ? "UNAVAILABLE" : "ADD"}</button>
      </article>;
    })}{!isLoading && !addableModels.length ? <p className="campaign-ai-model-empty">{visibleModels.length ? "ALL MATCHING MODELS ARE ALREADY ADDED." : "NO MODELS MATCH THIS FILTER."}</p> : null}</div></div>
    <div className="campaign-ai-settings-actions"><button className="button button-primary" disabled={isSaving || !activeModels.length} onClick={() => void save()} type="button">{isSaving ? <><LoaderCircle className="spin" size={14} /> SAVING...</> : saved ? <><Check size={14} /> SAVED</> : <><Save size={14} /> SAVE MODEL ACCESS</>}</button></div>
  </section>;
}

function uniqueModels(models: AiModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}
