import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";
import { maskPlayerFacingEntityMarkdownBatch } from "@/lib/campaign/note-links";
import { validateCampaignEntityLinkFields } from "@/lib/campaign/note-links";
import { createCharacterSchema } from "@/lib/validation/character";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const characterColumns = "id, owner_id, is_active, name, species, class_name, level, backstory_markdown, physical_description, physical_description_is_markdown, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

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

    let characters = await addCampaignArtUrls(context.supabase, data ?? []);
    if (membership.role !== "gm") {
      characters = await maskPlayerFacingEntityMarkdownBatch(context.supabase, campaignId, characters, (character) => [
        { key: "backstory_markdown", markdown: character.backstory_markdown },
        ...(character.physical_description_is_markdown ? [{ key: "physical_description", markdown: character.physical_description }] : []),
      ]);
    }
    const charactersWithPermissions = characters.map((character) => ({ ...character, can_edit: membership.role === "gm" || character.owner_id === context.user.id }));
    return NextResponse.json({ role: membership.role, displayName: membership.displayName, characters: charactersWithPermissions });
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

    const ownerId = input.data.ownerId === undefined ? context.user.id : input.data.ownerId;

    if (role === "player" && ownerId !== context.user.id) {
      return NextResponse.json({ error: "Only a campaign GM can choose another character owner or leave a character unassigned." }, { status: 403 });
    }

    const narrativeFields = [
      { markdown: input.data.backstoryMarkdown, audience: "player" as const },
      ...(input.data.physicalDescriptionIsMarkdown
        ? [{ markdown: input.data.physicalDescription, audience: "player" as const }]
        : []),
    ];
    if (!(await validateCampaignEntityLinkFields(context.supabase, campaignId, narrativeFields))) {
      return NextResponse.json({ error: "Character details link to an inaccessible or invalid campaign record." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("characters")
      .insert({
        campaign_id: campaignId,
        owner_id: ownerId,
        is_active: input.data.isActive,
        name: input.data.name,
        species: input.data.species,
        class_name: input.data.className,
        level: input.data.level,
        backstory_markdown: input.data.backstoryMarkdown,
        physical_description: input.data.physicalDescription,
        physical_description_is_markdown: input.data.physicalDescriptionIsMarkdown,
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
    return NextResponse.json({ character: { ...character, can_edit: role === "gm" || character.owner_id === context.user.id } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
