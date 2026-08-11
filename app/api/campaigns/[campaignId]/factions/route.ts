import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import { createFactionSchema } from "@/lib/validation/faction";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const factionColumns = "id, author_id, name, description, status, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("factions")
      .select(factionColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign factions." }, { status: 503 });
    }

    const factions = await addCampaignArtUrls(context.supabase, data ?? []);
    return NextResponse.json({ role: membership.role, displayName: membership.displayName, factions });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = createFactionSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Faction details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("factions")
      .insert({
        campaign_id: campaignId,
        author_id: context.user.id,
        name: input.data.name,
        description: input.data.description,
        status: input.data.status,
        art_subject: input.data.artSubject ?? null,
        art_path: input.data.artPath ?? null,
        art_prompt: input.data.artPrompt ?? null,
        art_provider: input.data.artProvider ?? null,
        updated_by: context.user.id,
      })
      .select(factionColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to create faction." }, { status: 400 });
    }

    const [faction] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ faction }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}