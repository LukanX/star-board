import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import FactionPublicRecord from "@/components/factions/FactionPublicRecord";
import NpcPublicRecord from "@/components/npcs/NpcPublicRecord";
import PlacePublicRecord from "@/components/places/PlacePublicRecord";
import type { ApiPlace, FactionRecord, NpcRecord } from "@/lib/campaign/types";

const parentPlace: ApiPlace = {
  id: "parent-1",
  campaign_id: "campaign-1",
  parent_place_id: null,
  name: "Asterion",
  kind: "planet",
  author_id: "gm-1",
  description: "A storm-wrapped world.",
  player_notes_markdown: "The crew arrives at orbit.",
  art_subject: null,
  art_path: null,
  art_url: null,
  art_prompt: null,
  art_provider: null,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
};

const place: ApiPlace = {
  id: "place-1",
  campaign_id: "campaign-1",
  parent_place_id: "parent-1",
  name: "North Station",
  kind: "station",
  author_id: "gm-1",
  description: "An abandoned relay station.",
  player_notes_markdown: "The signal starts here.",
  art_subject: null,
  art_path: null,
  art_url: null,
  art_prompt: null,
  art_provider: null,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
  gm_notes_markdown: "The door is trapped.",
};

const childPlace: ApiPlace = {
  ...place,
  id: "child-1",
  parent_place_id: "place-1",
  name: "Gate",
  kind: "checkpoint",
};

const npc: NpcRecord = {
  id: "npc-1",
  author_id: "gm-1",
  name: "Rook",
  species: "Android",
  role: "Contact",
  description: "Keeps the signal alive.",
  player_notes_markdown: "Trusted.",
  place_id: "place-1",
  gm_notes_markdown: "Hidden NPC context.",
  art_subject: null,
  art_path: null,
  art_url: null,
  art_prompt: null,
  art_provider: null,
  color: "pink",
};

const faction: FactionRecord = {
  id: "faction-1",
  author_id: "gm-1",
  name: "The Accord",
  description: "Independent brokers.",
  status: "active",
  place_id: "place-1",
  art_subject: null,
  art_path: null,
  art_url: null,
  art_prompt: null,
  art_provider: null,
  color: "cyan",
};

function renderArchiveRecord(node: ReactNode) {
  return renderToStaticMarkup(<DirtyFormProvider>{node}</DirtyFormProvider>);
}

describe("archive full records", () => {
  it("renders Place relations and GM-only notes in the shared record frame", () => {
    const markup = renderArchiveRecord(
      <PlacePublicRecord
        campaignId="campaign-1"
        isGM
        place={place}
        places={[parentPlace, place, childPlace]}
        related={{
          parent: { id: "parent-1", name: "Asterion", kind: "planet" },
          children: [{ id: "child-1", name: "Gate", kind: "checkpoint" }],
          npcs: [{ id: "npc-1", name: "Rook", species: "Android", role: "Contact" }],
          factions: [{ id: "faction-1", name: "The Accord", status: "active" }],
          jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
          episodes: [{ id: "episode-1", title: "Signal Lost", status: "active" }],
        }}
      />,
    );

    expect(markup).toContain('data-archive-record="true"');
    expect(markup).toContain('data-place-detail-panel="true"');
    expect(markup).toContain("The door is trapped.");
    expect(markup).toContain("Gate");
    expect(markup).toContain('href="/campaigns/campaign-1/npcs/npc-1"');
    expect(markup).toContain('href="/campaigns/campaign-1/jobs/job-1"');
    expect(markup).toContain('href="/campaigns/campaign-1/episodes/episode-1"');
  });

  it("keeps NPC GM notes out of player full records and renders giver jobs", () => {
    const markup = renderArchiveRecord(
      <NpcPublicRecord
        campaignId="campaign-1"
        isGM={false}
        places={[place]}
        npc={npc}
        related={{
          place: { id: "place-1", name: "North Station", kind: "station" },
          jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
        }}
      />,
    );

    expect(markup).not.toContain("Hidden NPC context.");
    expect(markup).toContain("The Relay");
    expect(markup).toContain('href="/campaigns/campaign-1/jobs/job-1"');
  });

  it("uses common responsive artwork blocks for NPC and faction full records", () => {
    const npcMarkup = renderArchiveRecord(
      <NpcPublicRecord
        campaignId="campaign-1"
        isGM={false}
        places={[]}
        npc={npc}
      />,
    );
    const factionMarkup = renderArchiveRecord(
      <FactionPublicRecord
        campaignId="campaign-1"
        places={[]}
        faction={faction}
      />,
    );

    expect(npcMarkup).toContain('data-npc-detail-portrait="true"');
    expect(npcMarkup).toContain(" w-[480px] ");
    expect(npcMarkup).toContain("max-w-full");
    expect(npcMarkup).toContain("max-[760px]:w-full");
    expect(factionMarkup).toContain('data-faction-detail-preview="true"');
    expect(factionMarkup).toContain('data-faction-detail-art="true"');
    expect(factionMarkup).toContain('data-faction-detail-copy="true"');
    expect(factionMarkup).toContain(" w-[480px] ");
    expect(factionMarkup).toContain("max-w-full");
    expect(factionMarkup).toContain("max-[760px]:w-full");
  });

  it("renders Faction status, location, and giver jobs without notes", () => {
    const markup = renderArchiveRecord(
      <FactionPublicRecord
        campaignId="campaign-1"
        places={[place]}
        faction={faction}
        related={{
          place: { id: "place-1", name: "North Station", kind: "station" },
          jobs: [{ id: "job-1", title: "The Relay", status: "open" }],
        }}
      />,
    );

    expect(markup).toContain("ACTIVE");
    expect(markup).toContain("North Station");
    expect(markup).toContain("The Relay");
    expect(markup).toContain('href="/campaigns/campaign-1/places/place-1"');
    expect(markup).not.toContain("GM NOTES");
    expect(markup).not.toContain("PLAYER NOTES");
  });
});