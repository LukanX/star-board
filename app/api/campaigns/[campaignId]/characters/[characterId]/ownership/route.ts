import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { getCampaignCharacter } from "@/lib/campaign/characters-server";
import { reassignCharacterOwnerSchema } from "@/lib/validation/character";

type RouteContext = { params: Promise<{ campaignId: string; characterId: string }> };

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, characterId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = reassignCharacterOwnerSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Character ownership is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const { error } = await context.supabase.rpc("reassign_character_owner", {
      target_campaign_id: campaignId,
      target_character_id: characterId,
      new_owner_id: input.data.ownerId,
    });

    if (error) {
      if (error.message.includes("was not found")) {
        return NextResponse.json({ error: "Character not found." }, { status: 404 });
      }

      if (error.message.includes("Campaign membership") || error.message.includes("owner or a campaign GM")) {
        return NextResponse.json({ error: "Only the current character owner or a campaign GM can reassign ownership." }, { status: 403 });
      }

      if (error.message.includes("must be a campaign member")) {
        return NextResponse.json({ error: "Character owner must be a campaign member." }, { status: 400 });
      }

      return NextResponse.json({ error: "Unable to reassign character ownership." }, { status: 400 });
    }

    const character = await getCampaignCharacter(campaignId, characterId);

    if (!character) {
      return NextResponse.json({ error: "Character could not be reloaded." }, { status: 503 });
    }

    return NextResponse.json({ character });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
