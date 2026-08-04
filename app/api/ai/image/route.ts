import { createHash } from "node:crypto";
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildArtPrompt } from "@/lib/ai/prompts";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { imageDraftSchema, imageGenerationInputSchema } from "@/lib/validation/image";

export const runtime = "nodejs";

const imageGenerationLimit = 10;
const imageGenerationWindowMs = 60 * 60 * 1000;

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

    if (!env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI image generation is not configured." }, { status: 503 });
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

    const windowStart = new Date(Date.now() - imageGenerationWindowMs).toISOString();
    const { count, error: rateLimitError } = await context.supabase
      .from("ai_generation_runs")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", input.data.campaignId)
      .eq("requested_by", context.user.id)
      .eq("kind", "image")
      .gte("created_at", windowStart);

    if (rateLimitError) {
      return NextResponse.json({ error: "AI generation limits could not be checked." }, { status: 503 });
    }

    if ((count ?? 0) >= imageGenerationLimit) {
      return NextResponse.json(
        { error: "Image generation is temporarily rate-limited. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(imageGenerationWindowMs / 1000)) } },
      );
    }

    const campaignStyle = [
      campaign.system,
      campaign.description,
      campaign.art_style_suffix,
      input.data.campaignStyle,
    ].filter(Boolean).join(". ");
    const prompt = buildArtPrompt(input.data.subject, campaignStyle, input.data.refinement, input.data.currentPrompt);
    const promptHash = createHash("sha256").update(prompt).digest("hex");
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    let response;

    try {
      response = await client.images.generate({
        model: env.OPENAI_IMAGE_MODEL,
        prompt,
        size: "1024x1024",
      });
    } catch {
      await context.supabase.from("ai_generation_runs").insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: env.OPENAI_IMAGE_MODEL,
        prompt_hash: promptHash,
        status: "failed",
      });
      return NextResponse.json({ error: "Art generation is temporarily unavailable." }, { status: 503 });
    }

    const image = response.data?.[0];

    if (!image?.b64_json && !image?.url) {
      await context.supabase.from("ai_generation_runs").insert({
        campaign_id: input.data.campaignId,
        requested_by: context.user.id,
        kind: "image",
        mode: input.data.mode,
        model: env.OPENAI_IMAGE_MODEL,
        prompt_hash: promptHash,
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
        model: env.OPENAI_IMAGE_MODEL,
        prompt_hash: promptHash,
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
      prompt,
      image: { base64: image.b64_json ?? null, url: image.url ?? null },
      provider: "openai",
      model: env.OPENAI_IMAGE_MODEL,
      createdAt,
    });

    if (!draft.success) {
      return NextResponse.json({ error: "The AI response did not match the image draft format.", issues: draft.error.flatten() }, { status: 502 });
    }

    return NextResponse.json({ draft: draft.data });
  } catch {
    return NextResponse.json({ error: "Art generation is temporarily unavailable." }, { status: 503 });
  }
}
