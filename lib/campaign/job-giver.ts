export function resolveJobGiver(
  job: { giver_npc_id: string | null; giver_faction_id: string | null },
  npcs: ReadonlyMap<string, string>,
  factions: ReadonlyMap<string, string>,
): { type: "NPC" | "FACTION"; id: string; name: string } | null {
  if (job.giver_npc_id) {
    return { type: "NPC", id: job.giver_npc_id, name: npcs.get(job.giver_npc_id) ?? "Unknown contact" };
  }
  if (job.giver_faction_id) {
    return { type: "FACTION", id: job.giver_faction_id, name: factions.get(job.giver_faction_id) ?? "Unknown faction" };
  }
  return null;
}
