import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CampaignOverview from "@/components/campaign-cockpit/CampaignOverview";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";

describe("CampaignOverview initial render", () => {
  it("renders server-provided campaign data without a client bootstrap", () => {
    const overview = {
      campaign: { id: "campaign-42", name: "Starfall", system: "scifi", description: "Brief", created_by: "gm-1" },
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
    expect(markup).not.toContain("Loading campaign signal.");
  });

  it("uses the canonical job detail link for overview missions", () => {
    const overview = {
      campaign: { id: "campaign-42", name: "Starfall", system: "scifi", description: "Brief", created_by: "gm-1" },
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
});