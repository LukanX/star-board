import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import { createCharacterSchema } from "@/lib/validation/character";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const characterColumns = "id, owner_id, name, species, class_name, level, backstory_markdown, physical_description, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

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
      .from("characters")
      .select(characterColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign characters." }, { status: 503 });
    }

    const characters = await addCampaignArtUrls(context.supabase, data ?? []);
    return NextResponse.json({ role: membership.role, displayName: membership.displayName, characters });
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

  const input = createCharacterSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Character details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (!role) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("characters")
      .insert({
        campaign_id: campaignId,
        owner_id: context.user.id,
        name: input.data.name,
        species: input.data.species,
        class_name: input.data.className,
        level: input.data.level,
        backstory_markdown: input.data.backstoryMarkdown,
        physical_description: input.data.physicalDescription,
        art_subject: input.data.artSubject ?? null,
        art_path: input.data.artPath ?? null,
        art_prompt: input.data.artPrompt ?? null,
        art_provider: input.data.artProvider ?? null,
        updated_by: context.user.id,
      })
      .select(characterColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to create character." }, { status: 400 });
    }

    const [character] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ character }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
