import { describe, expect, it, vi } from "vitest";
import { loadMissionAiReferences } from "@/lib/ai/assistance";
import { buildMissionPrompt } from "@/lib/ai/prompts";
import { missionGenerationInputSchema } from "@/lib/validation/ai";

type QueryResult = { data: unknown; error: unknown };

function createQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  query.then.mockImplementation((onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected));
  return query;
}

function createSupabase(responses: Record<string, QueryResult[]>) {
  return {
    from: vi.fn((table: string) => createQuery(responses[table]?.shift() ?? { data: null, error: null })),
  } as never;
}

const campaignId = "00000000-0000-4000-8000-000000000001";
const npcId = "00000000-0000-4000-8000-000000000002";
const roomId = "00000000-0000-4000-8000-000000000003";
const districtId = "00000000-0000-4000-8000-000000000004";
const planetId = "00000000-0000-4000-8000-000000000005";

const campaign = { system: "Starfinder 2e", description: "A frontier campaign", artStyleSuffix: "Cinematic sci-fi realism" };

const references = {
  giver: {
    type: "NPC" as const,
    name: "Relay Keeper Venn",
    species: "Android",
    role: "Station keeper",
    description: "A careful custodian of the orbital relay.",
    playerNotes: "Venn needs outside help.",
    gmNotes: "Venn is covering up a sabotage.",
  },
  location: {
    name: "The Blue Door",
    kind: "room",
    hierarchy: [
      { name: "Asterion", kind: "planet" },
      { name: "Night Market", kind: "district" },
      { name: "The Blue Door", kind: "room" },
    ],
    description: "A hidden room behind the market chapel.",
    playerNotes: "The door only appears during power outages.",
    gmNotes: "It opens into a pre-collapse transit line.",
  },
};

describe("mission AI references", () => {
  it("loads campaign-scoped NPC and place context with hierarchy", async () => {
    const supabase = createSupabase({
      npcs: [{ data: { name: references.giver.name, species: references.giver.species, role: references.giver.role, description: references.giver.description, player_notes_markdown: references.giver.playerNotes }, error: null }],
      places: [
        { data: { id: roomId, parent_place_id: districtId, name: references.location.name, kind: references.location.kind, description: references.location.description, player_notes_markdown: references.location.playerNotes }, error: null },
        { data: [
          { id: planetId, parent_place_id: null, name: "Asterion", kind: "planet" },
          { id: districtId, parent_place_id: planetId, name: "Night Market", kind: "district" },
          { id: roomId, parent_place_id: districtId, name: references.location.name, kind: references.location.kind },
        ], error: null },
      ],
      npc_gm_notes: [{ data: { body_markdown: references.giver.gmNotes }, error: null }],
      place_gm_notes: [{ data: { body_markdown: references.location.gmNotes }, error: null }],
    });

    const result = await loadMissionAiReferences(supabase, campaignId, { giverType: "npc", giverId: npcId, placeId: roomId });

    expect(result).toEqual({ references });
  });

  it("labels selected references as authoritative prompt context", () => {
    const input = missionGenerationInputSchema.parse({ campaignId, mode: "create", giverType: "npc", giverId: npcId, placeId: roomId });
    const prompt = buildMissionPrompt(input, campaign, references);

    expect(prompt).toContain("Selected mission giver: NPC named Relay Keeper Venn");
    expect(prompt).toContain("Giver GM notes: Venn is covering up a sabotage.");
    expect(prompt).toContain("Location hierarchy: Asterion (planet) > Night Market (district) > The Blue Door (room)");
    expect(prompt).toContain("Use the selected mission giver and location as authoritative campaign context.");
  });
});
