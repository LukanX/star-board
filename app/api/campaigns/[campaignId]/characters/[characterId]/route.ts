import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/permissions";
import { addCampaignArtUrls, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { updateCharacterSchema } from "@/lib/validation/character";

type RouteContext = { params: Promise<{ campaignId: string; characterId: string }> };

export const runtime = "nodejs";

const characterColumns = "id, owner_id, name, species, class_name, level, backstory_markdown, physical_description, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, characterId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateCharacterSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Character update is invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data: previousCharacter, error: previousCharacterError } = await context.supabase
      .from("characters")
      .select("art_path")
      .eq("id", characterId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (previousCharacterError) {
      return NextResponse.json({ error: "Unable to load character art." }, { status: 503 });
    }

    const update = {
      ...(input.data.name === undefined ? {} : { name: input.data.name }),
      ...(input.data.species === undefined ? {} : { species: input.data.species }),
      ...(input.data.className === undefined ? {} : { class_name: input.data.className }),
      ...(input.data.level === undefined ? {} : { level: input.data.level }),
      ...(input.data.backstoryMarkdown === undefined ? {} : { backstory_markdown: input.data.backstoryMarkdown }),
      ...(input.data.physicalDescription === undefined ? {} : { physical_description: input.data.physicalDescription }),
      ...(input.data.artSubject === undefined ? {} : { art_subject: input.data.artSubject }),
      ...(input.data.artPath === undefined ? {} : { art_path: input.data.artPath }),
      ...(input.data.artPrompt === undefined ? {} : { art_prompt: input.data.artPrompt }),
      ...(input.data.artProvider === undefined ? {} : { art_provider: input.data.artProvider }),
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase
      .from("characters")
      .update(update)
      .eq("id", characterId)
      .eq("campaign_id", campaignId)
      .select(characterColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update character." }, { status: 400 });
    }

    if (previousCharacter?.art_path !== data.art_path) {
      await removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousCharacter?.art_path);
    }

    const [character] = await addCampaignArtUrls(context.supabase, [data]);
    return NextResponse.json({ character });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, characterId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const { data, error } = await context.supabase
      .from("characters")
      .delete()
      .eq("id", characterId)
      .eq("campaign_id", campaignId)
      .select("id, art_path")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete character." }, { status: 400 });
    }

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, data.art_path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
