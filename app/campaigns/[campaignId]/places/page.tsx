import { notFound } from "next/navigation";
import PlacesRouteView from "@/components/places/PlacesRouteView";
import { getCampaignPlaces } from "@/lib/campaign/places-server";

export default async function PlacesPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignPlaces(campaignId);
  if (!result) notFound();
  return <PlacesRouteView campaignId={campaignId} initialPlaces={result.places} role={result.role} />;
}