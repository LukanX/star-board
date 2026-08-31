import { cookies } from "next/headers";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { CampaignCredentialError, getCampaignCredentialForManager, saveCampaignCredential } from "@/lib/ai/campaign-credentials";
import { exchangeOpenRouterCode, getOpenRouterKeyMetadata, OpenRouterOAuthError, openRouterOAuthStateCookieName, verifyOpenRouterOAuthState } from "@/lib/ai/openrouter-oauth";
import { getOpenRouterOAuthStateSecret, redirectOpenRouterCallback } from "@/lib/ai/openrouter-route";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

function oauthFailureReason(error: unknown) {
  if (error instanceof CampaignCredentialError) {
    if (error.code === "forbidden") return "forbidden";
    if (error.code === "misconfigured") return "configuration";
    return "storage";
  }
  if (error instanceof OpenRouterOAuthError) {
    if (error.status === 504 || error.status === 503) return "provider_unavailable";
    return "provider";
  }
  return "connection";
}

export async function GET(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const callbackState = searchParams.get("state");
  const cookieValue = (await cookies()).get(openRouterOAuthStateCookieName)?.value;

  let state;
  try {
    state = verifyOpenRouterOAuthState(cookieValue, getOpenRouterOAuthStateSecret());
  } catch {
    return redirectOpenRouterCallback(request, campaignId, { status: "error", reason: "invalid_state" });
  }

  if (state.campaignId !== campaignId || state.state !== callbackState) {
    return redirectOpenRouterCallback(request, campaignId, { status: "error", reason: "invalid_state" });
  }

  const context = await getAuthenticatedUser();
  if (!context || context.user.id !== state.userId) {
    return redirectOpenRouterCallback(request, campaignId, { status: "error", reason: "authentication" });
  }

  try {
    await getCampaignCredentialForManager(campaignId, context.supabase, context.user.id);
  } catch (error) {
    return redirectOpenRouterCallback(request, campaignId, { status: "error", reason: oauthFailureReason(error) });
  }

  if (searchParams.get("error")) {
    return redirectOpenRouterCallback(request, campaignId, { status: "cancelled" });
  }

  const code = searchParams.get("code");
  if (!code) return redirectOpenRouterCallback(request, campaignId, { status: "error", reason: "missing_code" });

  try {
    const apiKey = await exchangeOpenRouterCode(code, state.codeVerifier);
    const metadata = await getOpenRouterKeyMetadata(apiKey);
    await saveCampaignCredential({
      campaignId,
      apiKey,
      connectedBy: context.user.id,
      metadata: { ...metadata, verificationStatus: "verified", verificationError: null, lastVerifiedAt: new Date().toISOString() },
      resetPlayerAccess: true,
    });
    return redirectOpenRouterCallback(request, campaignId, { status: "connected" });
  } catch (error) {
    return redirectOpenRouterCallback(request, campaignId, { status: "error", reason: oauthFailureReason(error) });
  }
}