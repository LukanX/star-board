import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CharacterPublicRecord from "@/components/characters/CharacterPublicRecord";
import FactionPublicRecord from "@/components/factions/FactionPublicRecord";
import JobPublicRecord from "@/components/jobs/JobPublicRecord";
import NpcPublicRecord from "@/components/npcs/NpcPublicRecord";
import PlacePublicRecord from "@/components/places/PlacePublicRecord";

const artUrl = "https://storage.example/signed-art";

describe("detail page artwork downloads", () => {
  it("offers a named download control for every art-bearing public record", () => {
    const records = [
      {
        label: "character",
        markup: renderToStaticMarkup(
          <CharacterPublicRecord
            campaignId="campaign-id"
            character={{
              id: "character-id",
              ownerId: "owner-id",
              name: "Nova Vex",
              species: "Human",
              className: "Envoy",
              level: 3,
              subtitle: "Human Envoy",
              detail: "Envoy // Level 3",
              color: "cyan",
              image: artUrl,
              status: "ACTIVE",
              backstoryMarkdown: "Signal runner.",
              physicalDescription: "Silver flight suit.",
              canEdit: true,
            }}
          />,
        ),
        accessibleName: "Download Nova Vex artwork",
      },
      {
        label: "NPC",
        markup: renderToStaticMarkup(
          <NpcPublicRecord
            campaignId="campaign-id"
            npc={{
              id: "npc-id",
              author_id: "author-id",
              name: "Relay Keeper",
              species: "Android",
              role: "Contact",
              description: "Keeps the signal alive.",
              player_notes_markdown: "Trusted contact.",
              place_id: null,
              art_subject: null,
              art_path: "campaign-id/owner-id/npc.png",
              art_url: artUrl,
              art_prompt: null,
              art_provider: null,
              color: "pink",
            }}
            places={[]}
          />,
        ),
        accessibleName: "Download Relay Keeper artwork",
      },
      {
        label: "faction",
        markup: renderToStaticMarkup(
          <FactionPublicRecord
            campaignId="campaign-id"
            faction={{
              id: "faction-id",
              author_id: "author-id",
              name: "Drift Collective",
              description: "Independent signal brokers.",
              status: "active",
              place_id: null,
              art_subject: null,
              art_path: "campaign-id/owner-id/faction.png",
              art_url: artUrl,
              art_prompt: null,
              art_provider: null,
              color: "amber",
            }}
            places={[]}
          />,
        ),
        accessibleName: "Download Drift Collective artwork",
      },
      {
        label: "job",
        markup: renderToStaticMarkup(
          <JobPublicRecord
            campaignId="campaign-id"
            isGM={false}
            job={{
              id: "job-id",
              title: "Ghost Signal",
              category: "OPEN JOB",
              summary: "Trace the signal.",
              giver: "Relay Keeper",
              giverType: "NPC",
              votes: 2,
              accent: "cyan",
              image: artUrl,
              voted: false,
              status: "open",
              playerNotesMarkdown: "Proceed quietly.",
              giverId: "npc-id",
              placeId: null,
            }}
            places={[]}
          />,
        ),
        accessibleName: "Download Ghost Signal artwork",
      },
      {
        label: "place",
        markup: renderToStaticMarkup(
          <PlacePublicRecord
            campaignId="campaign-id"
            isGM={false}
            place={{
              id: "place-id",
              campaign_id: "campaign-id",
              parent_place_id: null,
              name: "North Station",
              kind: "station",
              author_id: "author-id",
              description: "An abandoned relay station.",
              player_notes_markdown: "The signal starts here.",
              art_subject: null,
              art_path: "campaign-id/owner-id/place.png",
              art_url: artUrl,
              art_prompt: null,
              art_provider: null,
              created_at: "2026-08-22T00:00:00.000Z",
              updated_at: "2026-08-22T00:00:00.000Z",
            }}
            places={[]}
          />,
        ),
        accessibleName: "Download North Station artwork",
      },
    ];

    for (const record of records) {
      expect(record.markup, record.label).toContain(
        `aria-label="${record.accessibleName}"`,
      );
    }
  });

  it("omits download controls from detail records without artwork", () => {
    const records = [
      renderToStaticMarkup(
        <NpcPublicRecord
          campaignId="campaign-id"
          npc={{
            id: "npc-id",
            author_id: "author-id",
            name: "Relay Keeper",
            species: "Android",
            role: "Contact",
            description: "Keeps the signal alive.",
            player_notes_markdown: "Trusted contact.",
            place_id: null,
            art_subject: null,
            art_path: null,
            art_url: null,
            art_prompt: null,
            art_provider: null,
            color: "pink",
          }}
          places={[]}
        />,
      ),
      renderToStaticMarkup(
        <FactionPublicRecord
          campaignId="campaign-id"
          faction={{
            id: "faction-id",
            author_id: "author-id",
            name: "Drift Collective",
            description: "Independent signal brokers.",
            status: "active",
            place_id: null,
            art_subject: null,
            art_path: null,
            art_url: null,
            art_prompt: null,
            art_provider: null,
            color: "amber",
          }}
          places={[]}
        />,
      ),
      renderToStaticMarkup(
        <PlacePublicRecord
          campaignId="campaign-id"
          isGM={false}
          place={{
            id: "place-id",
            campaign_id: "campaign-id",
            parent_place_id: null,
            name: "North Station",
            kind: "station",
            author_id: "author-id",
            description: "An abandoned relay station.",
            player_notes_markdown: "The signal starts here.",
            art_subject: null,
            art_path: null,
            art_url: null,
            art_prompt: null,
            art_provider: null,
            created_at: "2026-08-22T00:00:00.000Z",
            updated_at: "2026-08-22T00:00:00.000Z",
          }}
          places={[]}
        />,
      ),
    ];

    for (const markup of records) {
      expect(markup).not.toContain('aria-label="Download ');
    }
  });
});