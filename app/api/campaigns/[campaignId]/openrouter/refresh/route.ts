import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { CampaignCredentialError, getCampaignCredentialForRefresh, getCampaignCredentialStatusForManager, markCampaignCredentialInvalid, updateCampaignCredentialMetadata } from "@/lib/ai/campaign-credentials";
import { getOpenRouterKeyMetadata, OpenRouterOAuthError } from "@/lib/ai/openrouter-oauth";
import { campaignCredentialErrorResponse } from "@/lib/ai/route-support";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const context = await getAuthenticatedUser();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  let access;
  try {
    access = await getCampaignCredentialForRefresh(campaignId, context.supabase, context.user.id);
  } catch (error) {
    return campaignCredentialErrorResponse(error, "Campaign OpenRouter key could not be refreshed.");
  }

  try {
    const metadata = await getOpenRouterKeyMetadata(access.apiKey);
    await updateCampaignCredentialMetadata(campaignId, { ...metadata, verificationStatus: "verified", verificationError: null, lastVerifiedAt: new Date().toISOString() });
    const result = await getCampaignCredentialStatusForManager(campaignId, context.supabase, context.user.id);
    return NextResponse.json({ credential: result.status });
  } catch (error) {
    if (error instanceof OpenRouterOAuthError && error.status === 401) {
      try {
        await markCampaignCredentialInvalid(campaignId, "The campaign OpenRouter key was rejected.");
      } catch (updateError) {
        if (!(updateError instanceof CampaignCredentialError)) throw updateError;
      }
      return NextResponse.json({ error: "The campaign OpenRouter key was rejected. Reconnect OpenRouter to continue.", code: "invalid" }, { status: 409 });
    }
    return NextResponse.json({ error: "Campaign OpenRouter key details could not be refreshed." }, { status: 503 });
  }
}