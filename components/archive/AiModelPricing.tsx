"use client";

import { useEffect, useRef, useState } from "react";
import { formatAiImagePricing, formatAiModelPricing } from "@/lib/ai/model-pricing";
import type { AiCapability } from "@/lib/ai/model-catalog";
import type { AiImagePrice } from "@/lib/ai/image-pricing";

type PricingStatus = "loading" | "live" | "stale" | "unavailable";

type PricingSnapshot = {
  status: PricingStatus;
  prices: AiImagePrice[];
};

type CachedPricing = {
  expiresAt: number;
  snapshot: PricingSnapshot;
};

type AiModelPricingProps = {
  campaignId: string | null;
  modelId: string;
  capability: AiCapability;
  pricing: Record<string, string> | null;
  className?: string;
  defer?: boolean;
};

const clientPricingCache = new Map<string, CachedPricing>();

export default function AiModelPricing({ campaignId, modelId, capability, pricing, className, defer = false }: AiModelPricingProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
  const [state, setState] = useState<{ key: string; snapshot: PricingSnapshot }>({
    key: "",
    snapshot: { status: "unavailable", prices: [] },
  });
  const cacheKey = `${campaignId ?? "none"}:${modelId}`;
  const isVisible = !defer || hasEnteredViewport || typeof IntersectionObserver === "undefined";

  useEffect(() => {
    if (!defer || typeof IntersectionObserver === "undefined") return;

    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setHasEnteredViewport(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [defer, modelId]);

  useEffect(() => {
    if (capability !== "image") return;
    if (!campaignId) return;
    if (!isVisible) return;

    const cached = clientPricingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return;

    const controller = new AbortController();
    void fetch(`/api/ai/models/pricing?campaignId=${encodeURIComponent(campaignId)}&modelId=${encodeURIComponent(modelId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as Partial<PricingSnapshot>;
        if (!response.ok || !Array.isArray(result.prices) || !isPricingStatus(result.status)) {
          throw new Error("Image pricing is unavailable.");
        }

        const snapshot = { status: result.status, prices: result.prices };
        clientPricingCache.set(cacheKey, {
          expiresAt: Date.now() + (snapshot.status === "unavailable" ? 30_000 : 5 * 60_000),
          snapshot,
        });
        setState({ key: cacheKey, snapshot });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const snapshot: PricingSnapshot = { status: "unavailable", prices: [] };
        clientPricingCache.set(cacheKey, { expiresAt: Date.now() + 30_000, snapshot });
        setState({ key: cacheKey, snapshot });
      });

    return () => controller.abort();
  }, [cacheKey, campaignId, capability, isVisible, modelId]);

  if (capability !== "image") {
    return <small className={className}>{formatAiModelPricing(capability, pricing)}</small>;
  }

  const cachedSnapshot = clientPricingCache.get(cacheKey);
  const snapshot = !campaignId
    ? { status: "unavailable" as const, prices: [] }
    : state.key === cacheKey
      ? state.snapshot
      : cachedSnapshot?.snapshot ?? null;
  const value = !snapshot
    ? "LOADING IMAGE PRICING..."
    : snapshot.status === "loading"
      ? "LOADING IMAGE PRICING..."
      : snapshot.status === "unavailable"
        ? "IMAGE PRICING UNAVAILABLE"
        : `${snapshot.status === "stale" ? "CACHED // " : ""}${formatAiImagePricing(snapshot.prices)}`;

  return <small ref={elementRef} className={className} aria-live="polite">{value}</small>;
}

function isPricingStatus(value: unknown): value is Exclude<PricingStatus, "loading"> {
  return value === "live" || value === "stale" || value === "unavailable";
}