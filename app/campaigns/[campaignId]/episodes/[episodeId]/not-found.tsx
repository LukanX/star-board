import Link from "next/link";
import AppStatus from "@/components/ui/AppStatus";
import { campaignsPath } from "@/lib/campaign/routes";

export default function EpisodeNotFound() {
  return <AppStatus title="Episode unavailable." message="This campaign episode could not be found or you do not have access to it." action={<Link className="button button-secondary" href={campaignsPath()}>BACK TO CAMPAIGNS</Link>} />;
}