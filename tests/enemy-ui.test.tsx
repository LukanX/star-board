import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import EnemiesRouteView from "@/components/enemies/EnemiesRouteView";
import EnemyPreview from "@/components/enemies/EnemyPreview";
import EnemyPublicRecord from "@/components/enemies/EnemyPublicRecord";
import type { ApiEnemy } from "@/lib/campaign/types";
import { enemyStatBlockSchema } from "@/lib/validation/enemy";

const enemy: ApiEnemy = {
  id: "00000000-0000-4000-8000-000000000002",
  campaign_id: "00000000-0000-4000-8000-000000000001",
  author_id: "00000000-0000-4000-8000-000000000003",
  name: "Void Stalker",
  player_description: "A silent shape moving between the stars.",
  is_revealed: true,
  art_path: null,
  art_url: null,
  created_at: "2026-08-23T12:00:00.000Z",
  updated_at: "2026-08-23T12:00:00.000Z",
  level: 7,
  size: "large",
  rarity: "uncommon",
  traits: ["aberration", "occult"],
  family: null,
  origin: "manual",
  stat_block: enemyStatBlockSchema.parse({ schemaVersion: 1 }),
  gm_notes_markdown: "It is vulnerable to the sealed frequency.",
  art_subject: "A single void stalker in a starship corridor.",
  art_prompt: null,
  art_provider: null,
  source_provider: null,
  source_external_id: null,
  source_content_hash: null,
  source_snapshot: { sourceTitle: "Private GM source" },
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(<DirtyFormProvider>{node}</DirtyFormProvider>);
}

describe("enemy archive UI secrecy", () => {
  it("keeps mechanics, GM notes, and provenance out of player records", () => {
    const markup = render(<EnemyPublicRecord campaignId={enemy.campaign_id} enemy={enemy} isGM={false} />);

    expect(markup).toContain("Void Stalker");
    expect(markup).toContain("A silent shape moving between the stars.");
    expect(markup).not.toContain("It is vulnerable to the sealed frequency.");
    expect(markup).not.toContain("STRUCTURED STAT BLOCK");
    expect(markup).not.toContain("GM NOTES");
    expect(markup).not.toContain("Private GM source");
  });

  it("renders the complete private record for GMs", () => {
    const markup = render(<EnemyPublicRecord campaignId={enemy.campaign_id} enemy={enemy} isGM />);

    expect(markup).toContain("STRUCTURED STAT BLOCK");
    expect(markup).toContain("It is vulnerable to the sealed frequency.");
    expect(markup).toContain("Private GM source");
    expect(markup).toContain("LEVEL 7");
  });

  it("keeps player previews free of GM classification and mechanics", () => {
    const markup = render(<EnemyPreview campaignId={enemy.campaign_id} enemy={enemy} isGM={false} />);

    expect(markup).toContain("A silent shape moving between the stars.");
    expect(markup).toContain('data-enemy-preview-art="true"');
    expect(markup).toContain("w-[min(100%,320px)]");
    expect(markup).toContain("aspect-square");
    expect(markup).not.toContain("LEVEL 7");
    expect(markup).not.toContain("aberration");
    expect(markup).not.toContain("MECHANICS ARE GM-ONLY");
  });

  it("uses the common responsive artwork block on the full enemy record", () => {
    const markup = render(<EnemyPublicRecord campaignId={enemy.campaign_id} enemy={enemy} isGM={false} />);

    expect(markup).toContain('data-enemy-detail-portrait="true"');
    expect(markup).toContain(" w-[480px] ");
    expect(markup).toContain("max-w-full");
    expect(markup).toContain("max-[760px]:w-full");
  });

  it("only renders classification filters for GM archive views", () => {
    const playerMarkup = render(<EnemiesRouteView campaignId={enemy.campaign_id} initialEnemies={[{ ...enemy, stat_block: undefined, gm_notes_markdown: undefined }]} role="player" />);
    const gmMarkup = render(<EnemiesRouteView campaignId={enemy.campaign_id} initialEnemies={[enemy]} role="gm" />);

    expect(playerMarkup).not.toContain("TRAIT / TYPE");
    expect(playerMarkup).not.toContain("RARITY");
    expect(playerMarkup).not.toContain("SIZE");
    expect(gmMarkup).toContain("TRAIT / TYPE");
    expect(gmMarkup).toContain("LEVEL");
  });
});
