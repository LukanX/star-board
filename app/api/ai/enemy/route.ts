import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/client";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { loadCampaignAiContext, recordAiGeneration } from "@/lib/ai/assistance";
import { buildEnemyPrompt } from "@/lib/ai/prompts";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { enemyGenerationInputSchema } from "@/lib/validation/ai";
import { enemyAiDraftSchema } from "@/lib/validation/enemy";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { getAiProviderFailure, logAiProviderFailure } from "@/lib/ai/errors";
import { dispatchEnemyBackgroundJob } from "@/lib/ai/enemy-jobs";

export const runtime = "nodejs";

function shouldUseBackgroundEnemyGeneration(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return process.env.NETLIFY === "true"
    || request.headers.has("x-nf-request-id")
    || hostname.endsWith(".netlify.app");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = enemyGenerationInputSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Enemy request is invalid.", issues: input.error.flatten() }, { status: 400 });

  try {
    const context = await requireCampaignGM(input.data.campaignId);
    if (!context) return NextResponse.json({ error: "GM access is required for AI enemy assistance." }, { status: 403 });

    const env = getServerEnv();
    if (!env.OPENROUTER_API_KEY) return NextResponse.json({ error: "OpenRouter text generation is not configured." }, { status: 503 });

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
    if (aiContext.error) return NextResponse.json({ error: aiContext.error }, { status: aiContext.notFound ? 404 : 503 });

    const prompt = buildEnemyPrompt(input.data, aiContext.campaign);
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    if (shouldUseBackgroundEnemyGeneration(request)) {
      if (!env.SUPABASE_SECRET_KEY) {
        return NextResponse.json({ error: "Async enemy generation is not configured. Add SUPABASE_SECRET_KEY to the Netlify environment." }, { status: 503 });
      }

      const { data: generationRun, error: generationRunError } = await context.supabase
        .from("ai_generation_runs")
        .insert({
          campaign_id: input.data.campaignId,
          requested_by: context.user.id,
          kind: "enemy",
          mode: input.data.mode,
          model: selectedModel.id,
          prompt_hash: promptHash,
          provider: "openrouter",
          effective_model: selectedModel.id,
          status: "pending",
        })
        .select("id, created_at, status_updated_at")
        .single();

      if (generationRunError || !generationRun) {
        return NextResponse.json({ error: "Enemy generation could not be queued." }, { status: 503 });
      }

      const job = {
        generationRunId: generationRun.id,
        prompt,
        model: selectedModel.id,
      };

      try {
        await dispatchEnemyBackgroundJob(request.url, job, env.SUPABASE_SECRET_KEY);
      } catch {
        await context.supabase.from("ai_generation_runs").update({
          status: "failed",
          status_updated_at: new Date().toISOString(),
          error_message: "The enemy background worker could not be reached.",
        }).eq("id", generationRun.id);
        return NextResponse.json({ error: "Enemy generation could not be started. Check the Netlify background function deployment." }, { status: 503 });
      }

      return NextResponse.json({
        job: {
          generationRunId: generationRun.id,
          status: "pending",
          mode: input.data.mode,
          model: selectedModel.id,
          createdAt: new Date(generationRun.created_at).toISOString(),
          statusUpdatedAt: new Date(generationRun.status_updated_at ?? generationRun.created_at).toISOString(),
        },
      }, { status: 202 });
    }

    let providerResult: Awaited<ReturnType<typeof generateJson>> | null = null;

    try {
      providerResult = await generateJson(prompt, enemyAiDraftSchema, selectedModel.id);
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "enemy", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "enemy", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: selectedModel.id, status: "failed" });
      const failure = getAiProviderFailure(error, "Enemy assistance is temporarily unavailable.");
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({ error: failure.message, ...(failure.requestId ? { providerRequestId: failure.requestId } : {}) }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    const draft = enemyAiDraftSchema.safeParse(providerResult.data);
    if (!draft.success) {
      await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "enemy", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult.model ?? selectedModel.id, generationId: providerResult.generationId, inputTokens: providerResult.usage?.inputTokens, outputTokens: providerResult.usage?.outputTokens, costUsd: providerResult.usage?.cost, status: "failed" });
      return NextResponse.json({ error: "The AI response did not match the enemy draft format." }, { status: 502 });
    }

    const { error: auditError } = await recordAiGeneration(context.supabase, { campaignId: input.data.campaignId, userId: context.user.id, kind: "enemy", mode: input.data.mode, model: selectedModel.id, promptHash, provider: "openrouter", effectiveModel: providerResult.model ?? selectedModel.id, generationId: providerResult.generationId, inputTokens: providerResult.usage?.inputTokens, outputTokens: providerResult.usage?.outputTokens, costUsd: providerResult.usage?.cost, status: "complete" });
    if (auditError) return NextResponse.json({ error: "Enemy draft metadata could not be saved." }, { status: 503 });

    return NextResponse.json({ draft: draft.data, model: providerResult.model ?? selectedModel.id });
  } catch {
    return NextResponse.json({ error: "Enemy assistance is temporarily unavailable." }, { status: 503 });
  }
}
