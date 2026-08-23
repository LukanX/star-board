import { notFound } from "next/navigation";
import PlaceDetailRouteView from "@/components/places/PlaceDetailRouteView";
import { getCampaignPlace, getCampaignPlaces } from "@/lib/campaign/places-server";

export default async function PlacePage({ params }: { params: Promise<{ campaignId: string; placeId: string }> }) {
  const { campaignId, placeId } = await params;
  const placesPromise = getCampaignPlaces(campaignId);
  const placePromise = getCampaignPlace(campaignId, placeId, placesPromise);
  const [placesResult, placeResult] = await Promise.all([placesPromise, placePromise]);
  if (!placesResult || !placeResult) notFound();
  return <PlaceDetailRouteView campaignId={campaignId} initialPlaces={placesResult.places} initialResult={placeResult} />;
}