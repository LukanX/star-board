import { getAuthenticatedUser, getCampaignMembership, type CampaignMembership } from "@/lib/auth/permissions";
import { maskHiddenNoteEntityLinksBatch, maskPlayerFacingEntityMarkdownBatch } from "@/lib/campaign/note-links";
import type { ApiEpisode, EpisodeNote } from "@/lib/campaign/types";

export type CampaignEpisode = ApiEpisode;

export type CampaignEpisodesResult = {
  role: CampaignMembership["role"];
  displayName: string;
  episodes: CampaignEpisode[];
};

export type CampaignEpisodeResult = {
  role: CampaignMembership["role"];
  displayName: string;
  episode: CampaignEpisode;
  notes: EpisodeNote[];
};

type EpisodeRow = Omit<ApiEpisode, "noteCount">;
type EpisodeNoteRow = Omit<EpisodeNote, "author" | "permissions">;
type EpisodeNoteCountRow = { episode_id: string | null; visibility: EpisodeNoteRow["visibility"] };

const episodeColumns = "id, campaign_id, source_job_id, place_id, created_by, title, summary, player_context_markdown, status, started_at, completed_at, created_at, updated_at";

async function getCampaignContext(campaignId: string) {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  return { ...context, membership };
}

function canReadNote(role: CampaignMembership["role"], visibility: EpisodeNoteRow["visibility"]): boolean {
  return role === "gm" || visibility === "player";
}

export async function getCampaignEpisodes(campaignId: string): Promise<CampaignEpisodesResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const [episodesResult, notesResult] = await Promise.all([
    context.supabase
      .from("episodes")
      .select(episodeColumns)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("campaign_notes")
      .select("episode_id, visibility")
      .eq("campaign_id", campaignId)
      .not("episode_id", "is", null),
  ]);

  if (episodesResult.error) throw new Error(`Unable to read campaign episodes: ${episodesResult.error.message}`);
  if (notesResult.error) throw new Error(`Unable to read episode note counts: ${notesResult.error.message}`);

  const noteCounts = new Map<string, number>();
  for (const note of (notesResult.data ?? []) as EpisodeNoteCountRow[]) {
    if (note.episode_id && canReadNote(context.membership.role, note.visibility)) {
      noteCounts.set(note.episode_id, (noteCounts.get(note.episode_id) ?? 0) + 1);
    }
  }

  let episodes = (episodesResult.data ?? []) as EpisodeRow[];
  if (context.membership.role !== "gm") {
    episodes = await maskPlayerFacingEntityMarkdownBatch(context.supabase, campaignId, episodes, (episode) => [
      { key: "summary", markdown: episode.summary },
      { key: "player_context_markdown", markdown: episode.player_context_markdown },
    ]);
  }
  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    episodes: episodes.map((episode) => ({ ...episode, noteCount: noteCounts.get(episode.id) ?? 0 })),
  };
}

export async function getCampaignEpisode(campaignId: string, episodeId: string): Promise<CampaignEpisodeResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const { data: episodeData, error: episodeError } = await context.supabase
    .from("episodes")
    .select(episodeColumns)
    .eq("id", episodeId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (episodeError) throw new Error(`Unable to read campaign episode: ${episodeError.message}`);
  if (!episodeData) return null;

  const { data: noteData, error: notesError } = await context.supabase
    .from("campaign_notes")
    .select("id, title, body_markdown, visibility, author_id, created_at, updated_at, revision")
    .eq("campaign_id", campaignId)
    .eq("episode_id", episodeId)
    .order("updated_at", { ascending: false });

  if (notesError) throw new Error(`Unable to read episode notes: ${notesError.message}`);

  const notes = (noteData ?? [])
    .filter((note) => canReadNote(context.membership.role, note.visibility))
    .map((note) => note as EpisodeNoteRow);
  const authorIds = [...new Set(notes.map((note) => note.author_id))];
  const authorsResult = authorIds.length
    ? await context.supabase.from("profiles").select("id, display_name").in("id", authorIds)
    : { data: [], error: null };

  if (authorsResult.error) throw new Error(`Unable to read episode note authors: ${authorsResult.error.message}`);

  const authors = new Map((authorsResult.data ?? []).map((author) => [author.id, author.display_name]));
  const maskedBodies = await maskHiddenNoteEntityLinksBatch(
    context.supabase,
    campaignId,
    notes.map((note) => ({ markdown: note.body_markdown, visibility: note.visibility })),
  );
  const episodeNotes: EpisodeNote[] = notes.map((note, index) => ({
    ...note,
    body_markdown: maskedBodies[index] ?? note.body_markdown,
    author: { id: note.author_id, displayName: authors.get(note.author_id) ?? "Crew member" },
    permissions: {
      canEdit: note.visibility === "player" || context.membership.role === "gm",
      canDelete: note.author_id === context.user.id || context.membership.role === "gm",
    },
  }));

  let episode = episodeData as EpisodeRow;
  if (context.membership.role !== "gm") {
    [episode] = await maskPlayerFacingEntityMarkdownBatch(context.supabase, campaignId, [episode], (record) => [
      { key: "summary", markdown: record.summary },
      { key: "player_context_markdown", markdown: record.player_context_markdown },
    ]);
  }
  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    episode: { ...episode, noteCount: episodeNotes.length },
    notes: episodeNotes,
  };
}