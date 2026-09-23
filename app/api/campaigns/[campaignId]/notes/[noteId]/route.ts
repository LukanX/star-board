import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { updateNoteSchema } from "@/lib/validation/note";
import { campaignNoteColumns, noteSubjectFromDatabase } from "@/lib/campaign/note-subject";
import { maskHiddenNoteEntityLinks, validateNoteEntityLinks } from "@/lib/campaign/note-links";

type RouteContext = { params: Promise<{ campaignId: string; noteId: string }> };

export const runtime = "nodejs";

const noteColumns = campaignNoteColumns;

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>> extends infer Context
  ? Context extends { supabase: infer Client }
    ? Client
    : never
  : never;
type NoteMutationRecord = { author_id: string; episode_id: string | null; body_markdown: string; visibility: "player" | "gm"; revision: number; is_entity_note: boolean };
type NoteMutationAccess = { response: NextResponse } | { note: NoteMutationRecord };

async function authorizeNoteMutation(supabase: SupabaseClient, campaignId: string, noteId: string, userId: string, role: "gm" | "player"): Promise<NoteMutationAccess> {
  const { data, error } = await supabase
    .from("campaign_notes")
    .select("author_id, episode_id, body_markdown, visibility, revision, character_id, npc_id, place_id, faction_id, job_id, enemy_id")
    .eq("id", noteId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) return { response: NextResponse.json({ error: "Unable to load campaign note." }, { status: 503 }) };
  if (!data) return { response: NextResponse.json({ error: "Campaign note not found." }, { status: 404 }) };

  const row = data as NoteMutationRecord & { character_id?: string | null; npc_id?: string | null; place_id?: string | null; faction_id?: string | null; job_id?: string | null; enemy_id?: string | null };
  const note: NoteMutationRecord = {
    author_id: row.author_id,
    episode_id: row.episode_id,
    body_markdown: row.body_markdown,
    visibility: row.visibility,
    revision: row.revision,
    is_entity_note: Boolean(row.character_id || row.npc_id || row.place_id || row.faction_id || row.job_id || row.enemy_id),
  };
  if (role !== "gm" && note.visibility !== "player") {
    return { response: NextResponse.json({ error: "Campaign note not found." }, { status: 404 }) };
  }
  return { note };
}

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

    if (membership.role !== "gm" && data.visibility !== "player") {
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
    const bodyMarkdown = await maskHiddenNoteEntityLinks(context.supabase, campaignId, data.body_markdown, data.visibility);
    const note = noteSubjectFromDatabase({ ...data, body_markdown: bodyMarkdown });
    return NextResponse.json({
      role: membership.role,
      note: {
        ...note,
        author: { id: data.author_id, displayName: author?.display_name ?? "Crew member" },
        permissions: {
          canEdit: membership.role === "gm" || (data.visibility === "player" && !note.entity_type),
          canDelete: canManage,
          canChangeEpisode: canManage,
          canChangeVisibility: membership.role === "gm",
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<NextResponse> {
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

    const access = await authorizeNoteMutation(context.supabase, campaignId, noteId, context.user.id, membership.role);
    if ("response" in access) return access.response;

    if (access.note.is_entity_note && membership.role !== "gm" && access.note.author_id !== context.user.id) {
      return NextResponse.json({ error: "Entity note author or GM access is required." }, { status: 403 });
    }

    if (input.data.visibility === "gm" && membership.role !== "gm") {
      return NextResponse.json({ error: "GM access is required for private notes." }, { status: 403 });
    }

    const nextVisibility = input.data.visibility ?? access.note.visibility;
    if (nextVisibility === "player" && (input.data.bodyMarkdown !== undefined || input.data.visibility === "player")) {
      const nextBody = input.data.bodyMarkdown ?? access.note.body_markdown;
      if (!(await validateNoteEntityLinks(context.supabase, campaignId, nextBody))) {
        return NextResponse.json({ error: "Player-visible notes can only link to campaign entities visible to players." }, { status: 400 });
      }
    }

    if (
      input.data.episodeId !== undefined &&
      input.data.episodeId !== access.note.episode_id &&
      access.note.author_id !== context.user.id &&
      membership.role !== "gm"
    ) {
      return NextResponse.json({ error: "Only the note author or a campaign GM can change its episode." }, { status: 403 });
    }

    if (
      input.data.title === undefined &&
      input.data.bodyMarkdown === undefined &&
      input.data.visibility === undefined &&
      input.data.episodeId === undefined
    ) {
      return NextResponse.json({ error: "At least one note field must be updated." }, { status: 400 });
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
    };
    const { data, error } = await context.supabase
      .from("campaign_notes")
      .update(update)
      .eq("id", noteId)
      .eq("campaign_id", campaignId)
      .eq("revision", input.data.expectedRevision)
      .select(noteColumns)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to update campaign note." }, { status: 400 });
    }

    if (!data) {
      const { data: latestNote, error: latestError } = await context.supabase
        .from("campaign_notes")
        .select(noteColumns)
        .eq("id", noteId)
        .eq("campaign_id", campaignId)
        .maybeSingle();

      if (latestError) {
        return NextResponse.json({ error: "Unable to check the latest campaign note." }, { status: 503 });
      }

      if (!latestNote || (membership.role !== "gm" && latestNote.visibility !== "player")) {
        return NextResponse.json({ error: "The note changed or is no longer available." }, { status: 409 });
      }

      const { data: latestAuthor, error: latestAuthorError } = await context.supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", latestNote.author_id)
        .maybeSingle();

      if (latestAuthorError) {
        return NextResponse.json({ error: "Unable to load the latest note author." }, { status: 503 });
      }

      const canManageLatest = membership.role === "gm" || latestNote.author_id === context.user.id;
      const latestBody = await maskHiddenNoteEntityLinks(context.supabase, campaignId, latestNote.body_markdown, latestNote.visibility);
      const normalizedLatest = noteSubjectFromDatabase({ ...latestNote, body_markdown: latestBody });
      return NextResponse.json({
        error: "Another crew member saved a newer version. Your changes are still here.",
        latestNote: {
          ...normalizedLatest,
          author: { id: latestNote.author_id, displayName: latestAuthor?.display_name ?? "Crew member" },
          permissions: {
            canEdit: membership.role === "gm" || (latestNote.visibility === "player" && !normalizedLatest.entity_type),
            canDelete: canManageLatest,
            canChangeEpisode: canManageLatest,
            canChangeVisibility: membership.role === "gm",
          },
        },
      }, { status: 409 });
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
    const bodyMarkdown = await maskHiddenNoteEntityLinks(context.supabase, campaignId, data.body_markdown, data.visibility);
    const normalizedNote = noteSubjectFromDatabase({ ...data, body_markdown: bodyMarkdown });
    return NextResponse.json({ note: {
      ...normalizedNote,
      author: { id: data.author_id, displayName: author?.display_name ?? "Crew member" },
      permissions: {
        canEdit: membership.role === "gm" || (data.visibility === "player" && !normalizedNote.entity_type),
        canDelete: canManage,
        canChangeEpisode: canManage,
        canChangeVisibility: membership.role === "gm",
      },
    } });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext): Promise<NextResponse> {
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

    const access = await authorizeNoteMutation(context.supabase, campaignId, noteId, context.user.id, membership.role);
    if ("response" in access) return access.response;

    if (membership.role !== "gm" && access.note.author_id !== context.user.id) {
      return NextResponse.json({ error: "Note author or GM access is required." }, { status: 403 });
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