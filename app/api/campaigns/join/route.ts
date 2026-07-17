import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { redeemJoinLinkSchema } from "@/lib/validation/campaign";

export const runtime = "nodejs";

function hashJoinToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = redeemJoinLinkSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Join token is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data, error } = await context.supabase.rpc("redeem_campaign_join_link", {
      join_token_hash: hashJoinToken(input.data.token),
    });

    if (error) {
      return NextResponse.json({ error: "Join token is invalid or expired." }, { status: 400 });
    }

    return NextResponse.json({ campaignId: data });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
