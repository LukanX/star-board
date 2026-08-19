import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { loadCampaignAiContext, recordAiGeneration } from "@/lib/ai/assistance";
import { generateJson } from "@/lib/ai/client";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { getAiProviderFailure, logAiProviderFailure } from "@/lib/ai/errors";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { buildCharacterPrompt } from "@/lib/ai/prompts";
import { getServerEnv } from "@/lib/env";
import { characterDraftSchema, characterGenerationInputSchema } from "@/lib/validation/ai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = characterGenerationInputSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Character prompt request is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, input.data.campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required for AI character assistance." }, { status: 403 });
    }

    const env = getServerEnv();

    if (!env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OpenRouter text generation is not configured." }, { status: 503 });
    }

    const catalog = await getAiModelCatalog("structured-text");
    const availableModels = catalog.models.filter((model) => model.compatible);
    const settingsResult = await loadCampaignAiSettings(context.supabase, input.data.campaignId, availableModels.map((model) => model.id));
    if ("error" in settingsResult) return NextResponse.json({ error: settingsResult.error }, { status: 503 });

    let selectedModel;
    try {
      selectedModel = resolveAiModel("structured-text", input.data.model, env.OPENROUTER_TEXT_MODEL, settingsResult.settings.enabledModelIds, availableModels);
    } catch (error) {
      if (error instanceof AiModelSelectionError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }

    const aiContext = await loadCampaignAiContext(context.supabase, input.data.campaignId);

    if (aiContext.error) {
      return NextResponse.json({ error: aiContext.error }, { status: aiContext.notFound ? 404 : 503 });
    }

    const prompt = buildCharacterPrompt(input.data, aiContext.campaign);
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    let providerResult: Awaited<ReturnType<typeof generateJson>> | null = null;
    let rawDraft: unknown;

    try {
      providerResult = await generateJson(prompt, characterDraftSchema, selectedModel.id);
      rawDraft = providerResult.data;
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "character", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: selectedModel.id, status: "failed" });
      const failure = getAiProviderFailure(error, "Character prompt generation is temporarily unavailable.");
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({ error: failure.message, ...(failure.requestId ? { providerRequestId: failure.requestId } : {}) }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    const draft = characterDraftSchema.safeParse(rawDraft);

    if (!draft.success) {
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult?.model ?? selectedModel.id, generationId: providerResult?.generationId, inputTokens: providerResult?.usage?.inputTokens, outputTokens: providerResult?.usage?.outputTokens, costUsd: providerResult?.usage?.cost, status: "failed" });
      return NextResponse.json({ error: "The AI response did not match the character prompt format." }, { status: 502 });
    }

    const { error: auditError } = await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult?.model ?? selectedModel.id, generationId: providerResult?.generationId, inputTokens: providerResult?.usage?.inputTokens, outputTokens: providerResult?.usage?.outputTokens, costUsd: providerResult?.usage?.cost, status: "complete" });

    if (auditError) {
      return NextResponse.json({ error: "Character prompt metadata could not be saved." }, { status: 503 });
    }

    return NextResponse.json({ draft: draft.data, model: providerResult?.model ?? selectedModel.id });
  } catch {
    return NextResponse.json({ error: "Character prompt generation is temporarily unavailable." }, { status: 503 });
  }
}
