import { NextResponse } from "next/server";
import { z } from "zod";
import { aiModelSorts, getAiModelCatalog, getLocalAiModelCatalog, type AiModelSort } from "@/lib/ai/model-discovery";
import { loadCampaignAiSettings, loadCampaignVisualStyle, validateEnabledAiModelIds } from "@/lib/ai/campaign-settings";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { aiCapabilities, type AiCapability } from "@/lib/ai/model-catalog";
import { getCampaignCredentialStatusForManager, getCampaignCredentialForGeneration } from "@/lib/ai/campaign-credentials";
import { campaignCredentialErrorResponse } from "@/lib/ai/route-support";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string }> };

const updateSettingsSchema = z.object({
  visualStyle: z.string().min(1).max(1200).refine((value) => value === value.trim(), "Visual style must not have leading or trailing whitespace.").optional(),
  enabledModelIds: z.array(z.string().trim().min(1).max(240)).min(1).max(2000).optional(),
}).refine((value) => value.visualStyle !== undefined || value.enabledModelIds !== undefined, "At least one campaign AI setting is required.");

const capabilitySchema = z.enum(aiCapabilities);
const sortSchema = z.enum(aiModelSorts);

async function getContext(campaignId: string) {
  const context = await requireCampaignGM(campaignId);

  if (!context) {
    return { response: NextResponse.json({ error: "GM access is required to manage campaign AI settings." }, { status: 403 }) };
  }

  return { context };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const searchParams = new URL(_request.url).searchParams;
  const capabilityResult = searchParams.get("capability") ? capabilitySchema.safeParse(searchParams.get("capability")) : null;
  const sortResult = sortSchema.safeParse(searchParams.get("sort") ?? "most-popular");

  if (capabilityResult && !capabilityResult.success || !sortResult.success) {
    return NextResponse.json({ error: "Supported AI capability and model sort are required." }, { status: 400 });
  }

  try {
    const result = await getContext(campaignId);
    if (result.response) return result.response;

    const sort = sortResult.data as AiModelSort;
    const credentialResult = await getCampaignCredentialStatusForManager(campaignId, result.context.supabase, result.context.user.id);
    let textCatalog = getLocalAiModelCatalog("structured-text");
    let imageCatalog = getLocalAiModelCatalog("image");
    let credentialAvailable = false;

    if (credentialResult.status.verificationStatus === "verified") {
      try {
        const campaignCredential = await getCampaignCredentialForGeneration(campaignId);
        [textCatalog, imageCatalog] = await Promise.all([
          getAiModelCatalog(campaignCredential.apiKey, "structured-text", sort),
          getAiModelCatalog(campaignCredential.apiKey, "image", sort),
        ]);
        credentialAvailable = true;
      } catch {
        credentialAvailable = false;
      }
    }

    const availableModels = [...textCatalog.models, ...imageCatalog.models].filter((model) => model.compatible);
    const settingsResult = await loadCampaignAiSettings(result.context.supabase, campaignId, availableModels.map((model) => model.id));
    if ("error" in settingsResult) return NextResponse.json({ error: settingsResult.error }, { status: 503 });
    const visualStyleResult = await loadCampaignVisualStyle(result.context.supabase, campaignId);
    if ("error" in visualStyleResult) return NextResponse.json({ error: visualStyleResult.error }, { status: 503 });

    const models = [...textCatalog.models, ...imageCatalog.models]
      .filter((model) => !capabilityResult || model.capability === (capabilityResult.data as AiCapability))
      .map((model) => ({
      ...model,
      enabled: settingsResult.settings.enabledModelIds.includes(model.id),
      }));

    const statuses = [textCatalog.status, imageCatalog.status];
    const status = statuses.every((catalogStatus) => catalogStatus === "live") ? "live" : statuses.some((catalogStatus) => catalogStatus === "live" || catalogStatus === "stale") ? "stale" : "unavailable";

    return NextResponse.json({
      enabledModelIds: settingsResult.settings.enabledModelIds,
      visualStyle: visualStyleResult.visualStyle,
      credential: credentialResult.status,
      credentialAvailable,
      models,
      status,
      sort,
      capability: capabilityResult?.data ?? "all",
    });
  } catch {
    return NextResponse.json({ error: "Campaign AI settings are temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateSettingsSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ error: "Campaign AI settings are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getContext(campaignId);
    if (result.response) return result.response;

    let campaignCredential;
    try {
      campaignCredential = await getCampaignCredentialForGeneration(campaignId);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "Campaign AI settings cannot be changed right now.");
    }

    let enabledModelIds: string[] | null = null;
    if (input.data.enabledModelIds) {
      const [textCatalog, imageCatalog] = await Promise.all([
        getAiModelCatalog(campaignCredential.apiKey, "structured-text"),
        getAiModelCatalog(campaignCredential.apiKey, "image"),
      ]);
      const availableModels = [...textCatalog.models, ...imageCatalog.models].filter((model) => model.compatible);
      const validated = validateEnabledAiModelIds(input.data.enabledModelIds, availableModels);
      if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
      enabledModelIds = validated.enabledModelIds;
    }

    const visualStyleResult = input.data.visualStyle
      ? { visualStyle: input.data.visualStyle }
      : await loadCampaignVisualStyle(result.context.supabase, campaignId);
    if ("error" in visualStyleResult) return NextResponse.json({ error: visualStyleResult.error }, { status: 503 });

    const { error } = await result.context.supabase.rpc("update_campaign_ai_preferences", {
      p_campaign_id: campaignId,
      p_visual_style: visualStyleResult.visualStyle,
      p_enabled_model_ids: enabledModelIds,
    });

    if (error) return NextResponse.json({ error: "Campaign AI settings could not be saved." }, { status: 503 });

    const currentSettings = await loadCampaignAiSettings(result.context.supabase, campaignId);
    if ("error" in currentSettings) return NextResponse.json({ error: currentSettings.error }, { status: 503 });
    return NextResponse.json({ enabledModelIds: enabledModelIds ?? currentSettings.settings.enabledModelIds, visualStyle: visualStyleResult.visualStyle });
  } catch {
    return NextResponse.json({ error: "Campaign AI settings are temporarily unavailable." }, { status: 503 });
  }
}
