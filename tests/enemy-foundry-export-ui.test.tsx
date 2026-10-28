import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EnemyFoundryExport from "@/components/enemies/EnemyFoundryExport";

describe("enemy Foundry export UI", () => {
  it("renders the export action with an accessible name and no artwork controls", () => {
    const markup = renderToStaticMarkup(<EnemyFoundryExport campaignId="campaign" enemyId="enemy" />);

    expect(markup).toContain('aria-label="Export enemy to Foundry VTT"');
    expect(markup).toContain("EXPORT FOUNDRY ACTOR");
    expect(markup).not.toContain("Download artwork");
  });
});