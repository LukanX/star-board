import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCampaignGM: vi.fn(),
  removeCampaignArtIfUnreferenced: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({ requireCampaignGM: mocks.requireCampaignGM }));
vi.mock("@/lib/storage/campaign-art", () => ({ removeCampaignArtIfUnreferenced: mocks.removeCampaignArtIfUnreferenced }));

import { POST } from "@/app/api/campaigns/[campaignId]/visual-styles/[styleId]/preview/route";
import { DELETE, PATCH } from "@/app/api/campaigns/[campaignId]/visual-styles/[styleId]/route";

const campaignId = "00000000-0000-4000-8000-000000000001";
const styleId = "00000000-0000-4000-8000-000000000002";
const generationRunId = "00000000-0000-4000-8000-000000000003";
const previousPath = `${campaignId}/00000000-0000-4000-8000-000000000004/style-preview-${generationRunId}.png`;

function createQuery(result: unknown) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function routeContext() {
  return { params: Promise.resolve({ campaignId, styleId }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/visual-styles/${styleId}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function updateRequest(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${campaignId}/visual-styles/${styleId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("visual style preview routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires GM access before attaching a preview", async () => {
    mocks.requireCampaignGM.mockResolvedValue(null);

    const response = await POST(request({ generationRunId, prompt: "A prompt", expectedRevision: 1 }), routeContext());

    expect(response.status).toBe(403);
  });

  it("attaches a matching preview and cleans up the previous object", async () => {
    const query = createQuery({ data: { visual_style: "Crisp ink and neon light.", preview_path: previousPath }, error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue(query), rpc };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "00000000-0000-4000-8000-000000000005" }, role: "gm" });

    const response = await POST(request({ generationRunId, prompt: "A prompt", expectedRevision: 7 }), routeContext());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ styleId });
    expect(rpc).toHaveBeenCalledWith("attach_campaign_visual_style_preview", {
      p_style_id: styleId,
      p_generation_run_id: generationRunId,
      p_prompt: "A prompt",
      p_style_hash: "807ad00fddbfd2dbfa0a77bb5da4463bf2470f1163fd975d7aa1b06dcb46272b",
      p_expected_revision: 7,
    });
    expect(mocks.removeCampaignArtIfUnreferenced).toHaveBeenCalledWith(supabase, campaignId, previousPath);
  });

  it("maps an optimistic revision conflict to a reloadable response", async () => {
    const query = createQuery({ data: { visual_style: "Crisp ink and neon light.", preview_path: null }, error: null });
    const rpc = vi.fn().mockResolvedValue({ error: { code: "40001" } });
    const supabase = { from: vi.fn().mockReturnValue(query), rpc };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "00000000-0000-4000-8000-000000000005" }, role: "gm" });

    const response = await POST(request({ generationRunId, prompt: "A prompt", expectedRevision: 1 }), routeContext());

    expect(response.status).toBe(409);
    expect(mocks.removeCampaignArtIfUnreferenced).not.toHaveBeenCalled();
  });

  it("updates a style and replaces its preview through the atomic RPC", async () => {
    const query = createQuery({ data: { preview_path: previousPath }, error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue(query), rpc };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "00000000-0000-4000-8000-000000000005" }, role: "gm" });

    const response = await PATCH(updateRequest({
      name: "Updated frontier",
      visualStyle: "Updated ink and neon light.",
      status: "ready",
      wizardInputs: { artDirection: "inked-illustration" },
      expectedRevision: 7,
      apply: false,
      preview: { generationRunId, prompt: "A generated preview prompt" },
    }), routeContext());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_campaign_visual_style_with_preview", {
      p_style_id: styleId,
      p_name: "Updated frontier",
      p_visual_style: "Updated ink and neon light.",
      p_status: "ready",
      p_wizard_inputs: { artDirection: "inked-illustration" },
      p_expected_revision: 7,
      p_generation_run_id: generationRunId,
      p_prompt: "A generated preview prompt",
    });
    expect(mocks.removeCampaignArtIfUnreferenced).toHaveBeenCalledWith(supabase, campaignId, previousPath);
  });

  it("does not clean up the old preview when the atomic update fails", async () => {
    const query = createQuery({ data: { preview_path: previousPath }, error: null });
    const rpc = vi.fn().mockResolvedValue({ error: { code: "22023" } });
    const supabase = { from: vi.fn().mockReturnValue(query), rpc };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "00000000-0000-4000-8000-000000000005" }, role: "gm" });

    const response = await PATCH(updateRequest({
      name: "Updated frontier",
      visualStyle: "Updated ink and neon light.",
      status: "ready",
      wizardInputs: { artDirection: "inked-illustration" },
      expectedRevision: 7,
      preview: { generationRunId, prompt: "A generated preview prompt" },
    }), routeContext());

    expect(response.status).toBe(400);
    expect(mocks.removeCampaignArtIfUnreferenced).not.toHaveBeenCalled();
  });

  it("cleans up a deleted style preview after the delete RPC succeeds", async () => {
    const query = createQuery({ data: { preview_path: previousPath }, error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue(query), rpc };
    mocks.requireCampaignGM.mockResolvedValue({ supabase, user: { id: "00000000-0000-4000-8000-000000000005" }, role: "gm" });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), routeContext());

    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("delete_campaign_visual_style", { p_style_id: styleId });
    expect(mocks.removeCampaignArtIfUnreferenced).toHaveBeenCalledWith(supabase, campaignId, previousPath);
  });
});
