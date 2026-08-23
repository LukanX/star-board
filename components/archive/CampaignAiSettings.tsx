"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  LoaderCircle,
  Plus,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { formatAiModelPricing } from "@/lib/ai/model-pricing";
import { panelClassName } from "@/components/ui/recordStyles";
import {
  accentIconCyanClassName,
  eyebrowClassName,
  liveDotClassName,
} from "@/components/ui/terminalStyles";

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
type AiModelSort =
  "most-popular" | "pricing-low-to-high" | "pricing-high-to-low";

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

const modelActionClassName =
  "h-[30px] min-h-[30px] flex-[0_0_auto] inline-flex items-center justify-center gap-2 px-2 border border-[var(--line)] text-[var(--ink)] font-mono text-[8px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]";
const modelControlClassName =
  "w-full min-w-0 h-[35px] border border-[rgba(139,151,169,.28)] outline-none px-[10px] bg-[#0a1118] text-[var(--ink)] font-mono text-[9px] focus:border-[var(--cyan)] focus:shadow-[0_0_0_2px_rgba(98,232,255,.1)] placeholder:text-[#4d5a6b]";
const modelLabelClassName =
  "grid gap-[5px] min-w-0 text-[var(--dim)] font-mono text-[7px] tracking-[.08em]";
const modelGroupHeadingClassName =
  "flex items-center justify-between gap-[10px] p-[13px_16px_10px] text-[var(--cyan)] font-mono text-[8px] tracking-[.12em]";
const modelCopyClassName = "w-full min-w-0 flex-1";
const modelArticleClassName =
  "flex w-full min-w-0 items-center gap-[10px] min-h-[65px] p-[9px_8px] border border-transparent bg-[rgba(255,255,255,.018)] hover:border-[rgba(98,232,255,.28)] hover:bg-[rgba(98,232,255,.045)]";

export default function CampaignAiSettings({
  campaignId,
}: CampaignAiSettingsProps) {
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
    void fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/ai-settings?${query.toString()}`,
    )
      .then(async (response) => {
        const result = (await response.json()) as {
          models?: AiModel[];
          enabledModelIds?: string[];
          status?: "live" | "stale" | "unavailable";
          error?: string;
        };
        if (!response.ok || !result.models || !result.enabledModelIds)
          throw new Error(
            result.error ?? "Campaign model settings are unavailable.",
          );
        if (cancelled) return;
        setModels(result.models);
        if (loadedCampaignRef.current !== campaignId) {
          setEnabledModelIds(result.enabledModelIds);
          loadedCampaignRef.current = campaignId;
        }
        setLoadedCampaignId(campaignId);
        setLoadedSort(sort);
        setStatus(
          `${result.status === "live" ? "Live" : result.status === "stale" ? "Cached" : "Offline"} OpenRouter catalog // choose which models GMs can use for this campaign.`,
        );
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Campaign model settings are unavailable.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, sort]);

  const addModel = (modelId: string) => {
    setSaved(false);
    setError(null);
    setEnabledModelIds((current) =>
      current.includes(modelId) ? current : [...current, modelId],
    );
  };

  const removeModel = (modelId: string) => {
    setSaved(false);
    setError(null);
    setEnabledModelIds((current) => current.filter((id) => id !== modelId));
  };

  const activeModels = loadedCampaignId === campaignId ? models : [];
  const isLoading =
    Boolean(campaignId) &&
    (loadedCampaignId !== campaignId || loadedSort !== sort);

  const save = async () => {
    if (!campaignId) return;

    if (
      !activeModels.some(
        (model) =>
          model.capability === "structured-text" &&
          enabledModelIds.includes(model.id),
      )
    ) {
      setError("Add at least one text model before saving.");
      return;
    }

    if (
      !activeModels.some(
        (model) =>
          model.capability === "image" && enabledModelIds.includes(model.id),
      )
    ) {
      setError("Add at least one image model before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/ai-settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabledModelIds }),
        },
      );
      const result = (await response.json()) as {
        enabledModelIds?: string[];
        error?: string;
      };
      if (!response.ok || !result.enabledModelIds)
        throw new Error(
          result.error ?? "Campaign model settings could not be saved.",
        );
      setEnabledModelIds(result.enabledModelIds);
      setSaved(true);
      setStatus("Campaign model access updated.");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Campaign model settings could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const selectedTextModels = uniqueModels(
    activeModels.filter(
      (model) =>
        model.capability === "structured-text" &&
        enabledModelIds.includes(model.id),
    ),
  );
  const selectedImageModels = uniqueModels(
    activeModels.filter(
      (model) =>
        model.capability === "image" && enabledModelIds.includes(model.id),
    ),
  );
  const visibleModels = uniqueModels(
    activeModels.filter(
      (model) =>
        (filter === "all" || model.capability === filter) &&
        (!normalizedSearch ||
          `${model.label} ${model.id} ${model.providerName ?? ""}`
            .toLowerCase()
            .includes(normalizedSearch)),
    ),
  );
  const addableModels = visibleModels.filter(
    (model) => !enabledModelIds.includes(model.id),
  );

  return (
    <section data-campaign-ai-settings className={`${panelClassName} w-full min-w-0 pt-px`}>
      <div className="panel-topline flex items-start justify-between px-[21px] pb-3 pt-5">
        <div>
          <p className={`${eyebrowClassName} !mb-2`}>GM CONTROL // AI ACCESS</p>
          <h2>Campaign model access</h2>
        </div>
          <SlidersHorizontal size={17} className={accentIconCyanClassName} />
      </div>
      <div className="grid gap-[6px] px-[21px] pb-4 border-b border-[var(--line)]">
        <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.5]">
          Choose the models available during this campaign&apos;s text and image
          generation.
        </p>
        <span className="m-0 text-[var(--dim)] font-mono text-[8px] tracking-[.06em] leading-[1.5]">
          Add models from the catalog below. At least one text model and one
          image model are required to save.
        </span>
      </div>
      <p className="flex items-center gap-[7px] m-0 p-[12px_21px] text-[var(--dim)] font-mono text-[8px] tracking-[.06em] leading-[1.5]">
              <span className={liveDotClassName} />{" "}
        {campaignId ? status : "Select a campaign to manage model access."}
      </p>
      {error ? (
        <p
          className="m-0 mx-[21px] mb-3 text-[var(--pink)] text-[10px]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 w-full min-w-0 border-y border-[var(--line)] max-[760px]:grid-cols-1">
        <div className="min-w-0">
          <div className={modelGroupHeadingClassName}>
            <span>TEXT MODELS</span>
            <small className="text-[var(--dim)] text-[7px]">
              {selectedTextModels.length} SELECTED
            </small>
          </div>
          <div className="grid min-w-0 gap-px min-h-[90px] p-[0_10px_10px]">
            {selectedTextModels.map((model) => (
              <article className={modelArticleClassName} key={model.id}>
                <span className={modelCopyClassName}>
                  <strong className="block overflow-wrap-anywhere text-[var(--ink)] text-[11px] font-semibold leading-[1.25]">
                    {model.label}
                  </strong>
                  <small className="block mt-[9px] overflow-wrap-anywhere text-[var(--dim)] text-[10px] leading-[1.5] tracking-[.03em] [word-spacing:.12em]">
                    {formatAiModelPricing(model.capability, model.pricing)}
                  </small>
                </span>
                <button
                  aria-label={`Remove ${model.label}`}
                  className={modelActionClassName}
                  onClick={() => removeModel(model.id)}
                  type="button"
                >
                  <X size={13} /> REMOVE
                </button>
              </article>
            ))}
            {!selectedTextModels.length ? (
              <p className="m-[4px_8px_12px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
                NO TEXT MODELS ADDED.
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 border-l border-[var(--line)] max-[760px]:border-l-0 max-[760px]:border-t max-[760px]:border-[var(--line)]">
          <div className={modelGroupHeadingClassName}>
            <span>IMAGE MODELS</span>
            <small className="text-[var(--dim)] text-[7px]">
              {selectedImageModels.length} SELECTED
            </small>
          </div>
          <div className="grid min-w-0 gap-px min-h-[90px] p-[0_10px_10px]">
            {selectedImageModels.map((model) => (
              <article className={modelArticleClassName} key={model.id}>
                <span className={modelCopyClassName}>
                  <strong className="block overflow-wrap-anywhere text-[var(--ink)] text-[11px] font-semibold leading-[1.25]">
                    {model.label}
                  </strong>
                  <small className="block mt-[9px] overflow-wrap-anywhere text-[var(--dim)] text-[10px] leading-[1.5] tracking-[.03em] [word-spacing:.12em]">
                    {formatAiModelPricing(model.capability, model.pricing)}
                  </small>
                </span>
                <button
                  aria-label={`Remove ${model.label}`}
                  className={modelActionClassName}
                  onClick={() => removeModel(model.id)}
                  type="button"
                >
                  <X size={13} /> REMOVE
                </button>
              </article>
            ))}
            {!selectedImageModels.length ? (
              <p className="m-[4px_8px_12px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
                NO IMAGE MODELS ADDED.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(150px,.7fr)_minmax(170px,.8fr)_minmax(220px,1.5fr)] gap-2 p-[13px_21px] border-b border-[var(--line)] max-[760px]:grid-cols-2 max-[760px]:px-4">
        <label className={modelLabelClassName}>
          MODEL USE
          <select
            className={modelControlClassName}
            aria-label="Filter AI models by capability"
            value={filter}
            onChange={(event) => setFilter(event.target.value as ModelFilter)}
          >
            {Object.entries(capabilityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={modelLabelClassName}>
          SORT
          <select
            className={modelControlClassName}
            aria-label="Sort campaign AI models"
            value={sort}
            onChange={(event) => setSort(event.target.value as AiModelSort)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className={`${modelLabelClassName} max-[760px]:col-span-2 max-[420px]:col-span-1`}
        >
          FIND MODEL
          <input
            className={modelControlClassName}
            aria-label="Find campaign AI model"
            placeholder="NAME, ID, OR PROVIDER"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="w-full min-w-0">
        <div className={modelGroupHeadingClassName}>
          <span>ADD MODELS // {capabilityLabels[filter]}</span>
          <small className="text-[var(--dim)] text-[7px]">
            {addableModels.length} AVAILABLE
          </small>
        </div>
        <div className="grid w-full min-w-0 gap-px p-[0_10px_10px]">
          {isLoading ? (
            <p className="m-[4px_8px_12px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
              LOADING MODEL CATALOG...
            </p>
          ) : (
            addableModels.map((model) => {
              const isUnavailable = !model.compatible;
              return (
                <article
                  className={`${modelArticleClassName} ${isUnavailable ? "cursor-not-allowed opacity-55" : ""}`}
                  key={model.id}
                >
                  <span className={modelCopyClassName}>
                    <strong className="block overflow-wrap-anywhere text-[var(--ink)] text-[11px] font-semibold leading-[1.25]">
                      {model.label}
                    </strong>
                    <small className="block mt-[9px] overflow-wrap-anywhere text-[var(--dim)] text-[10px] leading-[1.5] tracking-[.03em] [word-spacing:.12em]">
                      {formatAiModelPricing(model.capability, model.pricing)}
                    </small>
                  </span>
                  <button
                    aria-label={`Add ${model.label}`}
                    className={modelActionClassName}
                    disabled={isUnavailable}
                    onClick={() => addModel(model.id)}
                    type="button"
                  >
                    <Plus size={13} /> {isUnavailable ? "UNAVAILABLE" : "ADD"}
                  </button>
                </article>
              );
            })
          )}
          {!isLoading && !addableModels.length ? (
            <p className="m-[4px_8px_12px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">
              {visibleModels.length
                ? "ALL MATCHING MODELS ARE ALREADY ADDED."
                : "NO MODELS MATCH THIS FILTER."}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end p-[15px_21px_20px] border-t border-[var(--line)]">
        <button
          className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff] min-w-[166px]"
          disabled={isSaving || !activeModels.length}
          onClick={() => void save()}
          type="button"
        >
          {isSaving ? (
            <>
              <LoaderCircle className="animate-spin" size={14} /> SAVING...
            </>
          ) : saved ? (
            <>
              <Check size={14} /> SAVED
            </>
          ) : (
            <>
              <Save size={14} /> SAVE MODEL ACCESS
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function uniqueModels(models: AiModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}
