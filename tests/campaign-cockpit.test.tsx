import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CampaignOverview from "@/components/campaign-cockpit/CampaignOverview";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";

describe("CampaignOverview initial render", () => {
  it("renders server-provided campaign data without a client bootstrap", () => {
    const overview = {
      campaign: { id: "campaign-42", name: "Starfall", system: "scifi", description: "Brief", visual_style: "Cinematic", created_by: "gm-1" },
      role: "player" as const,
      displayName: "Nova",
      jobs: [],
      characters: [],
      npcs: [],
      factions: [],
      places: [],
      notes: [],
      episodes: [],
      members: [],
    };
    const markup = renderToStaticMarkup(<DirtyFormProvider><CampaignOverview campaignId="campaign-42" overview={overview} /></DirtyFormProvider>);

    expect(markup).toContain("Starfall");
    expect(markup).not.toContain("Loading campaign...");
  });

  it("uses the canonical job detail link for overview missions", () => {
    const overview = {
      campaign: { id: "campaign-42", name: "Starfall", system: "scifi", description: "Brief", visual_style: "Cinematic", created_by: "gm-1" },
      role: "player" as const,
      displayName: "Nova",
      jobs: [{
        id: "job-7",
        title: "The Relay",
        summary: "A signal needs a crew.",
        status: "open" as const,
        player_notes_markdown: "",
        hook: "",
        gm_notes_markdown: "",
        giver_npc_id: "npc-1",
        giver_faction_id: null,
        place_id: null,
        art_path: null,
        art_subject: null,
        art_url: null,
        art_prompt: null,
        art_provider: null,
        giver: { id: "npc-1", type: "NPC" as const, name: "Relay Contact" },
        votes: 2,
        voted: false,
      }],
      characters: [],
      npcs: [],
      factions: [],
      places: [],
      notes: [],
      episodes: [],
      members: [],
    };
    const markup = renderToStaticMarkup(<DirtyFormProvider><CampaignOverview campaignId="campaign-42" overview={overview} /></DirtyFormProvider>);

    expect(markup).toContain('href="/campaigns/campaign-42/jobs/job-7"');
  });

  it("renders active characters with campaign owners and excludes inactive records", () => {
    const character = (overrides: Record<string, unknown>) => ({
      id: "character-1",
      owner_id: "player-1",
      is_active: true,
      name: "Ari",
      species: "Human",
      class_name: "Pilot",
      level: 3,
      backstory_markdown: "",
      physical_description: "",
      art_subject: null,
      art_path: null,
      art_url: null,
      art_prompt: null,
      art_provider: null,
      ...overrides,
    });
    const overview = {
      campaign: { id: "campaign-42", name: "Starfall", system: "scifi", description: "Brief", visual_style: "Cinematic", created_by: "gm-1" },
      role: "gm" as const,
      displayName: "Captain",
      jobs: [],
      characters: [
        character({ id: "character-1", name: "Ari", art_url: "https://signed.example/ari.png" }),
        character({ id: "character-2", name: "Rook" }),
        character({ id: "character-3", owner_id: "gm-1", name: "Captain Vex", class_name: "", level: 5 }),
        character({ id: "character-4", owner_id: null, name: "Unassigned Echo", class_name: "Mystic" }),
        character({ id: "character-5", name: "Retired Echo", is_active: false }),
      ],
      npcs: [],
      factions: [],
      places: [],
      notes: [],
      episodes: [],
      members: [
        { userId: "player-1", role: "player" as const, displayName: "Nova", joinedAt: "" },
        { userId: "gm-1", role: "gm" as const, displayName: "Captain", joinedAt: "" },
      ],
    };

    const markup = renderToStaticMarkup(<DirtyFormProvider><CampaignOverview campaignId="campaign-42" overview={overview} /></DirtyFormProvider>);

    expect(markup).toContain('data-campaign-roster="characters"');
    expect(markup).toContain('href="/campaigns/campaign-42/characters/character-1"');
    expect(markup).toContain("Ari");
    expect(markup).toContain("Level 3 Pilot");
    expect(markup).toContain("Nova");
    expect(markup).toContain("Captain (GM)");
    expect(markup).toContain("Unassigned");
    expect(markup).toContain("Unassigned class");
    expect(markup).not.toContain("Retired Echo");
    expect(markup).not.toContain('href="/campaigns/campaign-42/members"');
    expect(markup).toContain(">04<");
  });
});