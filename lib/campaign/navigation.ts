import type { CampaignSection } from "./routes";

export type CampaignNavigationGroup = "Command" | "Archive" | "Control";

export type CampaignNavigationItem = Readonly<{
  id: CampaignSection;
  label: string;
  group: CampaignNavigationGroup;
}>;

export const campaignNavigation = [
  { id: "overview", label: "Overview", group: "Command" },
  { id: "jobs", label: "Job board", group: "Command" },
  { id: "episodes", label: "Episodes", group: "Command" },
  { id: "characters", label: "Characters", group: "Archive" },
  { id: "npcs", label: "NPCs", group: "Archive" },
  { id: "factions", label: "Factions", group: "Archive" },
  { id: "places", label: "Places", group: "Archive" },
  { id: "notes", label: "Campaign notes", group: "Archive" },
  { id: "members", label: "Crew access", group: "Control" },
  { id: "settings", label: "Campaign settings", group: "Control" },
] as const satisfies readonly CampaignNavigationItem[];

export function getCampaignNavigationItem(section: CampaignSection): CampaignNavigationItem | undefined {
  return campaignNavigation.find((item) => item.id === section);
}