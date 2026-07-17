import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildArtPrompt } from "@/lib/ai/prompts";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { imageGenerationInputSchema } from "@/lib/validation/image";

export const runtime = "nodejs";

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

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.images.generate({
      model: env.OPENAI_IMAGE_MODEL,
      prompt: buildArtPrompt(input.data.subject, input.data.campaignStyle),
      size: "1024x1024",
    });

    const image = response.data?.[0];

    if (!image?.b64_json && !image?.url) {
      return NextResponse.json({ error: "The AI provider returned no image data." }, { status: 502 });
    }

    return NextResponse.json({ image: { base64: image.b64_json ?? null, url: image.url ?? null } });
  } catch {
    return NextResponse.json({ error: "Art generation is temporarily unavailable." }, { status: 503 });
  }
}
