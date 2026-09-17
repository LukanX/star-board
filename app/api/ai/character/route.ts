import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { mergeProtectedDraftFields } from "@/lib/ai/draft-refinement";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { loadCampaignAiContext, recordAiGeneration } from "@/lib/ai/assistance";
import { loadCharacterPortraitAccess } from "@/lib/ai/character-portrait-access";
import { generateJson } from "@/lib/ai/client";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { getAiProviderFailure, logAiProviderFailure } from "@/lib/ai/errors";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { buildCharacterPrompt } from "@/lib/ai/prompts";
import { getServerEnv } from "@/lib/env";
import { campaignCredentialErrorResponse, resolveCampaignCredential } from "@/lib/ai/route-support";
import { characterDraftSchema, characterGenerationInputSchema, characterReviewDraftSchema } from "@/lib/validation/ai";

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

    const portraitAccess = await loadCharacterPortraitAccess(
      context.supabase,
      input.data.campaignId,
      input.data.characterId,
      context.user.id,
    );

    if (portraitAccess.failure === "membership") {
      return NextResponse.json({ error: "Campaign membership is required for AI character assistance." }, { status: 403 });
    }
    if (portraitAccess.failure === "not-found") {
      return NextResponse.json({ error: "The saved character was not found in this campaign." }, { status: 404 });
    }
    if (portraitAccess.failure === "forbidden") {
      return NextResponse.json({ error: "You can only use portrait assistance for your own character." }, { status: 403 });
    }
    if (!portraitAccess.access) {
      return NextResponse.json({ error: "Character portrait access could not be verified." }, { status: 503 });
    }

    const access = portraitAccess.access;

    if (access.role === "player" && input.data.model) {
      return NextResponse.json({ error: "Players must use the campaign default text model." }, { status: 403 });
    }

    let campaignCredential;
    try {
      campaignCredential = await resolveCampaignCredential(input.data.campaignId);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "Character AI assistance is temporarily unavailable.");
    }

    if (access.role === "player" && !campaignCredential.status.allowPlayerAi) {
      return NextResponse.json({ error: "Player AI assistance is not enabled for this campaign." }, { status: 403 });
    }

    const env = getServerEnv();

    const catalog = await getAiModelCatalog(campaignCredential.apiKey, "structured-text");
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

    const promptInput = {
      ...input.data,
      name: access.character.name,
      species: access.character.species,
      className: access.character.class_name,
      level: access.character.level,
      backstoryMarkdown: access.character.backstory_markdown,
      physicalDescription: access.character.physical_description,
      currentDraft: input.data.currentDraft
        ? { visualPrompt: input.data.currentDraft.visualPrompt }
        : undefined,
    };
    const prompt = buildCharacterPrompt(promptInput, aiContext.campaign);
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    let providerResult: Awaited<ReturnType<typeof generateJson>> | null = null;
    let rawDraft: unknown;

    try {
      providerResult = await generateJson(campaignCredential.apiKey, prompt, characterDraftSchema, selectedModel.id);
      rawDraft = providerResult.data;
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "character", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: selectedModel.id, status: "failed", targetCharacterId: access.character.id });
      const failure = getAiProviderFailure(error, "Character prompt generation is temporarily unavailable.");
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({ error: failure.message, ...(failure.requestId ? { providerRequestId: failure.requestId } : {}) }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    const draft = characterDraftSchema.safeParse(rawDraft);

    if (!draft.success) {
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult?.model ?? selectedModel.id, generationId: providerResult?.generationId, inputTokens: providerResult?.usage?.inputTokens, outputTokens: providerResult?.usage?.outputTokens, costUsd: providerResult?.usage?.cost, status: "failed", targetCharacterId: access.character.id });
      return NextResponse.json({ error: "The AI response did not match the character prompt format." }, { status: 502 });
    }

    const reviewedDraft = characterReviewDraftSchema.safeParse(
      mergeProtectedDraftFields(
        draft.data,
        input.data.currentDraft as Record<string, unknown> | undefined,
        input.data.protectedFields,
      ),
    );

    if (!reviewedDraft.success) {
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult?.model ?? selectedModel.id, generationId: providerResult?.generationId, inputTokens: providerResult?.usage?.inputTokens, outputTokens: providerResult?.usage?.outputTokens, costUsd: providerResult?.usage?.cost, status: "failed", targetCharacterId: access.character.id });
      return NextResponse.json({ error: "The reviewed character prompt is outside the allowed field limits." }, { status: 502 });
    }

    const { error: auditError } = await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "character", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult?.model ?? selectedModel.id, generationId: providerResult?.generationId, inputTokens: providerResult?.usage?.inputTokens, outputTokens: providerResult?.usage?.outputTokens, costUsd: providerResult?.usage?.cost, status: "complete", targetCharacterId: access.character.id });

    if (auditError) {
      return NextResponse.json({ error: "Character prompt metadata could not be saved." }, { status: 503 });
    }

    return NextResponse.json({ draft: reviewedDraft.data, model: providerResult?.model ?? selectedModel.id });
  } catch {
    return NextResponse.json({ error: "Character prompt generation is temporarily unavailable." }, { status: 503 });
  }
}
