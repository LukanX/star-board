import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/ai/client";
import { loadPlaceAiContext } from "@/lib/ai/assistance";
import { buildArtPrompt } from "@/lib/ai/prompts";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { getAiProviderFailure, logAiProviderFailure } from "@/lib/ai/errors";
import { dispatchImageBackgroundJob } from "@/lib/ai/image-jobs";

export const runtime = "nodejs";

function shouldUseBackgroundImageGeneration(env: ReturnType<typeof getServerEnv>) {
  return process.env.NETLIFY === "true" || env.NETLIFY_IMAGE_GENERATION === "background";
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = imageGenerationInputSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Image request is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireCampaignGM(input.data.campaignId);

    if (!context) {
      return NextResponse.json({ error: "GM access is required for AI art assistance." }, { status: 403 });
    }

    const env = getServerEnv();

    if (!env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OpenRouter image generation is not configured." }, { status: 503 });
    }

    const catalog = await getAiModelCatalog("image");
    const availableModels = catalog.models.filter((model) => model.compatible);
    const settingsResult = await loadCampaignAiSettings(context.supabase, input.data.campaignId, availableModels.map((model) => model.id));
    if ("error" in settingsResult) return NextResponse.json({ error: settingsResult.error }, { status: 503 });

    let selectedModel;
    try {
      selectedModel = resolveAiModel("image", input.data.model, env.OPENROUTER_IMAGE_MODEL, settingsResult.settings.enabledModelIds, availableModels);
    } catch (error) {
      if (error instanceof AiModelSelectionError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }

    const { data: campaign, error: campaignError } = await context.supabase
      .from("campaigns")
      .select("system, description, art_style_suffix")
      .eq("id", input.data.campaignId)
      .maybeSingle();

    if (campaignError) {
      return NextResponse.json({ error: "Campaign context could not be loaded." }, { status: 503 });
    }

    if (!campaign) {
      return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    }

    const campaignStyle = [
      campaign.system,
      campaign.description,
      campaign.art_style_suffix,
      input.data.campaignStyle,
    ].filter(Boolean).join(". ");
    const placeContextResult = input.data.targetKind === "place" && input.data.parentPlaceId
      ? await loadPlaceAiContext(context.supabase, input.data.campaignId, input.data.parentPlaceId)
      : { context: undefined };

    if ("error" in placeContextResult) {
      return NextResponse.json({ error: placeContextResult.error }, { status: placeContextResult.invalid ? 400 : 503 });
    }

    const prompt = buildArtPrompt(input.data.subject, campaignStyle, input.data.refinement, input.data.currentPrompt, input.data.targetKind, placeContextResult.context);
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    if (shouldUseBackgroundImageGeneration(env)) {
      if (!env.SUPABASE_SECRET_KEY) {
        return NextResponse.json({ error: "Async image generation is not configured. Add SUPABASE_SECRET_KEY to the Netlify environment." }, { status: 503 });
      }

      const { data: generationRun, error: generationRunError } = await context.supabase
        .from("ai_generation_runs")
        .insert({
          campaign_id: input.data.campaignId,
          requested_by: context.user.id,
          kind: "image",
          mode: input.data.mode,
          model: selectedModel.id,
          prompt_hash: promptHash,
          provider: "openrouter",
          effective_model: selectedModel.id,
          target_kind: input.data.targetKind,
          aspect_ratio: input.data.aspectRatio,
          size: input.data.size,
          status: "pending",
        })
        .select("id, created_at, status_updated_at")
        .single();

      if (generationRunError || !generationRun) {
        return NextResponse.json({ error: "Image generation could not be queued." }, { status: 503 });
      }

      const job = {
        generationRunId: generationRun.id,
        prompt,
        model: selectedModel.id,
        aspectRatio: input.data.aspectRatio,
        size: input.data.size,
      };

      try {
        await dispatchImageBackgroundJob(process.env.URL ?? env.NEXT_PUBLIC_APP_URL ?? request.url, job, env.SUPABASE_SECRET_KEY);
      } catch {
        await context.supabase.from("ai_generation_runs").update({
          status: "failed",
          status_updated_at: new Date().toISOString(),
          error_message: "The image background worker could not be reached.",
        }).eq("id", generationRun.id);
        return NextResponse.json({ error: "Image generation could not be started. Check the Netlify background function deployment." }, { status: 503 });
      }

      return NextResponse.json({
        job: {
          generationRunId: generationRun.id,
          status: "pending",
          targetKind: input.data.targetKind,
          mode: input.data.mode,
          subject: input.data.subject,
          aspectRatio: input.data.aspectRatio,
          size: input.data.size,
          prompt,
          createdAt: new Date(generationRun.created_at).toISOString(),
          statusUpdatedAt: new Date(generationRun.status_updated_at ?? generationRun.created_at).toISOString(),
          model: selectedModel.id,
        },
        prompt,
      }, { status: 202 });
    }

    let response;

    try {
      response = await generateImage(prompt, selectedModel.id, { aspectRatio: input.data.aspectRatio, size: input.data.size });
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "image", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      await context.supabase.from("ai_generation_runs").insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: selectedModel.id,
        prompt_hash: promptHash,
        provider: "openrouter",
        effective_model: selectedModel.id,
        status: "failed",
      });
      const failure = getAiProviderFailure(error, "Art generation is temporarily unavailable.");
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({ error: failure.message, ...(failure.requestId ? { providerRequestId: failure.requestId } : {}) }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    const image = response.image;

    if (!image.base64 && !image.url) {
      await context.supabase.from("ai_generation_runs").insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: selectedModel.id,
        prompt_hash: promptHash,
        provider: "openrouter",
        effective_model: selectedModel.id,
        status: "failed",
      });
      return NextResponse.json({ error: "The AI provider returned no image data." }, { status: 502 });
    }

    const { data: generationRun, error: generationRunError } = await context.supabase
      .from("ai_generation_runs")
      .insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: response.model,
        prompt_hash: promptHash,
        provider: "openrouter",
        effective_model: response.model,
        generation_id: response.generationId,
        input_tokens: response.usage?.inputTokens,
        output_tokens: response.usage?.outputTokens,
        cost_usd: response.usage?.cost,
        status: "complete",
      })
      .select("id, created_at")
      .single();

    if (generationRunError || !generationRun) {
      return NextResponse.json({ error: "Image draft metadata could not be saved." }, { status: 503 });
    }

    const createdAt = new Date(generationRun.created_at).toISOString();
    const draft = imageDraftSchema.safeParse({
      generationRunId: generationRun.id,
      targetKind: input.data.targetKind,
      mode: input.data.mode,
      subject: input.data.subject,
      aspectRatio: input.data.aspectRatio,
      size: input.data.size,
      prompt,
      image: { base64: image.base64, url: image.url, mediaType: image.mediaType },
      provider: "openrouter",
      model: response.model,
      createdAt,
    });

    if (!draft.success) {
      return NextResponse.json({ error: "The AI response did not match the image draft format.", issues: draft.error.flatten() }, { status: 502 });
    }

    return NextResponse.json({ draft: draft.data, model: response.model });
  } catch {
    return NextResponse.json({ error: "Art generation is temporarily unavailable." }, { status: 503 });
  }
}
