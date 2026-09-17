import { NextResponse } from "next/server";
import { CampaignCredentialError } from "@/lib/ai/campaign-credentials";
import { getServerEnv } from "@/lib/env";
import { openRouterOAuthStateCookieName, openRouterOAuthStateLifetime } from "@/lib/ai/openrouter-oauth";

function secureCookie(request: Request) {
  return process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:";
}

function appOrigin(request: Request) {
  return getServerEnv().NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export function getOpenRouterOAuthStateSecret() {
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  if (!secret) throw new CampaignCredentialError("misconfigured", "OpenRouter connection state is not configured.");
  return secret;
}

export function buildOpenRouterCallbackUrl(request: Request, campaignId: string, state: string) {
  const callbackUrl = new URL(`/api/campaigns/${encodeURIComponent(campaignId)}/openrouter/callback`, appOrigin(request));
  callbackUrl.searchParams.set("state", state);
  return callbackUrl.toString();
}

export function buildCampaignSettingsUrl(request: Request, campaignId: string, outcome?: { status: string; reason?: string }) {
  const settingsUrl = new URL(`/campaigns/${encodeURIComponent(campaignId)}/settings`, appOrigin(request));
  if (outcome) {
    settingsUrl.searchParams.set("openrouter", outcome.status);
    if (outcome.reason) settingsUrl.searchParams.set("reason", outcome.reason);
  }
  return settingsUrl;
}

export function setOpenRouterOAuthStateCookie(response: NextResponse, request: Request, value: string) {
  response.cookies.set({
    name: openRouterOAuthStateCookieName,
    value,
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: openRouterOAuthStateLifetime,
  });
}

export function clearOpenRouterOAuthStateCookie(response: NextResponse, request: Request) {
  response.cookies.set({
    name: openRouterOAuthStateCookieName,
    value: "",
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function redirectOpenRouterCallback(request: Request, campaignId: string, outcome: { status: string; reason?: string }) {
  const response = NextResponse.redirect(buildCampaignSettingsUrl(request, campaignId, outcome));
  response.headers.set("Cache-Control", "no-store");
  clearOpenRouterOAuthStateCookie(response, request);
  return response;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}