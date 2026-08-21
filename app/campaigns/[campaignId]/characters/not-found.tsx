import Link from "next/link";
import AppStatus from "@/components/ui/AppStatus";
import { campaignsPath } from "@/lib/campaign/routes";

export default function CharactersNotFound() {
  return <AppStatus title="Character unavailable." message="This record could not be found or you do not have access to it." action={<Link className="button button-secondary" href={campaignsPath()}>BACK TO CAMPAIGNS</Link>} />;
}