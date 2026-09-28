import { notFound } from "next/navigation";
import PlaceDetailRouteView from "@/components/places/PlaceDetailRouteView";
import { getCampaignPlace, getCampaignPlaces } from "@/lib/campaign/places-server";
import { getCampaignEntityNotes } from "@/lib/campaign/notes-server";

export default async function PlacePage({ params }: { params: Promise<{ campaignId: string; placeId: string }> }) {
  const { campaignId, placeId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const placePromise = getCampaignPlace(campaignId, placeId, placesPromise);
  const notesPromise = getCampaignEntityNotes(campaignId, { type: "place", id: placeId });
  const [placesResult, placeResult, entityNotes] = await Promise.all([placesPromise, placePromise, notesPromise]);
  if (!placesResult || !placeResult || !entityNotes) notFound();
  return <PlaceDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialResult={placeResult} entityNotes={entityNotes} />;
}