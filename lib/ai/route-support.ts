import { NextResponse } from "next/server";
import { CampaignCredentialError, getCampaignCredentialForGeneration, type CampaignCredential } from "@/lib/ai/campaign-credentials";

export function campaignCredentialErrorResponse(error: unknown, fallback = "Campaign AI credentials are temporarily unavailable.") {
  if (!(error instanceof CampaignCredentialError)) {
    return NextResponse.json({ error: fallback }, { status: 503 });
  }

  const status = error.code === "missing" || error.code === "invalid" ? 409 : error.code === "forbidden" ? 403 : 503;
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}

export async function resolveCampaignCredential(campaignId: string): Promise<CampaignCredential> {
  return getCampaignCredentialForGeneration(campaignId);
}