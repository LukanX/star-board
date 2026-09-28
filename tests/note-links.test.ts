import { describe, expect, it, vi } from "vitest";
import { maskHiddenNoteEntityLinks, maskPlayerFacingEntityMarkdownBatch, validateCampaignEntityLinkFields, validateNoteEntityLinks } from "@/lib/campaign/note-links";

const campaignId = "00000000-0000-4000-8000-000000000001";
const enemyId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const episodeId = "00000000-0000-4000-8000-000000000004";

function createSupabase(results: Record<string, { data: unknown; error?: unknown }>) {
  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: null, error: null };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn().mockResolvedValue({ error: null, ...result }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    Object.assign(query, { then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ error: null, ...result }).then(onFulfilled) });
    return query;
  });
  return { from };
}

describe("campaign note entity links", () => {
  it("accepts visible same-campaign canonical entity links", async () => {
    const supabase = createSupabase({
      enemies: { data: [{ id: enemyId, is_revealed: true }] },
    });
    const markdown = `The crew saw [@Sentinel](/campaigns/${campaignId}/enemies/${enemyId}).`;

    await expect(validateNoteEntityLinks(supabase, campaignId, markdown)).resolves.toBe(true);
  });

  it("accepts visible canonical episode links", async () => {
    const supabase = createSupabase({ episodes: { data: [{ id: episodeId }] } });
    const markdown = `Related log: [@Relay](/campaigns/${campaignId}/episodes/${episodeId}).`;

    await expect(validateNoteEntityLinks(supabase, campaignId, markdown)).resolves.toBe(true);
  });

  it("rejects links to cross-campaign entities", async () => {
    const supabase = createSupabase({});
    const markdown = `See [@secret](/campaigns/00000000-0000-4000-8000-000000000099/enemies/${enemyId}).`;

    await expect(validateNoteEntityLinks(supabase, campaignId, markdown)).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a cross-campaign internal link even for an unrecognized route section", async () => {
    const supabase = createSupabase({});
    const markdown = "[Other campaign](/campaigns/00000000-0000-4000-8000-000000000099/notes/00000000-0000-4000-8000-000000000098).";

    await expect(validateNoteEntityLinks(supabase, campaignId, markdown)).resolves.toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a public link to an unrevealed enemy or draft job", async () => {
    const supabase = createSupabase({
      enemies: { data: [{ id: enemyId, is_revealed: false }] },
      jobs: { data: [{ id: jobId, status: "draft" }] },
    });
    const markdown = `[@Shade](/campaigns/${campaignId}/enemies/${enemyId}) and [@Secret](/campaigns/${campaignId}/jobs/${jobId}).`;

    await expect(validateNoteEntityLinks(supabase, campaignId, markdown)).resolves.toBe(false);
  });

  it("allows private fields to reference hidden targets but rejects them in player fields", async () => {
    const supabase = createSupabase({
      enemies: { data: [{ id: enemyId, is_revealed: false }] },
      jobs: { data: [{ id: jobId, status: "draft" }] },
    });
    const enemyMarkdown = `[@Shade](/campaigns/${campaignId}/enemies/${enemyId})`;
    const jobMarkdown = `[@Secret](/campaigns/${campaignId}/jobs/${jobId})`;

    await expect(validateCampaignEntityLinkFields(supabase, campaignId, [
      { markdown: enemyMarkdown, audience: "gm" },
      { markdown: jobMarkdown, audience: "gm" },
    ])).resolves.toBe(true);
    await expect(validateCampaignEntityLinkFields(supabase, campaignId, [
      { markdown: enemyMarkdown, audience: "gm" },
      { markdown: jobMarkdown, audience: "player" },
    ])).resolves.toBe(false);
  });

  it("masks stale links without changing surrounding Markdown", async () => {
    const supabase = createSupabase({
      enemies: { data: [{ id: enemyId, is_revealed: false }] },
    });
    const markdown = `The crew saw [@Sentinel](/campaigns/${campaignId}/enemies/${enemyId}) **near the relay**.`;

    await expect(maskHiddenNoteEntityLinks(supabase, campaignId, markdown, "player"))
      .resolves.toBe("The crew saw Unavailable campaign record **near the relay**.");
  });

  it("masks inaccessible internal links from player entity fields before serializing records", async () => {
    const supabase = createSupabase({
      enemies: { data: [{ id: enemyId, is_revealed: false }] },
    });
    const source = `[@Sentinel](/campaigns/${campaignId}/enemies/${enemyId}) triggered the beacon.`;
    const [record] = await maskPlayerFacingEntityMarkdownBatch(supabase, campaignId, [{ description: source }], (item) => [
      { key: "description", markdown: item.description },
    ]);

    expect(record.description).toBe("Unavailable campaign record triggered the beacon.");
  });
});