import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getRollingSevenDaysStart } from "@/lib/time";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const context = await requireCampaignGM(campaignId);

  if (!context) {
    return NextResponse.json({ error: "GM access is required to view AI usage." }, { status: 403 });
  }

  try {
    const periodStart = getRollingSevenDaysStart().toISOString();
    const { data, error } = await context.supabase
      .from("ai_generation_runs")
      .select("input_tokens, output_tokens")
      .eq("campaign_id", campaignId)
      .gte("created_at", periodStart);

    if (error) {
      return NextResponse.json({ error: "Campaign AI usage could not be loaded." }, { status: 503 });
    }

    const inputTokens = (data ?? []).reduce((total, run) => total + (run.input_tokens ?? 0), 0);
    const outputTokens = (data ?? []).reduce((total, run) => total + (run.output_tokens ?? 0), 0);

    return NextResponse.json({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, periodStart });
  } catch {
    return NextResponse.json({ error: "Campaign AI usage could not be loaded." }, { status: 503 });
  }
}