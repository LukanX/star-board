import { NextResponse } from "next/server";
import { z } from "zod";
import { aiModelSorts, getAiModelCatalog, type AiModelSort } from "@/lib/ai/model-discovery";
import { loadCampaignAiSettings, validateEnabledAiModelIds } from "@/lib/ai/campaign-settings";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { aiCapabilities, type AiCapability } from "@/lib/ai/model-catalog";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string }> };

const updateSettingsSchema = z.object({
  enabledModelIds: z.array(z.string().trim().min(1).max(240)).min(1).max(2000),
});

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
    const [textCatalog, imageCatalog] = await Promise.all([
      getAiModelCatalog("structured-text", sort),
      getAiModelCatalog("image", sort),
    ]);
    const availableModels = [...textCatalog.models, ...imageCatalog.models].filter((model) => model.compatible);
    const settingsResult = await loadCampaignAiSettings(result.context.supabase, campaignId, availableModels.map((model) => model.id));
    if ("error" in settingsResult) return NextResponse.json({ error: settingsResult.error }, { status: 503 });

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

    const [textCatalog, imageCatalog] = await Promise.all([
      getAiModelCatalog("structured-text"),
      getAiModelCatalog("image"),
    ]);
    const availableModels = [...textCatalog.models, ...imageCatalog.models].filter((model) => model.compatible);
    const validated = validateEnabledAiModelIds(input.data.enabledModelIds, availableModels);
    if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

    const { data, error } = await result.context.supabase
      .from("campaign_ai_settings")
      .upsert({ campaign_id: campaignId, enabled_model_ids: validated.enabledModelIds, updated_at: new Date().toISOString() }, { onConflict: "campaign_id" })
      .select("enabled_model_ids, updated_at")
      .single();

    if (error || !data) return NextResponse.json({ error: "Campaign AI settings could not be saved." }, { status: 503 });

    return NextResponse.json({ enabledModelIds: data.enabled_model_ids, updatedAt: data.updated_at });
  } catch {
    return NextResponse.json({ error: "Campaign AI settings are temporarily unavailable." }, { status: 503 });
  }
}
