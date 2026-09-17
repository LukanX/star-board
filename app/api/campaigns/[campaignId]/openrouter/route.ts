import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { disconnectCampaignCredential, getCampaignCredentialStatusForManager, setCampaignPlayerAi } from "@/lib/ai/campaign-credentials";
import { campaignCredentialErrorResponse } from "@/lib/ai/route-support";
import { isSameOriginRequest } from "@/lib/ai/openrouter-route";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const playerAiSchema = z.object({ allowPlayerAi: z.boolean() });

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function managerContext(campaignId: string) {
  const context = await getAuthenticatedUser();
  if (!context) return { response: noStoreJson({ error: "Authentication is required." }, { status: 401 }) };
  return { context, result: await getCampaignCredentialStatusForManager(campaignId, context.supabase, context.user.id) };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  try {
    const result = await managerContext(campaignId);
    if (result.response) return result.response;
    return noStoreJson({ credential: result.result.status });
  } catch (error) {
    return campaignCredentialErrorResponse(error, "Campaign OpenRouter status is temporarily unavailable.");
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  if (!isSameOriginRequest(request)) return noStoreJson({ error: "OpenRouter settings must be changed from this site." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = playerAiSchema.safeParse(body);
  if (!input.success) return noStoreJson({ error: "Player AI preference is invalid." }, { status: 400 });

  try {
    const context = await getAuthenticatedUser();
    if (!context) return noStoreJson({ error: "Authentication is required." }, { status: 401 });
    await setCampaignPlayerAi(campaignId, context.supabase, context.user.id, input.data.allowPlayerAi);
    const result = await getCampaignCredentialStatusForManager(campaignId, context.supabase, context.user.id);
    return noStoreJson({ credential: result.status });
  } catch (error) {
    return campaignCredentialErrorResponse(error, "Player AI preference could not be updated.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  if (!isSameOriginRequest(_request)) return noStoreJson({ error: "OpenRouter settings must be changed from this site." }, { status: 403 });

  try {
    const context = await getAuthenticatedUser();
    if (!context) return noStoreJson({ error: "Authentication is required." }, { status: 401 });
    await disconnectCampaignCredential(campaignId, context.supabase, context.user.id);
    return noStoreJson({ credential: { connected: false, verificationStatus: "disconnected" } });
  } catch (error) {
    return campaignCredentialErrorResponse(error, "Campaign OpenRouter connection could not be disconnected.");
  }
}