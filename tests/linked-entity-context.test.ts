import { describe, expect, it, vi } from "vitest";
import { loadLinkedEntityContext } from "@/lib/ai/linked-entity-context";

const campaignId = "00000000-0000-4000-8000-000000000001";
const npcId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";

function createSupabase(results: Record<string, { data: unknown[]; error?: unknown }>) {
  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: [], error: null };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn().mockResolvedValue({ error: null, ...result }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    Object.assign(query, {
      then: (onFulfilled: (value: { data: unknown[]; error: unknown }) => unknown) =>
        Promise.resolve({ error: null, ...result }).then(onFulfilled),
    });
    return query;
  });
  return { from };
}

function npcLink(id = npcId) {
  return `[@Mara Venn](/campaigns/${campaignId}/npcs/${id})`;
}

describe("linked campaign AI context", () => {
  it("loads bounded target details and GM-only notes for GM writers", async () => {
    const supabase = createSupabase({
      npcs: { data: [{ id: npcId, name: "Mara Venn", species: "Human", role: "Pilot", description: "A steady navigator.", player_notes_markdown: "Knows the route." }] },
      npc_gm_notes: { data: [{ npc_id: npcId, body_markdown: "Secretly works for the Meridian Combine." }] },
    });

    const result = await loadLinkedEntityContext(
      supabase as never,
      campaignId,
      { focus: `Use ${npcLink()}`, currentDraft: { playerNotes: `Crew met ${npcLink()}` } },
      "gm",
    );

    expect(result).toMatchObject({ context: expect.stringContaining("Mara Venn") });
    if (!("context" in result)) return;
    expect(result.context).toContain("Meridian Combine");
    expect(result.context).toContain("untrusted reference data");
  });

  it("does not query or include private notes for player AI", async () => {
    const supabase = createSupabase({
      npcs: { data: [{ id: npcId, name: "Mara Venn", species: "Human", role: "Pilot", description: "A steady navigator.", player_notes_markdown: "Knows the route." }] },
      npc_gm_notes: { data: [{ npc_id: npcId, body_markdown: "Secret plot." }] },
    });

    const result = await loadLinkedEntityContext(supabase as never, campaignId, { focus: npcLink() }, "player");

    expect(result).toMatchObject({ context: expect.stringContaining("Knows the route") });
    expect("context" in result && result.context).not.toContain("Secret plot");
    expect(supabase.from).not.toHaveBeenCalledWith("npc_gm_notes");
  });

  it("rejects draft jobs for player-visible context", async () => {
    const supabase = createSupabase({ jobs: { data: [{ id: jobId, title: "The Quiet Relay", status: "draft" }] } });
    const link = `[@The Quiet Relay](/campaigns/${campaignId}/jobs/${jobId})`;

    await expect(loadLinkedEntityContext(supabase as never, campaignId, { focus: link }, "player"))
      .resolves.toEqual({ error: "invalid-reference" });
  });

  it("rejects cross-campaign links and limits unique references before querying", async () => {
    const supabase = createSupabase({});
    const crossCampaign = "[@Other](/campaigns/00000000-0000-4000-8000-000000000099/npcs/target)";
    await expect(loadLinkedEntityContext(supabase as never, campaignId, { focus: crossCampaign }, "gm"))
      .resolves.toEqual({ error: "invalid-reference" });

    const links = Array.from({ length: 13 }, (_, index) =>
      `[@Record ${index}](/campaigns/${campaignId}/npcs/${index + 1})`,
    ).join(" ");
    await expect(loadLinkedEntityContext(supabase as never, campaignId, { focus: links }, "gm"))
      .resolves.toEqual({ error: "too-many-references" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("caps serialized reference data at 6,000 characters", async () => {
    const ids = Array.from({ length: 12 }, (_, index) => `record-${index}`);
    const supabase = createSupabase({
      npcs: { data: ids.map((id) => ({ id, name: id, species: "Human", role: "Pilot", description: "x".repeat(900), player_notes_markdown: "y".repeat(900) })) },
    });
    const links = ids.map((id) => `[@${id}](/campaigns/${campaignId}/npcs/${id})`).join(" ");

    const result = await loadLinkedEntityContext(supabase as never, campaignId, { focus: links }, "player");
    expect("context" in result ? result.context.length : 0).toBeLessThanOrEqual(6000);
  });
});
