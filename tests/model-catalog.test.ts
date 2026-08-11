import { describe, expect, it } from "vitest";
import { AiModelSelectionError, getCuratedAiModels, resolveAiModel } from "@/lib/ai/model-catalog";

describe("curated AI model catalog", () => {
  it("keeps text and image capabilities separated", () => {
    expect(getCuratedAiModels("structured-text").every((model) => model.capability === "structured-text")).toBe(true);
    expect(getCuratedAiModels("image").every((model) => model.capability === "image")).toBe(true);
  });

  it("resolves an omitted model to the configured capability default", () => {
    expect(resolveAiModel("structured-text", undefined, "openai/gpt-4o-mini").id).toBe("openai/gpt-4o-mini");
  });

  it("rejects arbitrary and cross-capability model IDs", () => {
    expect(() => resolveAiModel("structured-text", "provider/arbitrary-model", "openai/gpt-4o-mini")).toThrow(AiModelSelectionError);
    expect(() => resolveAiModel("structured-text", "openai/gpt-image-1", "openai/gpt-4o-mini")).toThrow(AiModelSelectionError);
  });

  it("rejects disabled models and falls back to an enabled model for omitted selections", () => {
    expect(() => resolveAiModel("structured-text", "openai/gpt-4o", "openai/gpt-4o-mini", ["openai/gpt-4o-mini"])).toThrow("disabled for this campaign");
    expect(resolveAiModel("structured-text", undefined, "openai/gpt-4o", ["openai/gpt-4o-mini"]).id).toBe("openai/gpt-4o-mini");
  });
});