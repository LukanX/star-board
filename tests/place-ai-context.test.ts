import { describe, expect, it, vi } from "vitest";
import { loadPlaceAiContext } from "@/lib/ai/assistance";
import { buildPlacePrompt } from "@/lib/ai/prompts";
import { placeGenerationInputSchema } from "@/lib/validation/ai";

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

const campaignId = "00000000-0000-4000-8000-000000000001";
const parentId = "00000000-0000-4000-8000-000000000002";
const rootId = "00000000-0000-4000-8000-000000000003";

function createSupabase(parentResult: QueryResult, treeResult: QueryResult) {
  const parentQuery = createQuery(parentResult);
  const treeQuery = createQuery(treeResult);
  const from = vi.fn()
    .mockReturnValueOnce(parentQuery)
    .mockReturnValueOnce(treeQuery);

  return { supabase: { from } as never, from, parentQuery, treeQuery };
}

describe("Place AI context", () => {
  it("loads the direct parent's public context and the full ancestor breadcrumb", async () => {
    const parentNotes = "Public parent notes. ".repeat(200);
    const { supabase, from, parentQuery, treeQuery } = createSupabase(
      {
        data: {
          id: parentId,
          parent_place_id: rootId,
          name: "Night Market",
          kind: "district",
          description: "A crowded district beneath the orbital ring.",
          player_notes_markdown: parentNotes,
        },
        error: null,
      },
      {
        data: [
          { id: rootId, parent_place_id: null, name: "Asterion", kind: "planet" },
          { id: parentId, parent_place_id: rootId, name: "Night Market", kind: "district" },
        ],
        error: null,
      },
    );

    const result = await loadPlaceAiContext(supabase, campaignId, parentId);

    expect(result).toEqual({
      context: {
        hierarchy: [
          { name: "Asterion", kind: "planet" },
          { name: "Night Market", kind: "district" },
        ],
        parent: {
          name: "Night Market",
          kind: "district",
          description: "A crowded district beneath the orbital ring.",
          playerNotes: parentNotes.slice(0, 2400),
        },
      },
    });
    expect(from).toHaveBeenCalledWith("places");
    expect(from).toHaveBeenCalledTimes(2);
    expect(parentQuery.eq).toHaveBeenCalledWith("id", parentId);
    expect(parentQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(treeQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
    expect(from).not.toHaveBeenCalledWith("place_gm_notes");
  });

  it("returns no context for a root place without querying the database", async () => {
    const from = vi.fn();

    await expect(loadPlaceAiContext({ from } as never, campaignId, null)).resolves.toEqual({ context: undefined });
    expect(from).not.toHaveBeenCalled();
  });

  it("classifies a missing parent as an invalid campaign reference", async () => {
    const { supabase } = createSupabase(
      { data: null, error: null },
      { data: [], error: null },
    );

    await expect(loadPlaceAiContext(supabase, campaignId, parentId)).resolves.toEqual({
      error: "Place parent must belong to this campaign.",
      invalid: true,
    });
  });

  it("classifies hierarchy query failures as unavailable", async () => {
    const { supabase } = createSupabase(
      { data: null, error: { message: "permission denied" } },
      { data: [], error: null },
    );

    await expect(loadPlaceAiContext(supabase, campaignId, parentId)).resolves.toEqual({
      error: "Place hierarchy could not be loaded.",
      unavailable: true,
    });
  });

  it("labels parent context as authoritative child-generation guidance", () => {
    const input = placeGenerationInputSchema.parse({
      campaignId,
      mode: "create",
      parentPlaceId: parentId,
      name: "The Blue Door",
      kind: "room",
    });
    const prompt = buildPlacePrompt(input, {
      system: "Starfinder 2e",
      description: "A frontier campaign",
      artStyleSuffix: "Cinematic sci-fi realism",
    }, {
      hierarchy: [
        { name: "Asterion", kind: "planet" },
        { name: "Night Market", kind: "district" },
      ],
      parent: {
        name: "Night Market",
        kind: "district",
        description: "A crowded district beneath the orbital ring.",
        playerNotes: "Public parent notes.",
      },
    });

    expect(prompt).toContain("Place hierarchy: Asterion (planet) > Night Market (district)");
    expect(prompt).toContain("Immediate parent description: A crowded district beneath the orbital ring.");
    expect(prompt).toContain("Immediate parent player notes: Public parent notes.");
    expect(prompt).toContain("authoritative");
    expect(prompt).toContain("one distinct child");
    expect(prompt).toContain("visible continuity");
  });

  it("keeps root Place generation on the top-level path", () => {
    const input = placeGenerationInputSchema.parse({ campaignId, mode: "create", kind: "planet" });
    const prompt = buildPlacePrompt(input);

    expect(prompt).toContain("This place is a top-level location in the campaign.");
    expect(prompt).not.toContain("Immediate parent description:");
  });
});