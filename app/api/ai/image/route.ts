import { createHash } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/ai/client";
import { loadPlaceAiContext } from "@/lib/ai/assistance";
import { buildArtPrompt, ImagePromptBudgetError } from "@/lib/ai/prompts";
import { ReferenceError } from "@/lib/references/catalog";
import { buildSystemReferenceContext } from "@/lib/references/system-library";
import { readReferenceBinding } from "@/lib/references/types";
import { canUseCharacterPortraitAi, loadCharacterPortraitAccess, type CharacterPortraitAccess } from "@/lib/ai/character-portrait-access";
import { getAuthenticatedUser, requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { AiModelSelectionError, resolveAiModel } from "@/lib/ai/model-catalog";
import { defaultImageAspectRatio, getPreferredImageResolution, getSupportedImageAspectRatios, getSupportedImageResolutions } from "@/lib/ai/image-options";
import { loadCampaignAiSettings } from "@/lib/ai/campaign-settings";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { getAiProviderFailure, logAiProviderFailure, uncertainImageOutcomeMessage } from "@/lib/ai/errors";
import { dispatchImageBackgroundJob, markImageBackgroundDispatchFailed } from "@/lib/ai/image-jobs";
import { campaignCredentialErrorResponse, resolveCampaignCredential } from "@/lib/ai/route-support";
import { campaignArtBucket, createCampaignArtSignedUrl } from "@/lib/storage/campaign-art";
import { buildStudioManifest, buildStudioPrompt, effectiveStudioStyle, loadStudioSources, studioManifestHash, StudioError } from "@/lib/ai/studio-context";
import { loadStudioReferenceImages, resolveReferenceProviders } from "@/lib/ai/studio-references";
import { buildImageEditPrompt, loadEditSourceImage, resolveEditSource, type ResolvedEditSource } from "@/lib/ai/image-edit";
import type { StudioManifest } from "@/lib/validation/studio";

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

async function storeTemporaryImage(
  supabase: Parameters<typeof createCampaignArtSignedUrl>[0],
  campaignId: string,
  userId: string,
  generationRunId: string,
  image: Awaited<ReturnType<typeof generateImage>>["image"],
  prefix: "image" | "style-preview" | "studio-draft",
) {
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

  const path = `${campaignId}/${userId}/${prefix}-${generationRunId}.${imageMediaTypes[mediaType]}`;
  const { error: uploadError } = await supabase.storage.from(campaignArtBucket).upload(path, body, {
    cacheControl: "3600",
    contentType: mediaType,
    upsert: false,
  });

  if (uploadError) throw new Error("The generated style preview could not be stored.");

  try {
    return { path, mediaType, signedUrl: await createCampaignArtSignedUrl(supabase, path) };
  } catch (error) {
    await supabase.storage.from(campaignArtBucket).remove([path]);
    throw error;
  }
}

async function storeStylePreview(supabase: Parameters<typeof createCampaignArtSignedUrl>[0], campaignId: string, userId: string, generationRunId: string, image: Awaited<ReturnType<typeof generateImage>>["image"]) {
  return storeTemporaryImage(supabase, campaignId, userId, generationRunId, image, "style-preview");
}

export const runtime = "nodejs";

function shouldUseBackgroundImageGeneration(request: Request, env: ReturnType<typeof getServerEnv>) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const isNetlifyRequest = process.env.NETLIFY === "true"
    || request.headers.has("x-nf-request-id")
    || hostname.endsWith(".netlify.app");

  return isNetlifyRequest || env.NETLIFY_IMAGE_GENERATION === "background";
}

function logUnexpectedImageFailure(stage: string, model: string | null, error: unknown) {
  console.error(JSON.stringify({
    event: "ai_image_unexpected_failure",
    stage,
    model,
    errorName: error instanceof Error ? error.name : "unknown",
  }));
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

  let diagnosticStage = "campaign-access";
  const isEdit = input.data.operation === "edit";
  let diagnosticModel = input.data.model ?? null;

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

    diagnosticStage = "campaign-credential";
    let campaignCredential;
    try {
      campaignCredential = await resolveCampaignCredential(input.data.campaignId);
    } catch (error) {
      if (!(error instanceof Error && error.name === "CampaignCredentialError")) {
        logUnexpectedImageFailure(diagnosticStage, diagnosticModel, error);
      }
      const response = campaignCredentialErrorResponse(error, "Art generation is temporarily unavailable.");
      if (response.status === 503) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return NextResponse.json({ ...body, diagnosticStage }, {
          status: response.status,
          headers: { "X-Star-Board-Diagnostic-Stage": diagnosticStage },
        });
      }
      return response;
    }

    if (characterAccess && !canUseCharacterPortraitAi(characterAccess, campaignCredential.status.allowPlayerAi)) {
      return NextResponse.json({ error: "Player AI assistance is not enabled for this campaign." }, { status: 403 });
    }

    const env = getServerEnv();

    diagnosticStage = "image-model-catalog";
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
    diagnosticModel = selectedModel.id;

    const selectedModelDetails = availableModels.find((model) => model.id === selectedModel.id);
    if (!selectedModelDetails) {
      return NextResponse.json({ error: "The selected image model is no longer available." }, { status: 400 });
    }
    const supportedParameters = selectedModelDetails.supportedParameters ?? [];
    const requestedSize = supportedParameters.includes("size") ? input.data.size : undefined;
    let referenceProviders: string[] | undefined;
    const supportedAspectRatios = getSupportedImageAspectRatios(selectedModelDetails.supportedParameters, selectedModelDetails.parameterValues);
    if (supportedAspectRatios.length && !supportedAspectRatios.includes(input.data.aspectRatio)) {
      return NextResponse.json({ error: `The selected model does not support ${input.data.aspectRatio} aspect ratio.` }, { status: 400 });
    }
    if (!supportedAspectRatios.length && input.data.aspectRatio !== defaultImageAspectRatio) {
      return NextResponse.json({ error: "The selected model chooses its own aspect ratio." }, { status: 400 });
    }

    const supportedResolutions = getSupportedImageResolutions(supportedParameters, selectedModelDetails.parameterValues);
    if (input.data.resolution && !supportedResolutions.includes(input.data.resolution)) {
      return NextResponse.json({ error: `The selected model does not support ${input.data.resolution} resolution.` }, { status: 400 });
    }
    const imageResolution = input.data.resolution ?? getPreferredImageResolution(supportedResolutions);
    const resolutionColumns = imageResolution ? { requested_resolution: imageResolution } : {};
    const imageRequestOptions = {
      aspectRatio: input.data.aspectRatio,
      ...(requestedSize ? { size: requestedSize } : {}),
      ...(imageResolution ? { resolution: imageResolution } : {}),
      supportedParameters,
    };

    diagnosticStage = "campaign-context";
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("visual_style")
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
      if (input.data.purpose !== "style-preview" && savedStyle.status !== "ready") return NextResponse.json({ error: "Only ready visual styles can be used for campaign artwork." }, { status: 400 });
      visualStyle = savedStyle.visual_style;
    }

    const placeContextResult = input.data.targetKind === "place" && input.data.parentPlaceId && !isEdit
      ? await loadPlaceAiContext(supabase, input.data.campaignId, input.data.parentPlaceId)
      : { context: undefined };

    if ("error" in placeContextResult) {
      return NextResponse.json({ error: placeContextResult.error }, { status: placeContextResult.invalid ? 400 : 503 });
    }

    diagnosticStage = "reference-context";
    const referenceContext = await buildSystemReferenceContext(supabase, input.data.campaignId, isEdit ? [] : characterAccess
      ? [{ kind: "ancestry", text: characterAccess.character.species, binding: readReferenceBinding(characterAccess.character, "ancestry") }]
      : input.data.npcReferenceContext
        ? [{ kind: "ancestry", text: input.data.npcReferenceContext.species, binding: input.data.npcReferenceContext.ancestryReference }]
        : input.data.enemyReferenceContext
          ? [{ kind: "ancestry", binding: input.data.enemyReferenceContext.ancestryReference }]
          : [], "image");
    const referenceMetadata = referenceContext.sources.length ? { references: referenceContext.sources } : {};
    const referenceColumns = referenceContext.sources.length ? { reference_sources: referenceContext.sources } : {};
    const visualStyleHash = createHash("sha256").update(visualStyle).digest("hex");
    let studioManifest: StudioManifest | undefined;
    let editSource: ResolvedEditSource | undefined;
    if (input.data.edit) {
      diagnosticStage = "edit-source";
      if (!selectedModelDetails.inputModalities.includes("image")) {
        throw new StudioError("The selected model cannot edit images. Choose a model that accepts image input.");
      }
      editSource = await resolveEditSource({
        supabase,
        campaignId: input.data.campaignId,
        userId: context.user.id,
        role: context.role,
        input: input.data,
        edit: input.data.edit,
      });
      referenceProviders = await resolveReferenceProviders(campaignCredential.apiKey, selectedModel.id, 1);
      studioManifest = editSource.manifest;
    } else if (input.data.studio) {
      const loaded = await loadStudioSources(supabase, input.data.campaignId, input.data.studio);
      studioManifest = buildStudioManifest(input.data.studio, input.data.subject!, loaded, effectiveStudioStyle(input.data.studio, visualStyle));
      if (loaded.references.length) {
        if (!selectedModelDetails.inputModalities.includes("image")) throw new StudioError("The selected model does not accept image references. Choose another model or explicitly turn off references.");
        referenceProviders = await resolveReferenceProviders(campaignCredential.apiKey, selectedModel.id, loaded.references.length);
      }
    }
    const subject = input.data.subject ?? studioManifest?.direction ?? "Edited artwork";
    const studioReferences = !isEdit && studioManifest?.references.length ? studioManifest.references : undefined;
    let parentRunId = editSource?.parentRunId;
    if (!isEdit && input.data.parentRunId) {
      const { data: parentRun } = await supabase.from("ai_generation_runs").select("id")
        .eq("campaign_id", input.data.campaignId).eq("id", input.data.parentRunId).eq("requested_by", context.user.id).maybeSingle();
      parentRunId = parentRun?.id;
    }
    const lineageColumns = {
      operation: input.data.operation,
      ...(parentRunId ? { parent_run_id: parentRunId } : {}),
      ...(editSource ? { edit_source_kind: editSource.kind } : {}),
    };
    const studioColumns = studioManifest ? { studio_manifest_hash: studioManifestHash(studioManifest) } : {};
    const auditSubject = studioManifest ? `Studio ${input.data.targetKind}` : subject;
    const prompt = isEdit
      ? buildImageEditPrompt(input.data.edit!.instruction)
      : studioManifest
      ? buildStudioPrompt(input.data.targetKind as "scene" | "battlemap", studioManifest, input.data.refinement)
      : buildArtPrompt(
      subject,
      visualStyle,
      input.data.refinement,
      {
        targetKind: input.data.targetKind,
        referenceContext,
        placeContext: placeContextResult.context,
        characterContext: characterAccess
          ? {
              name: characterAccess.character.name,
              species: characterAccess.character.species,
              physicalDescription: characterAccess.character.physical_description,
            }
          : undefined,
      },
    );
    if (studioManifest && !isEdit && (!input.data.currentPrompt || input.data.currentPrompt !== prompt))
      throw new StudioError("The effective prompt changed. Review it again before generating an image.", 409);
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    if (shouldUseBackgroundImageGeneration(request, env)) {
      diagnosticStage = "background-dispatch";
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
          image_subject: auditSubject,
          provider: "openrouter",
          effective_model: selectedModel.id,
          target_kind: input.data.targetKind,
          aspect_ratio: input.data.aspectRatio,
          size: requestedSize ?? null,
          status: "pending",
          ...studioColumns,
          ...lineageColumns,
          ...resolutionColumns,
          ...referenceColumns,
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
        ...(input.data.operation !== "generate" ? { operation: input.data.operation } : {}),
        ...(requestedSize ? { size: requestedSize } : {}),
        ...(imageResolution ? { resolution: imageResolution } : {}),
        supportedParameters,
        ...referenceMetadata,
        ...(isEdit && editSource
          ? { editSource: { path: editSource.path }, referenceProviders }
          : studioReferences ? { imageReferences: studioReferences, referenceProviders } : {}),
      };

      try {
        await dispatchImageBackgroundJob(request.url, job, env.SUPABASE_SECRET_KEY);
      } catch {
        try {
          await markImageBackgroundDispatchFailed({
            campaignId: input.data.campaignId,
            generationRunId: generationRun.id,
            requestedBy: context.user.id,
            targetCharacterId: characterAccess?.character.id ?? null,
          });
        } catch (error) {
          logUnexpectedImageFailure("background-dispatch-failure-update", selectedModel.id, error);
        }
        return NextResponse.json({
          error: "Image generation could not be started. Its billing outcome is unknown; recover the existing job before retrying.",
          outcomeUnknown: true,
        }, { status: 503 });
      }

      return NextResponse.json({
        job: {
          generationRunId: generationRun.id,
          status: "pending",
          targetKind: input.data.targetKind,
          mode: input.data.mode,
          ...(input.data.operation !== "generate" ? { operation: input.data.operation } : {}),
          ...(parentRunId ? { parentRunId } : {}),
          purpose: input.data.purpose,
          subject,
          aspectRatio: input.data.aspectRatio,
          ...(requestedSize ? { size: requestedSize } : {}),
          ...(imageResolution ? { resolution: imageResolution } : {}),
          prompt,
          createdAt: new Date(generationRun.created_at).toISOString(),
          statusUpdatedAt: new Date(generationRun.status_updated_at ?? generationRun.created_at).toISOString(),
          model: selectedModel.id,
          ...referenceMetadata,
          ...(studioManifest ? { studioManifest } : {}),
          ...(characterAccess ? { characterId: characterAccess.character.id } : {}),
        },
        prompt,
      }, { status: 202 });
    }

    diagnosticStage = "provider-generation";
    let response;

    try {
      response = await generateImage(campaignCredential.apiKey, prompt, selectedModel.id, {
        ...imageRequestOptions,
        ...(isEdit && editSource ? {
          imageReferences: await loadEditSourceImage(supabase, input.data.campaignId, editSource.path),
          referenceProviders,
        } : studioReferences ? {
          imageReferences: await loadStudioReferenceImages(supabase, input.data.campaignId, studioReferences),
          referenceProviders,
        } : {}),
      });
    } catch (error: unknown) {
      logAiProviderFailure(error, { kind: "image", campaignId: input.data.campaignId, userId: context.user.id, model: selectedModel.id });
      const failure = getAiProviderFailure(error, "Art generation is temporarily unavailable.");
        await supabase.from("ai_generation_runs").insert({
          campaign_id: input.data.campaignId,
          requested_by: context.user.id,
          kind: "image",
          mode: input.data.mode,
          model: selectedModel.id,
          prompt_hash: promptHash,
          purpose: input.data.purpose,
          visual_style_hash: visualStyleHash,
          image_subject: auditSubject,
          target_kind: input.data.targetKind,
          aspect_ratio: input.data.aspectRatio,
          size: requestedSize ?? null,
          provider: "openrouter",
          effective_model: selectedModel.id,
          status: "failed",
          ...studioColumns,
          ...lineageColumns,
          ...resolutionColumns,
          ...(failure.outcomeUnknown ? { error_message: uncertainImageOutcomeMessage } : {}),
          ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
        });
      const headers = failure.retryAfter ? { "Retry-After": failure.retryAfter } : undefined;
      return NextResponse.json({
        error: failure.message,
        diagnosticStage: "provider-generation",
        ...(failure.outcomeUnknown ? { outcomeUnknown: true } : {}),
        ...(failure.requestId ? { providerRequestId: failure.requestId } : {}),
      }, { status: failure.status, ...(headers ? { headers } : {}) });
    }

    diagnosticStage = "image-storage";
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
          image_subject: auditSubject,
          target_kind: input.data.targetKind,
          provider: "openrouter",
          effective_model: selectedModel.id,
          status: "failed",
          ...studioColumns,
          ...lineageColumns,
          ...resolutionColumns,
          ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
        });
      return NextResponse.json({
        error: "The AI provider returned no image data.",
      }, { status: 502 });
    }

    const completedRunFields = {
      model: response.model,
      effective_model: response.model,
      generation_id: response.generationId,
      input_tokens: response.usage?.inputTokens,
      output_tokens: response.usage?.outputTokens,
      cost_usd: response.usage?.cost,
      status: "complete",
      status_updated_at: new Date().toISOString(),

    };
    const generationResult = await supabase.from("ai_generation_runs").insert({
          campaign_id: input.data.campaignId,
          requested_by: context.user.id,
          kind: "image",
          mode: input.data.mode,
          prompt_hash: promptHash,
          purpose: input.data.purpose,
          visual_style_hash: visualStyleHash,
          image_subject: auditSubject,
          provider: "openrouter",
          target_kind: input.data.targetKind,
          ...(characterAccess ? { target_character_id: characterAccess.character.id } : {}),
          aspect_ratio: input.data.aspectRatio,
          size: requestedSize ?? null,
          ...completedRunFields,
          ...studioColumns,
          ...lineageColumns,
          ...resolutionColumns,
          ...referenceColumns,
        }).select("id, created_at").single();
    const { data: generationRun, error: generationRunError } = generationResult;

    if (generationRunError || !generationRun) {
      return NextResponse.json({
        error: "Image draft metadata could not be saved.",
      }, { status: 503 });
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
    } else {
      let storedImage: Awaited<ReturnType<typeof storeTemporaryImage>> | null = null;
      try {
        storedImage = await storeTemporaryImage(
          supabase, input.data.campaignId, context.user.id, generationRun.id, image,
          input.data.purpose === "studio-art" ? "studio-draft" : "image",
        );
        const { data: attached, error: metadataError } = await supabase.rpc("attach_ai_generation_image", {
          p_generation_run_id: generationRun.id,
          p_image_path: storedImage.path,
          p_image_media_type: storedImage.mediaType,
        });
        if (metadataError || !attached) {
          throw new Error("The generated image metadata could not be saved.");
        }
        temporaryPath = storedImage.path;
        imageDraft = { base64: null, url: storedImage.signedUrl, mediaType: storedImage.mediaType };
      } catch {
        if (storedImage) {
          await supabase.storage.from(campaignArtBucket).remove([storedImage.path]);
        }
        return NextResponse.json({
          error: "The generated image could not be stored for review.",
          }, { status: 503 });
      }
    }

    const createdAt = new Date(generationRun.created_at).toISOString();
    diagnosticStage = "draft-validation";
    const draft = imageDraftSchema.safeParse({
      generationRunId: generationRun.id,
      targetKind: input.data.targetKind,
      ...(characterAccess ? { characterId: characterAccess.character.id } : {}),
      purpose: input.data.purpose,
      mode: input.data.mode,
      operation: input.data.operation,
      ...(parentRunId ? { parentRunId } : {}),
      subject,
      aspectRatio: input.data.aspectRatio,
      ...(requestedSize ? { size: requestedSize } : {}),
      ...(imageResolution ? { resolution: imageResolution } : {}),
      prompt,
      image: imageDraft,
      provider: "openrouter",
      model: response.model,
      createdAt,
      temporaryPath,
      ...(studioManifest ? { studioManifest } : {}),
      ...referenceMetadata,
    });

    if (!draft.success) {
      return NextResponse.json({
        error: "The AI response did not match the image draft format.",
        issues: draft.error.flatten(),
      }, { status: 502 });
    }

    return NextResponse.json({ draft: draft.data, model: response.model });
  } catch (error: unknown) {
    if (error instanceof StudioError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ReferenceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ImagePromptBudgetError) return NextResponse.json({ error: error.message }, { status: 400 });
    logUnexpectedImageFailure(diagnosticStage, diagnosticModel, error);
    return NextResponse.json({ error: "Art generation is temporarily unavailable.", diagnosticStage }, { status: 503 });
  }
}
