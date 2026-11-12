import * as modelPicker from "@/components/archive/AiModelPicker";
import { describe, expect, it } from "vitest";

function getCatalogUrlBuilder() {
  const builder = Reflect.get(modelPicker, "buildAiModelCatalogUrl");
  expect(typeof builder).toBe("function");
  return typeof builder === "function"
    ? builder as (input: { campaignId: string; capability: "structured-text" | "image" }) => string
    : null;
}

describe("AI model catalog request", () => {
  it("keeps ordinary model discovery requests unchanged", () => {
    const buildUrl = getCatalogUrlBuilder();
    if (!buildUrl) return;

    expect(buildUrl({ campaignId: "campaign-id", capability: "image" }))
      .toBe("/api/ai/models?campaignId=campaign-id&capability=image&sort=most-popular");
  });
});
