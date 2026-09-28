import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getCampaignMembership, type CampaignMembership } from "@/lib/auth/permissions";
import { campaignNoteColumns, noteSubjectColumnByType, noteSubjectFromDatabase, type NoteEntitySubject } from "@/lib/campaign/note-subject";
import { maskHiddenNoteEntityLinks, maskHiddenNoteEntityLinksBatch } from "@/lib/campaign/note-links";
import type { ApiCampaignNote, NoteVisibility } from "@/lib/campaign/types";

export type CampaignNotesResult = {
  role: CampaignMembership["role"];
  displayName: string;
  notes: ApiCampaignNote[];
};

export type CampaignNoteResult = {
  role: CampaignMembership["role"];
  displayName: string;
  note: ApiCampaignNote;
};

type NoteRow = Omit<ApiCampaignNote, "author" | "permissions" | "entity_type" | "entity_id"> & {
  character_id: string | null;
  npc_id: string | null;
  place_id: string | null;
  faction_id: string | null;
  job_id: string | null;
  enemy_id: string | null;
};

async function getCampaignContext(campaignId: string) {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  return { ...context, membership };
}

function canReadNote(role: CampaignMembership["role"], visibility: NoteVisibility): boolean {
  return role === "gm" || visibility === "player";
}

async function getAuthors(supabase: SupabaseClient, notes: NoteRow[]) {
  const authorIds = [...new Set(notes.map((note) => note.author_id))];
  if (!authorIds.length) return new Map<string, string>();

  const { data, error } = await supabase.from("profiles").select("id, display_name").in("id", authorIds);
  if (error) throw new Error(`Unable to read note authors: ${error.message}`);

  return new Map((data ?? []).map((author) => [author.id, author.display_name]));
}

function withAuthor(note: NoteRow, authors: Map<string, string>, userId: string, role: CampaignMembership["role"]): ApiCampaignNote {
  const canManage = role === "gm" || note.author_id === userId;
  const normalizedNote = noteSubjectFromDatabase(note);
  const isEntityNote = normalizedNote.entity_type !== null;
  return {
    ...normalizedNote,
    author: { id: note.author_id, displayName: authors.get(note.author_id) ?? "Crew member" },
    permissions: {
      canEdit: role === "gm" || (note.visibility === "player" && (!isEntityNote || note.author_id === userId)),
      canDelete: canManage,
      canChangeEpisode: canManage,
      canChangeVisibility: role === "gm",
    },
  };
}

export async function getCampaignNotes(campaignId: string): Promise<CampaignNotesResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("campaign_notes")
    .select(campaignNoteColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to read campaign notes: ${error.message}`);

  const notes = ((data ?? []) as NoteRow[]).filter((note) => canReadNote(context.membership.role, note.visibility));
  const authors = await getAuthors(context.supabase, notes);
  const maskedBodies = await maskHiddenNoteEntityLinksBatch(
    context.supabase,
    campaignId,
    notes.map((note) => ({ markdown: note.body_markdown, visibility: note.visibility })),
  );

  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    notes: notes.map((note, index) => withAuthor(
      { ...note, body_markdown: maskedBodies[index] ?? note.body_markdown },
      authors,
      context.user.id,
      context.membership.role,
    )),
  };
}

export async function getCampaignNote(campaignId: string, noteId: string): Promise<CampaignNoteResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("campaign_notes")
    .select(campaignNoteColumns)
    .eq("id", noteId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign note: ${error.message}`);
  if (!data) return null;

  const note = data as NoteRow;
  if (!canReadNote(context.membership.role, note.visibility)) return null;

  const { data: author, error: authorError } = await context.supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", note.author_id)
    .maybeSingle();

  if (authorError) throw new Error(`Unable to read note author: ${authorError.message}`);

  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    note: withAuthor(
      { ...note, body_markdown: await maskHiddenNoteEntityLinks(context.supabase, campaignId, note.body_markdown, note.visibility) },
      new Map([[note.author_id, author?.display_name ?? "Crew member"]]),
      context.user.id,
      context.membership.role,
    ),
  };
}

export async function getCampaignEntityNotes(
  campaignId: string,
  subject: NoteEntitySubject,
): Promise<CampaignNotesResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const column = noteSubjectColumnByType[subject.type];
  const { data, error } = await context.supabase
    .from("campaign_notes")
    .select(campaignNoteColumns)
    .eq("campaign_id", campaignId)
    .eq(column, subject.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to read entity notes: ${error.message}`);

  const notes = ((data ?? []) as NoteRow[]).filter((note) => canReadNote(context.membership.role, note.visibility));
  const authors = await getAuthors(context.supabase, notes);
  const maskedBodies = await maskHiddenNoteEntityLinksBatch(
    context.supabase,
    campaignId,
    notes.map((note) => ({ markdown: note.body_markdown, visibility: note.visibility })),
  );
  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    notes: notes.map((note, index) => withAuthor(
      { ...note, body_markdown: maskedBodies[index] ?? note.body_markdown },
      authors,
      context.user.id,
      context.membership.role,
    )),
  };
}