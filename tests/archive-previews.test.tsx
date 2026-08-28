import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import NpcPreview from "@/components/npcs/NpcPreview";
import FactionPreview from "@/components/factions/FactionPreview";
import PlacePreview from "@/components/places/PlacePreview";

describe("PlacePreview", () => {
  it("shows campaign-facing summary and the canonical full-record action", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <PlacePreview
          campaignId="campaign-1"
          isGM
          places={[{
          id: "place-1",
          campaign_id: "campaign-1",
          parent_place_id: null,
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
          }]}
          place={{
          id: "place-1",
          campaign_id: "campaign-1",
          parent_place_id: null,
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
          }}
        />
      </DirtyFormProvider>,
    );

    expect(markup).toContain('data-place-preview="true"');
    expect(markup).toContain('data-archive-preview-heading="true"');
    expect(markup).toContain("An abandoned relay station.");
    expect(markup).toContain("The door is trapped.");
    expect(markup).toContain('href="/campaigns/campaign-1/places/place-1"');
    expect(markup).toContain("OPEN FULL RECORD");
    expect(markup).toContain('data-archive-preview-action="true"');
    expect(markup.indexOf('data-archive-preview-action="true"')).toBeLessThan(markup.indexOf('data-place-preview-copy="true"'));
  });

  it("omits private Place notes for players", () => {
    const markup = renderToStaticMarkup(
      <DirtyFormProvider>
        <PlacePreview
          campaignId="campaign-1"
          isGM={false}
          places={[]}
          place={{
          id: "place-1",
          campaign_id: "campaign-1",
          parent_place_id: null,
          name: "North Station",
          kind: "station",
          author_id: "gm-1",
          description: "Public.",
          player_notes_markdown: "Visible.",
          art_subject: null,
          art_path: null,
          art_url: null,
          art_prompt: null,
          art_provider: null,
          created_at: "2026-08-22T00:00:00.000Z",
          updated_at: "2026-08-22T00:00:00.000Z",
          gm_notes_markdown: "Hidden.",
          }}
        />
      </DirtyFormProvider>,
    );

    expect(markup).toContain("Visible.");
    expect(markup).not.toContain("Hidden.");
  });
});

describe("NpcPreview and FactionPreview", () => {
  it("renders NPC and Faction previews with common responsive artwork blocks", () => {
    const npcMarkup = renderToStaticMarkup(
      <DirtyFormProvider>
        <NpcPreview
          campaignId="campaign-1"
          isGM
          places={[]}
          npc={{
            id: "npc-1",
            author_id: "gm-1",
            name: "Rook",
            species: "Android",
            role: "Contact",
            description: "Keeps the signal alive.",
            player_notes_markdown: "Trusted.",
            place_id: null,
            faction_id: null,
            gm_notes_markdown: "Watch the airlock.",
            art_subject: null,
            art_path: null,
            art_url: null,
            art_prompt: null,
            art_provider: null,
            color: "pink",
          }}
        />
      </DirtyFormProvider>,
    );
    const factionMarkup = renderToStaticMarkup(
      <DirtyFormProvider>
        <FactionPreview
          campaignId="campaign-1"
          places={[]}
          faction={{
            id: "faction-1",
            author_id: "gm-1",
            name: "The Accord",
            description: "Independent brokers.",
            status: "active",
            player_notes_markdown: "",
            place_id: null,
            art_subject: null,
            art_path: null,
            art_url: null,
            art_prompt: null,
            art_provider: null,
            color: "cyan",
          }}
        />
      </DirtyFormProvider>,
    );

    expect(npcMarkup).toContain('href="/campaigns/campaign-1/npcs/npc-1"');
    expect(npcMarkup).toContain('data-archive-preview-action="true"');
    expect(npcMarkup.indexOf('data-archive-preview-action="true"')).toBeLessThan(npcMarkup.indexOf('data-npc-preview-art="true"'));
    expect(npcMarkup).toContain('data-npc-preview-art="true"');
    expect(npcMarkup).toContain("w-[min(100%,320px)]");
    expect(npcMarkup).toContain("aspect-square");
    expect(npcMarkup).toContain("Watch the airlock.");
    expect(factionMarkup).toContain('href="/campaigns/campaign-1/factions/faction-1"');
    expect(factionMarkup).toContain('data-archive-preview-action="true"');
    expect(factionMarkup.indexOf('data-archive-preview-action="true"')).toBeLessThan(factionMarkup.indexOf('data-faction-preview-art="true"'));
    expect(factionMarkup).toContain('data-faction-preview-art="true"');
    expect(factionMarkup).toContain("w-[min(100%,320px)]");
    expect(factionMarkup).toContain("aspect-square");
    expect(factionMarkup).toContain("Independent brokers.");
  });
});