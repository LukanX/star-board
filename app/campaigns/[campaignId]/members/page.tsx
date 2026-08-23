import { notFound } from "next/navigation";
import MembersRouteView from "@/components/members/MembersRouteView";
import { getCampaignMembers } from "@/lib/campaign/members-server";

export default async function MembersPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const result = await getCampaignMembers(campaignId);

  if (!result) notFound();

  return <MembersRouteView campaignId={campaignId} currentUserId={result.currentUserId} displayName={result.displayName} initialMembers={result.members} role={result.role} />;
}