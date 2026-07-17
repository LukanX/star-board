import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { getPublicEnv } from "@/lib/env";
import { createJoinLinkSchema } from "@/lib/validation/campaign";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const input = createJoinLinkSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Join-link settings are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await requireCampaignGM(campaignId);

    if (!context) {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await context.supabase
      .from("campaign_join_links")
      .insert({
        campaign_id: campaignId,
        created_by: context.user.id,
        token_hash: tokenHash,
        expires_at: input.data.expiresAt ?? null,
        max_uses: input.data.maxUses,
      })
      .select("id, expires_at, max_uses")
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to create join link." }, { status: 400 });
    }

    const env = getPublicEnv();
    const appUrl = env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

    return NextResponse.json({
      link: data,
      joinUrl: `${appUrl}/join/${token}`,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
