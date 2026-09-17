import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { loadCampaignAiContext, recordAiGeneration } from "@/lib/ai/assistance";
import { generateJson } from "@/lib/ai/client";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { buildVisualStylePrompt } from "@/lib/ai/visual-style-prompt";
import { normalizeVisualStyleReferences } from "@/lib/ai/visual-style-references";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { getAiProviderFailure, logAiProviderFailure } from "@/lib/ai/errors";
import { campaignCredentialErrorResponse, resolveCampaignCredential } from "@/lib/ai/route-support";
import { visualStyleDraftOutputSchema, visualStyleGenerationInputSchema } from "@/lib/validation/visual-style";

export const runtime = "nodejs";

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const input = visualStyleGenerationInputSchema.safeParse({
    campaignId: formValue(formData, "campaignId"),
    model: formValue(formData, "model"),
    campaignVibe: formValue(formData, "campaignVibe"),
    artDirection: formValue(formData, "artDirection"),
    directionNotes: formValue(formData, "directionNotes"),
  });

  if (!input.success) {
    return NextResponse.json({ error: "Visual style request is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  const referencesResult = await normalizeVisualStyleReferences(formData);
  if ("error" in referencesResult) return NextResponse.json({ error: referencesResult.error }, { status: 400 });

  try {
    const context = await requireCampaignGM(input.data.campaignId);
    if (!context) return NextResponse.json({ error: "GM access is required for visual style assistance." }, { status: 403 });

    let campaignCredential;
    try {
      campaignCredential = await resolveCampaignCredential(input.data.campaignId);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "Visual style assistance is temporarily unavailable.");
    }

    const env = getServerEnv();
    const catalog = await getAiModelCatalog(campaignCredential.apiKey, "structured-text");
    const compatibleModels = catalog.models.filter((model) => model.compatible);
    const availableModels = referencesResult.references.length
      ? compatibleModels.filter((model) => model.inputModalities.includes("image"))
      : compatibleModels;

    if (referencesResult.references.length && !availableModels.length) {
      return NextResponse.json({ error: "Example images require an enabled structured text model with image input." }, { status: 400 });
    }

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
    if (aiContext.error) return NextResponse.json({ error: aiContext.error }, { status: aiContext.notFound ? 404 : 503 });

    const prompt = buildVisualStylePrompt(input.data, {
      system: aiContext.campaign.system,
      description: aiContext.campaign.description,
      currentVisualStyle: aiContext.campaign.visualStyle,
    });
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    let providerResult: Awaited<ReturnType<typeof generateJson>> | null = null;

    try {
      providerResult = await generateJson(campaignCredential.apiKey, prompt, visualStyleDraftOutputSchema, selectedModel.id, {
        imageReferences: referencesResult.references,
      });
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "visual-style", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      await recordAiGeneration(context.supabase, {
        campaignId: input.data.campaignId,
        userId: context.user.id,
        kind: "visual-style",
        mode: "create",
        model: selectedModel.id,
        promptHash,
        provider: "openrouter",
        effectiveModel: selectedModel.id,
        status: "failed",
      });
      const failure = getAiProviderFailure(error, "Visual style assistance is temporarily unavailable.");
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({ error: failure.message, ...(failure.requestId ? { providerRequestId: failure.requestId } : {}) }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    const draft = visualStyleDraftOutputSchema.safeParse(providerResult.data);
    if (!draft.success) {
      await recordAiGeneration(context.supabase, {
        campaignId: input.data.campaignId,
        userId: context.user.id,
        kind: "visual-style",
        mode: "create",
        model: selectedModel.id,
        promptHash,
        provider: "openrouter",
        effectiveModel: providerResult.model ?? selectedModel.id,
        generationId: providerResult.generationId,
        inputTokens: providerResult.usage?.inputTokens,
        outputTokens: providerResult.usage?.outputTokens,
        costUsd: providerResult.usage?.cost,
        status: "failed",
      });
      return NextResponse.json({ error: "The AI response did not match the visual style draft format." }, { status: 502 });
    }

    const { error: auditError } = await recordAiGeneration(context.supabase, {
      campaignId: input.data.campaignId,
      userId: context.user.id,
      kind: "visual-style",
      mode: "create",
      model: selectedModel.id,
      promptHash,
      provider: "openrouter",
      effectiveModel: providerResult.model ?? selectedModel.id,
      generationId: providerResult.generationId,
      inputTokens: providerResult.usage?.inputTokens,
      outputTokens: providerResult.usage?.outputTokens,
      costUsd: providerResult.usage?.cost,
      status: "complete",
    });

    if (auditError) return NextResponse.json({ error: "Visual style draft metadata could not be saved." }, { status: 503 });

    return NextResponse.json({ draft: draft.data, model: providerResult.model ?? selectedModel.id, referenceCount: referencesResult.references.length });
  } catch {
    return NextResponse.json({ error: "Visual style assistance is temporarily unavailable." }, { status: 503 });
  }
}
