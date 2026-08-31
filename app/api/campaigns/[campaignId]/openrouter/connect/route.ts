import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { getCampaignCredentialForManager } from "@/lib/ai/campaign-credentials";
import { buildOpenRouterAuthorizationUrl, createOpenRouterOAuthState } from "@/lib/ai/openrouter-oauth";
import { campaignCredentialErrorResponse } from "@/lib/ai/route-support";
import { buildOpenRouterCallbackUrl, getOpenRouterOAuthStateSecret, isSameOriginRequest, setOpenRouterOAuthStateCookie } from "@/lib/ai/openrouter-route";
import { getServerEnv } from "@/lib/env";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "OpenRouter connection must start from this site." }, { status: 403 });

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

    try {
      await getCampaignCredentialForManager(campaignId, context.supabase, context.user.id);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "OpenRouter connection is temporarily unavailable.");
    }

    const env = getServerEnv();
    const pending = createOpenRouterOAuthState(campaignId, context.user.id, getOpenRouterOAuthStateSecret());
    const authorizationUrl = buildOpenRouterAuthorizationUrl({
      callbackUrl: buildOpenRouterCallbackUrl(request, campaignId, pending.state),
      codeChallenge: pending.codeChallenge,
      keyLabel: env.OPENROUTER_APP_NAME ? `${env.OPENROUTER_APP_NAME} campaign key` : "Star Board campaign key",
    });
    const response = NextResponse.json({ authorizationUrl });
    response.headers.set("Cache-Control", "no-store");
    setOpenRouterOAuthStateCookie(response, request, pending.cookieValue);
    return response;
  } catch (error) {
    return campaignCredentialErrorResponse(error, "OpenRouter connection is temporarily unavailable.");
  }
}