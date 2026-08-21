import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { createNoteSchema } from "@/lib/validation/note";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

const noteColumns = "id, campaign_id, episode_id, author_id, title, body_markdown, visibility, created_at, updated_at, updated_by";

async function getAuthors(supabase: Awaited<ReturnType<typeof getAuthenticatedUser>> extends infer Context ? Context extends { supabase: infer Client } ? Client : never : never, notes: Array<{ author_id: string }>) {
  const authorIds = [...new Set(notes.map((note) => note.author_id))];

  if (!authorIds.length) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", authorIds);

  if (error) {
    throw new Error("Unable to load note authors.");
  }

  return new Map((data ?? []).map((profile) => [profile.id, profile.display_name]));
}

function withAuthor<T extends { author_id: string }>(note: T, authors: Map<string, string>, userId: string, role: "gm" | "player") {
  const canManage = role === "gm" || note.author_id === userId;
  return {
    ...note,
    author: { id: note.author_id, displayName: authors.get(note.author_id) ?? "Crew member" },
    permissions: { canEdit: canManage, canDelete: canManage },
  };
}

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
      .from("campaign_notes")
      .select(noteColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Unable to load campaign notes." }, { status: 503 });
    }

    const visibleNotes = (data ?? []).filter((note) => membership.role === "gm" || note.visibility === "player");
    const authors = await getAuthors(context.supabase, visibleNotes);
    const notes = visibleNotes.map((note) => withAuthor(note, authors, context.user.id, membership.role));

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, notes });
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

  const input = createNoteSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Note details are invalid.", issues: input.error.flatten() }, { status: 400 });
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

    const { data, error } = await context.supabase
      .from("campaign_notes")
      .insert({
        campaign_id: campaignId,
        episode_id: input.data.episodeId ?? null,
        author_id: context.user.id,
        title: input.data.title,
        body_markdown: input.data.bodyMarkdown,
        visibility: input.data.visibility,
        updated_by: context.user.id,
      })
      .select(noteColumns)
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to create campaign note." }, { status: 400 });
    }

    return NextResponse.json({ note: withAuthor(data, new Map([[context.user.id, membership.displayName]]), context.user.id, membership.role) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}