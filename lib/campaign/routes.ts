export type CampaignSection =
  | "overview"
  | "jobs"
  | "characters"
  | "npcs"
  | "factions"
  | "places"
  | "episodes"
  | "notes"
  | "members"
  | "settings";

export type EntitySection = Exclude<CampaignSection, "overview" | "members" | "settings">;

const campaignSections: readonly CampaignSection[] = ["overview", "jobs", "characters", "npcs", "factions", "places", "episodes", "notes", "members", "settings"];

function encodedSegment(value: string): string {
  return encodeURIComponent(value);
}

export function campaignsPath(): string {
  return "/campaigns";
}

export function campaignPath(campaignId: string): string {
  return `${campaignsPath()}/${encodedSegment(campaignId)}`;
}

export function legacyCampaignPath(campaignId: string): string {
  return `/?${new URLSearchParams({ campaignId }).toString()}`;
}

export function campaignSectionPath(campaignId: string, section: CampaignSection): string {
  const rootPath = campaignPath(campaignId);
  return section === "overview" ? rootPath : `${rootPath}/${encodedSegment(section)}`;
}

export function campaignEntityPath(campaignId: string, section: EntitySection, entityId: string): string {
  return `${campaignSectionPath(campaignId, section)}/${encodedSegment(entityId)}`;
}

export function getCampaignSectionFromPath(pathname: string, campaignId: string): CampaignSection {
  const rootPath = campaignPath(campaignId);
  if (pathname === rootPath || pathname === `${rootPath}/`) return "overview";
  if (!pathname.startsWith(`${rootPath}/`)) return "overview";

  const section = pathname.slice(rootPath.length + 1).split("/", 1)[0];
  return campaignSections.includes(section as CampaignSection) ? section as CampaignSection : "overview";
}

export function loginPath(nextPath?: string): string {
  return nextPath === undefined ? "/login" : `/login?${new URLSearchParams({ next: nextPath }).toString()}`;
}