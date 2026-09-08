import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireCampaignGM: vi.fn() }));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));

import { POST } from "@/app/api/campaigns/[campaignId]/visual-styles/route";

const campaignId = "00000000-0000-4000-8000-000000000001";

function routeContext() {
  return { params: Promise.resolve({ campaignId }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/visual-styles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("campaign visual styles route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires GM access", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await POST(request({ name: "Neon frontier", visualStyle: "Crisp ink and neon light." }), routeContext());

    expect(response.status).toBe(403);
  });

  it("creates and applies a ready style through the atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "style-id", error: null });
    mocks.requireCampaignGM.mockResolvedValue({ supabase: { rpc }, user: { id: "user-id" }, role: "gm" });

    const response = await POST(request({
      name: "Neon frontier",
      visualStyle: "Crisp ink and neon light.",
      status: "ready",
      apply: true,
    }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ styleId: "style-id" });
    expect(rpc).toHaveBeenCalledWith("create_and_apply_campaign_visual_style", {
      p_campaign_id: campaignId,
      p_name: "Neon frontier",
      p_visual_style: "Crisp ink and neon light.",
      p_wizard_inputs: { artDirection: "choose-for-me" },
    });
  });

  it("rejects applying a draft", async () => {
    mocks.requireCampaignGM.mockResolvedValue({ supabase: { rpc: vi.fn() }, user: { id: "user-id" }, role: "gm" });

    const response = await POST(request({
      name: "Scratch",
      visualStyle: "Loose painted shapes.",
      status: "draft",
      apply: true,
    }), routeContext());

    expect(response.status).toBe(400);
  });
});