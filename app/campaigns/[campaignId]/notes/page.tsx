import { notFound } from "next/navigation";
import NotesRouteView from "@/components/notes/NotesRouteView";
import { getCampaignEpisodes } from "@/lib/campaign/episodes-server";
import { getCampaignNotes } from "@/lib/campaign/notes-server";

export default async function NotesPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [notesResult, episodesResult] = await Promise.all([getCampaignNotes(campaignId), getCampaignEpisodes(campaignId)]);

  if (!notesResult || !episodesResult) notFound();

  return <NotesRouteView campaignId={campaignId} episodes={episodesResult.episodes.map(({ id, title, status }) => ({ id, title, status }))} initialResult={notesResult} />;
}