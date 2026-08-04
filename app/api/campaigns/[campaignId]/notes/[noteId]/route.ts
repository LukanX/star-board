import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { updateNoteSchema } from "@/lib/validation/note";

type RouteContext = { params: Promise<{ campaignId: string; noteId: string }> };

export const runtime = "nodejs";

const noteColumns = "id, campaign_id, episode_id, author_id, title, body_markdown, visibility, created_at, updated_at, updated_by";

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId, noteId } = await params;

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
      .from("campaign_notes")
      .select(noteColumns)
      .eq("id", noteId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign note." }, { status: 503 });
    }

    if (!data) {
      return NextResponse.json({ error: "Campaign note not found." }, { status: 404 });
    }

    const { data: author, error: authorError } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", data.author_id)
      .maybeSingle();

    if (authorError) {
      return NextResponse.json({ error: "Unable to load note author." }, { status: 503 });
    }

    const canManage = membership.role === "gm" || data.author_id === context.user.id;
    return NextResponse.json({
      role: membership.role,
      note: {
        ...data,
        author: { id: data.author_id, displayName: author?.display_name ?? "Crew member" },
        permissions: { canEdit: canManage, canDelete: canManage },
      },
    });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId, noteId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = updateNoteSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Note update is invalid.", issues: input.error.flatten() }, { status: 400 });
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

    if (input.data.visibility === "gm" && membership.role !== "gm") {
      return NextResponse.json({ error: "GM access is required for private notes." }, { status: 403 });
    }

    if (input.data.episodeId) {
      const { data: episode, error: episodeError } = await context.supabase
        .from("episodes")
        .select("id")
        .eq("id", input.data.episodeId)
        .eq("campaign_id", campaignId)
        .maybeSingle();

      if (episodeError) {
        return NextResponse.json({ error: "Unable to validate note episode." }, { status: 503 });
      }

      if (!episode) {
        return NextResponse.json({ error: "Note episode must belong to this campaign." }, { status: 400 });
      }
    }

    const update = {
      ...(input.data.title === undefined ? {} : { title: input.data.title }),
      ...(input.data.bodyMarkdown === undefined ? {} : { body_markdown: input.data.bodyMarkdown }),
      ...(input.data.visibility === undefined ? {} : { visibility: input.data.visibility }),
      ...(input.data.episodeId === undefined ? {} : { episode_id: input.data.episodeId }),
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase
      .from("campaign_notes")
      .update(update)
      .eq("id", noteId)
      .eq("campaign_id", campaignId)
      .select(noteColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update campaign note." }, { status: 400 });
    }

    const { data: author, error: authorError } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", data.author_id)
      .maybeSingle();

    if (authorError) {
      return NextResponse.json({ error: "Unable to load note author." }, { status: 503 });
    }

    const canManage = membership.role === "gm" || data.author_id === context.user.id;
    return NextResponse.json({ note: {
      ...data,
      author: { id: data.author_id, displayName: author?.display_name ?? "Crew member" },
      permissions: { canEdit: canManage, canDelete: canManage },
    } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { campaignId, noteId } = await params;

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
      .from("campaign_notes")
      .delete()
      .eq("id", noteId)
      .eq("campaign_id", campaignId)
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete campaign note." }, { status: 400 });
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}