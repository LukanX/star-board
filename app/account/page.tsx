import { redirect } from "next/navigation";
import AccountSettings from "@/components/account/AccountSettings";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { accountPath, loginPath } from "@/lib/campaign/routes";

type AccountSearchParams = Record<string, string | string[] | undefined>;

function queryString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<AccountSearchParams>;
}) {
  const query = await searchParams;
  const campaignId = queryString(query.campaign);
  const context = await getAuthenticatedUser();

  if (!context) {
    redirect(loginPath(accountPath(campaignId)));
  }

  const { data: profile, error: profileError } = await context.supabase
    .from("profiles")
    .select("display_name")
    .eq("id", context.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to read account profile: ${profileError.message}`);
  }

  let campaign: { id: string; name: string; displayName: string } | null = null;

  if (campaignId) {
    const [membership, campaignResult] = await Promise.all([
      getCampaignMembership(context.supabase, campaignId, context.user.id),
      context.supabase.from("campaigns").select("id, name").eq("id", campaignId).maybeSingle(),
    ]);

    if (campaignResult.error) {
      throw new Error(`Unable to read account campaign: ${campaignResult.error.message}`);
    }

    if (membership && campaignResult.data) {
      campaign = { ...campaignResult.data, displayName: membership.displayName };
    }
  }

  const emailStatus = queryString(query.email);

  return (
    <AccountSettings
      campaign={campaign}
      displayName={profile?.display_name ?? context.user.user_metadata?.name ?? "Crew member"}
      email={context.user.email ?? ""}
      emailStatus={emailStatus === "confirmed" || emailStatus === "error" ? emailStatus : null}
    />
  );
}