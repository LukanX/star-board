import { z } from "zod";
import type { NoteVisibility } from "@/lib/campaign/types";

export const searchableEntitySections = ["characters", "npcs", "places", "factions", "jobs", "enemies", "episodes"] as const;
export const campaignEntitySearchResultSchema = z.object({
  id: z.string().min(1), type: z.enum(searchableEntitySections),
  label: z.string(), meta: z.string(), href: z.string(),
});
export type CampaignEntitySearchResult = z.infer<typeof campaignEntitySearchResultSchema>;
export type SearchableEntitySection = typeof searchableEntitySections[number];

export async function searchCampaignEntities({ campaignId, query, audience, noteId, sections, signal }: {
  campaignId: string; query: string; audience: NoteVisibility; noteId?: string;
  sections?: readonly SearchableEntitySection[]; signal?: AbortSignal;
}): Promise<{ entities: CampaignEntitySearchResult[] } | { error: string }> {
  const params = new URLSearchParams({ q: query, audience });
  if (noteId) params.set("noteId", noteId);
  if (sections) params.set("sections", sections.join(","));
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/entities/search?${params}`, { signal });
  const result = await response.json() as { entities?: unknown; error?: string };
  if (!response.ok) return { error: result.error ?? "Campaign subjects could not be searched." };
  const entities = z.array(campaignEntitySearchResultSchema).safeParse(result.entities);
  return entities.success ? { entities: entities.data } : { error: "Campaign search returned invalid subjects." };
}
