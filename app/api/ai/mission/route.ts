import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/client";
import { buildMissionPrompt } from "@/lib/ai/prompts";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { missionDraftSchema, missionGenerationInputSchema } from "@/lib/validation/ai";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = missionGenerationInputSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Mission request is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireCampaignGM(input.data.campaignId);

    if (!context) {
      return NextResponse.json({ error: "GM access is required for AI mission assistance." }, { status: 403 });
    }

    const draft = missionDraftSchema.safeParse(await generateJson(buildMissionPrompt(input.data)));

    if (!draft.success) {
      return NextResponse.json({ error: "The AI response did not match the mission draft format." }, { status: 502 });
    }

    return NextResponse.json({ draft: draft.data });
  } catch {
    return NextResponse.json({ error: "Mission assistance is temporarily unavailable." }, { status: 503 });
  }
}
