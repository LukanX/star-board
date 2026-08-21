export async function deleteCampaignCharacter(campaignId: string, characterId: string): Promise<void> {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}`, { method: "DELETE" });

  if (response.ok) return;

  const result = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(result.error ?? "Character could not be deleted.");
}