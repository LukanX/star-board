import { notFound } from "next/navigation";
import NoteDetailRouteView from "@/components/notes/NoteDetailRouteView";
import { getCampaignEpisodes } from "@/lib/campaign/episodes-server";
import { getCampaignNote } from "@/lib/campaign/notes-server";

export default async function NotePage({ params }: { params: Promise<{ campaignId: string; noteId: string }> }) {
  const { campaignId, noteId } = await params;
  const [noteResult, episodesResult] = await Promise.all([getCampaignNote(campaignId, noteId), getCampaignEpisodes(campaignId)]);

  if (!noteResult || !episodesResult) notFound();

  return <NoteDetailRouteView campaignId={campaignId} episodes={episodesResult.episodes.map(({ id, title, status }) => ({ id, title, status }))} initialResult={noteResult} />;
}