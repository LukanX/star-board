import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/ai/client";
import { loadPlaceAiContext } from "@/lib/ai/assistance";
import { buildArtPrompt } from "@/lib/ai/prompts";
import { canUseCharacterPortraitAi, loadCharacterPortraitAccess, type CharacterPortraitAccess } from "@/lib/ai/character-portrait-access";
import { getAuthenticatedUser, requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { getAiProviderFailure, logAiProviderFailure } from "@/lib/ai/errors";
import { dispatchImageBackgroundJob, markImageBackgroundDispatchFailed } from "@/lib/ai/image-jobs";
import { campaignCredentialErrorResponse, resolveCampaignCredential } from "@/lib/ai/route-support";
import { campaignArtBucket, createCampaignArtSignedUrl } from "@/lib/storage/campaign-art";

const imageMediaTypes = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

type ImageRequestContext = {
  supabase: SupabaseClient;
  user: User;
  role: "gm" | "player";
};

async function storeStylePreview(supabase: Parameters<typeof createCampaignArtSignedUrl>[0], campaignId: string, userId: string, generationRunId: string, image: Awaited<ReturnType<typeof generateImage>>["image"]) {
  const mediaType = image.mediaType in imageMediaTypes ? image.mediaType as keyof typeof imageMediaTypes : null;
  if (!mediaType) throw new Error("The AI provider returned an unsupported image type.");

  const imageUrl = image.url;
  const body = image.base64
    ? new Blob([Buffer.from(image.base64, "base64")], { type: mediaType })
    : imageUrl
      ? await (async () => {
          const response = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
          if (!response.ok) throw new Error("The generated style preview could not be downloaded.");
          return response.blob();
        })()
      : null;

  if (!body) throw new Error("The AI provider returned no image data.");

  const path = `${campaignId}/${userId}/style-preview-${generationRunId}.${imageMediaTypes[mediaType]}`;
  const { error: uploadError } = await supabase.storage.from(campaignArtBucket).upload(path, body, {
    cacheControl: "3600",
    contentType: mediaType,
    upsert: false,
  });

  if (uploadError) throw new Error("The generated style preview could not be stored.");

  return { path, mediaType, signedUrl: await createCampaignArtSignedUrl(supabase, path) };
}

export const runtime = "nodejs";

function shouldUseBackgroundImageGeneration(request: Request, env: ReturnType<typeof getServerEnv>) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const isNetlifyRequest = process.env.NETLIFY === "true"
    || request.headers.has("x-nf-request-id")
    || hostname.endsWith(".netlify.app");

  return isNetlifyRequest || env.NETLIFY_IMAGE_GENERATION === "background";
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
    let context: ImageRequestContext;
    let characterAccess: CharacterPortraitAccess | null = null;

    if (input.data.targetKind === "character") {
      const authenticated = await getAuthenticatedUser();
      if (!authenticated) {
        return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
      }

      const accessResult = await loadCharacterPortraitAccess(
        authenticated.supabase,
        input.data.campaignId,
        input.data.characterId!,
        authenticated.user.id,
      );

      if (accessResult.failure === "membership") {
        return NextResponse.json({ error: "Campaign membership is required for AI art assistance." }, { status: 403 });
      }
      if (accessResult.failure === "not-found") {
        return NextResponse.json({ error: "The saved character was not found in this campaign." }, { status: 404 });
      }
      if (accessResult.failure === "forbidden") {
        return NextResponse.json({ error: "You can only generate portraits for your own character." }, { status: 403 });
      }
      if (!accessResult.access) {
        return NextResponse.json({ error: "Character portrait access could not be verified." }, { status: 503 });
      }

      characterAccess = accessResult.access;
      context = { ...authenticated, role: characterAccess.role };

      if (characterAccess.role === "player" && (input.data.model || input.data.visualStyleId || input.data.visualStyleOverride)) {
        return NextResponse.json({ error: "Players must use the campaign default image model and visual style." }, { status: 403 });
      }
    } else {
      const gmContext = await requireCampaignGM(input.data.campaignId);

      if (!gmContext) {
        return NextResponse.json({ error: "GM access is required for AI art assistance." }, { status: 403 });
      }

      context = gmContext;
    }

    const supabase = context.supabase;

    let campaignCredential;
    try {
      campaignCredential = await resolveCampaignCredential(input.data.campaignId);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "Art generation is temporarily unavailable.");
    }

    if (characterAccess && !canUseCharacterPortraitAi(characterAccess, campaignCredential.status.allowPlayerAi)) {
      return NextResponse.json({ error: "Player AI assistance is not enabled for this campaign." }, { status: 403 });
    }

    const env = getServerEnv();

    const catalog = await getAiModelCatalog(campaignCredential.apiKey, "image");
    const availableModels = catalog.models.filter((model) => model.compatible);
    const settingsResult = await loadCampaignAiSettings(supabase, input.data.campaignId, availableModels.map((model) => model.id));
    if ("error" in settingsResult) return NextResponse.json({ error: settingsResult.error }, { status: 503 });

    let selectedModel;
    try {
      selectedModel = resolveAiModel("image", input.data.model, env.OPENROUTER_IMAGE_MODEL, settingsResult.settings.enabledModelIds, availableModels);
    } catch (error) {
      if (error instanceof AiModelSelectionError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("system, description, visual_style")
      .eq("id", input.data.campaignId)
      .maybeSingle();

    if (campaignError) {
      return NextResponse.json({ error: "Campaign context could not be loaded." }, { status: 503 });
    }

    if (!campaign) {
      return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    }

    let visualStyle = campaign.visual_style;
    if (input.data.visualStyleOverride) {
      visualStyle = input.data.visualStyleOverride;
    } else if (input.data.visualStyleId) {
      const { data: savedStyle, error: styleError } = await supabase
        .from("campaign_visual_styles")
        .select("visual_style, status")
        .eq("id", input.data.visualStyleId)
        .eq("campaign_id", input.data.campaignId)
        .maybeSingle();

      if (styleError) return NextResponse.json({ error: "The selected visual style could not be loaded." }, { status: 503 });
      if (!savedStyle) return NextResponse.json({ error: "The selected visual style was not found in this campaign." }, { status: 404 });
      if (input.data.purpose === "entity-art" && savedStyle.status !== "ready") return NextResponse.json({ error: "Only ready visual styles can be used for campaign artwork." }, { status: 400 });
      visualStyle = savedStyle.visual_style;
    }

    const campaignPromptContext = [
      `Campaign system: ${campaign.system}`,
      `Campaign brief: ${campaign.description}`,
    ].filter(Boolean).join(". ");
    const placeContextResult = input.data.targetKind === "place" && input.data.parentPlaceId
      ? await loadPlaceAiContext(supabase, input.data.campaignId, input.data.parentPlaceId)
      : { context: undefined };

    if ("error" in placeContextResult) {
      return NextResponse.json({ error: placeContextResult.error }, { status: placeContextResult.invalid ? 400 : 503 });
    }

    const visualStyleHash = createHash("sha256").update(visualStyle).digest("hex");
    const prompt = buildArtPrompt(
      input.data.subject,
      visualStyle,
      input.data.refinement,
      input.data.currentPrompt,
      input.data.targetKind,
      placeContextResult.context,
      campaignPromptContext,
      characterAccess
        ? {
            name: characterAccess.character.name,
            species: characterAccess.character.species,
            className: characterAccess.character.class_name,
            level: characterAccess.character.level,
            backstoryMarkdown: characterAccess.character.backstory_markdown,
            physicalDescription: characterAccess.character.physical_description,
          }
        : undefined,
    );
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    if (shouldUseBackgroundImageGeneration(request, env)) {
      if (!env.SUPABASE_SECRET_KEY) {
        return NextResponse.json({ error: "Async image generation is not configured. Add SUPABASE_SECRET_KEY to the Netlify environment." }, { status: 503 });
      }

      const { data: generationRun, error: generationRunError } = await supabase
        .from("ai_generation_runs")
        .insert({
          campaign_id: input.data.campaignId,
          requested_by: context.user.id,
          kind: "image",
          mode: input.data.mode,
          model: selectedModel.id,
          prompt_hash: promptHash,
          purpose: input.data.purpose,
          visual_style_hash: visualStyleHash,
          image_subject: input.data.subject,
          provider: "openrouter",
          effective_model: selectedModel.id,
          target_kind: input.data.targetKind,
          aspect_ratio: input.data.aspectRatio,
          size: input.data.size,
          status: "pending",
          ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
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
        purpose: input.data.purpose,
        aspectRatio: input.data.aspectRatio,
        size: input.data.size,
      };

      try {
        await dispatchImageBackgroundJob(request.url, job, env.SUPABASE_SECRET_KEY);
      } catch {
        await markImageBackgroundDispatchFailed({
          campaignId: input.data.campaignId,
          generationRunId: generationRun.id,
          requestedBy: context.user.id,
          targetCharacterId: characterAccess?.character.id ?? null,
        }).catch(() => undefined);
        return NextResponse.json({ error: "Image generation could not be started. Check the Netlify background function deployment." }, { status: 503 });
      }

      return NextResponse.json({
        job: {
          generationRunId: generationRun.id,
          status: "pending",
          targetKind: input.data.targetKind,
          mode: input.data.mode,
          purpose: input.data.purpose,
          subject: input.data.subject,
          aspectRatio: input.data.aspectRatio,
          size: input.data.size,
          prompt,
          createdAt: new Date(generationRun.created_at).toISOString(),
          statusUpdatedAt: new Date(generationRun.status_updated_at ?? generationRun.created_at).toISOString(),
          model: selectedModel.id,
          ...(characterAccess ? { characterId: characterAccess.character.id } : {}),
        },
        prompt,
      }, { status: 202 });
    }

    let response;

    try {
      response = await generateImage(campaignCredential.apiKey, prompt, selectedModel.id, { aspectRatio: input.data.aspectRatio, size: input.data.size });
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "image", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      await supabase.from("ai_generation_runs").insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: selectedModel.id,
        prompt_hash: promptHash,
        purpose: input.data.purpose,
        visual_style_hash: visualStyleHash,
        image_subject: input.data.subject,
        target_kind: input.data.targetKind,
        aspect_ratio: input.data.aspectRatio,
        size: input.data.size,
        provider: "openrouter",
        effective_model: selectedModel.id,
        status: "failed",
        ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
      });
      const failure = getAiProviderFailure(error, "Art generation is temporarily unavailable.");
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({ error: failure.message, ...(failure.requestId ? { providerRequestId: failure.requestId } : {}) }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    const image = response.image;

    if (!image.base64 && !image.url) {
      await supabase.from("ai_generation_runs").insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: selectedModel.id,
        prompt_hash: promptHash,
        purpose: input.data.purpose,
        visual_style_hash: visualStyleHash,
        image_subject: input.data.subject,
        target_kind: input.data.targetKind,
        provider: "openrouter",
        effective_model: selectedModel.id,
        status: "failed",
        ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
      });
      return NextResponse.json({ error: "The AI provider returned no image data." }, { status: 502 });
    }

    const { data: generationRun, error: generationRunError } = await supabase
      .from("ai_generation_runs")
      .insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: response.model,
        prompt_hash: promptHash,
        purpose: input.data.purpose,
        visual_style_hash: visualStyleHash,
        image_subject: input.data.subject,
        provider: "openrouter",
        effective_model: response.model,
        target_kind: input.data.targetKind,
        ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
        aspect_ratio: input.data.aspectRatio,
        size: input.data.size,
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

    let imageDraft = { base64: image.base64, url: image.url, mediaType: image.mediaType };
    let temporaryPath: string | undefined;
    if (input.data.purpose === "style-preview") {
      try {
        const storedPreview = await storeStylePreview(supabase, input.data.campaignId, context.user.id, generationRun.id, image);
        temporaryPath = storedPreview.path;
        imageDraft = { base64: null, url: storedPreview.signedUrl, mediaType: storedPreview.mediaType };
        const { error: previewMetadataError } = await supabase
          .from("ai_generation_runs")
          .update({ image_path: storedPreview.path, image_media_type: storedPreview.mediaType })
          .eq("id", generationRun.id);
        if (previewMetadataError) {
          await supabase.storage.from(campaignArtBucket).remove([storedPreview.path]);
          throw new Error("The style preview metadata could not be saved.");
        }
      } catch {
        await supabase.from("ai_generation_runs").update({ status: "failed", error_message: "The style preview could not be stored." }).eq("id", generationRun.id);
        return NextResponse.json({ error: "The style preview could not be stored." }, { status: 503 });
      }
    }

    const createdAt = new Date(generationRun.created_at).toISOString();
    const draft = imageDraftSchema.safeParse({
      generationRunId: generationRun.id,
      targetKind: input.data.targetKind,
      ...(characterAccess ? { characterId: characterAccess.character.id } : {}),
      purpose: input.data.purpose,
      mode: input.data.mode,
      subject: input.data.subject,
      aspectRatio: input.data.aspectRatio,
      size: input.data.size,
      prompt,
      image: imageDraft,
      provider: "openrouter",
      model: response.model,
      createdAt,
      temporaryPath,
    });

    if (!draft.success) {
      return NextResponse.json({ error: "The AI response did not match the image draft format.", issues: draft.error.flatten() }, { status: 502 });
    }

    return NextResponse.json({ draft: draft.data, model: response.model });
  } catch {
    return NextResponse.json({ error: "Art generation is temporarily unavailable." }, { status: 503 });
  }
}
