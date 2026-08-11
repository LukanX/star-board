import { describe, expect, it, vi } from "vitest";
import { loadCampaignAiSettings, validateEnabledAiModelIds } from "@/lib/ai/campaign-settings";

function supabaseFor(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })) };
}

describe("campaign AI settings", () => {
  it("starts a campaign with no enabled models when settings do not exist", async () => {
    const result = await loadCampaignAiSettings(supabaseFor(null) as never, "campaign-id", ["text/model", "image/model"]);

    expect(result).toEqual({ settings: { enabledModelIds: [] } });
  });

  it("filters persisted model IDs against the current catalog", async () => {
    const result = await loadCampaignAiSettings(supabaseFor({ enabled_model_ids: ["image/model", "removed/model"] }) as never, "campaign-id", ["text/model", "image/model"]);

    expect(result).toEqual({ settings: { enabledModelIds: ["image/model"] } });
  });

  it("does not persist duplicate IDs when a model supports both capabilities", () => {
    const result = validateEnabledAiModelIds(["shared/model", "image/model"], [
      { id: "shared/model", capability: "structured-text" },
      { id: "shared/model", capability: "image" },
      { id: "image/model", capability: "image" },
    ]);

    expect(result).toEqual({ enabledModelIds: ["shared/model", "image/model"] });
  });
});
