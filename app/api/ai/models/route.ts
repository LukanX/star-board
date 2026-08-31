import { NextResponse } from "next/server";
import { aiModelSorts, getAiModelCatalog, type AiModelSort } from "@/lib/ai/model-discovery";
import { aiCapabilities, type AiCapability } from "@/lib/ai/model-catalog";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { getAuthenticatedUser, getCampaignMembership, requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { campaignCredentialErrorResponse, resolveCampaignCredential } from "@/lib/ai/route-support";
import { z } from "zod";

export const runtime = "nodejs";

const capabilitySchema = z.enum(aiCapabilities);
const sortSchema = z.enum(aiModelSorts);

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const campaignId = searchParams.get("campaignId");
  const capabilityResult = capabilitySchema.safeParse(searchParams.get("capability"));
  const sortResult = sortSchema.safeParse(searchParams.get("sort") ?? "most-popular");

  if (!campaignId || !capabilityResult.success || !sortResult.success) {
    return NextResponse.json({ error: "A campaign ID, supported AI capability, and supported model sort are required." }, { status: 400 });
  }

  try {
    const capability = capabilityResult.data as AiCapability;
    const gmContext = await requireCampaignGM(campaignId);
    let context = gmContext;
    let playerAccess = false;

    if (!context) {
      if (capability !== "structured-text") {
        return NextResponse.json({ error: "GM access is required to view AI models." }, { status: 403 });
      }

      const memberContext = await getAuthenticatedUser();
      const membership = memberContext
        ? await getCampaignMembership(memberContext.supabase, campaignId, memberContext.user.id)
        : null;

      if (!memberContext || membership?.role !== "player") {
        return NextResponse.json({ error: "GM access is required to view AI models." }, { status: 403 });
      }

      context = { ...memberContext, role: membership.role };
      playerAccess = true;
    }

    let campaignCredential;
    try {
      campaignCredential = await resolveCampaignCredential(campaignId);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "AI model catalog is temporarily unavailable.");
    }

    if (playerAccess && !campaignCredential.status.allowPlayerAi) {
      return NextResponse.json({ error: "Player AI assistance is not enabled for this campaign." }, { status: 403 });
    }

    const sort = sortResult.data as AiModelSort;
    const catalog = await getAiModelCatalog(campaignCredential.apiKey, capability, sort);
    const availableModels = catalog.models.filter((model) => model.compatible);
    const settingsResult = await loadCampaignAiSettings(context.supabase, campaignId, availableModels.map((model) => model.id));
    if ("error" in settingsResult) return NextResponse.json({ error: settingsResult.error }, { status: 503 });
    const env = getServerEnv();
    const configuredDefault = capability === "image" ? env.OPENROUTER_IMAGE_MODEL : env.OPENROUTER_TEXT_MODEL;
    const enabledModelIds = settingsResult.settings.enabledModelIds;
    const defaultModel = enabledModelIds.includes(configuredDefault) ? configuredDefault : enabledModelIds.find((modelId) => availableModels.some((model) => model.id === modelId && model.capability === capability)) ?? null;

    return NextResponse.json({ capability, defaultModel, enabledModelIds, status: catalog.status, models: catalog.models.map((model) => ({ ...model, enabled: enabledModelIds.includes(model.id) })) });
  } catch {
    return NextResponse.json({ error: "AI model catalog is temporarily unavailable." }, { status: 503 });
  }
}