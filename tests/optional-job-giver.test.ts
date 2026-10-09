import { describe, expect, it } from "vitest";
import { createJobSchema } from "@/lib/validation/job";
import { missionDraftSchema, missionGenerationInputSchema } from "@/lib/validation/ai";
import { resolveJobGiver } from "@/lib/campaign/job-giver";
import { mapApiJob } from "@/lib/campaign/mappers";
import type { ApiJob } from "@/lib/campaign/types";

const giverId = "00000000-0000-4000-8000-000000000002";
const campaignId = "00000000-0000-4000-8000-000000000001";

export const unassignedJob: ApiJob = {
  id: giverId, title: "A self-directed mission", summary: "Investigate the signal.",
  status: "open", player_notes_markdown: "", giver_npc_id: null,
  giver_faction_id: null, place_id: null, art_path: null, art_subject: null,
  art_prompt: null, art_provider: null, giver: null, votes: 0, voted: false,
};

describe("optional mission giver contracts", () => {
  it.each([{}, { giverType: null, giverId: null }])("accepts and normalizes no giver: %j", (giver) => {
    expect(createJobSchema.parse({ title: "Mission", ...giver })).toMatchObject({ giverType: null, giverId: null });
  });

  it.each(["npc", "faction"])("preserves an assigned %s", (giverType) => {
    expect(createJobSchema.parse({ title: "Mission", giverType, giverId })).toMatchObject({ giverType, giverId });
  });

  it.each([
    { giverType: "npc" }, { giverType: "faction", giverId: null },
    { giverId }, { giverType: null, giverId }, { giverType: "none" },
    { giverType: "npc", giverId: "" }, { giverType: "npc", giverId: "invalid" },
  ])("rejects an incomplete or invalid giver: %j", (giver) => {
    expect(createJobSchema.safeParse({ title: "Mission", ...giver }).success).toBe(false);
  });

  it("maps an unassigned API mission without manufacturing a faction", () => {
    expect(mapApiJob(unassignedJob, 0)).toMatchObject({ giver: null, giverType: null, giverId: null });
    expect(resolveJobGiver(unassignedJob, new Map(), new Map())).toBeNull();
  });

  it("preserves unknown labels for genuinely assigned missing references", () => {
    expect(resolveJobGiver({ giver_npc_id: giverId, giver_faction_id: null }, new Map(), new Map())).toMatchObject({ type: "NPC", name: "Unknown contact" });
    expect(resolveJobGiver({ giver_npc_id: null, giver_faction_id: giverId }, new Map(), new Map())).toMatchObject({ type: "FACTION", name: "Unknown faction" });
  });

  it("accepts explicit no giver in AI requests and rejects contradictory context", () => {
    expect(missionGenerationInputSchema.safeParse({ campaignId, mode: "create", giverType: "none" }).success).toBe(true);
    for (const context of [{ giverId }, { giver: "Invented contact" }]) {
      expect(missionGenerationInputSchema.safeParse({ campaignId, mode: "create", giverType: "none", ...context }).success).toBe(false);
    }
  });

  it("validates the unassigned AI draft shape", () => {
    const draft = {
      title: "Mission", summary: "A playable brief.", playerNotes: "", gmNotes: "",
      hook: "", suggestedGiverType: "none", suggestedGiverName: "",
      thumbnailDescription: "An abandoned orbital relay.",
    };
    expect(missionDraftSchema.safeParse(draft).success).toBe(true);
    expect(missionDraftSchema.safeParse({ ...draft, suggestedGiverName: "Invented contact" }).success).toBe(false);
  });
});
