import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AiArtStudio from "@/components/archive/AiArtStudio";
import AiDraftAssistant, { hasUsableDescription } from "@/components/archive/AiDraftAssistant";
import CampaignArtField from "@/components/archive/CampaignArtField";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import CharacterDetailRouteView from "@/components/characters/CharacterDetailRouteView";
import CharacterEditor from "@/components/characters/CharacterEditor";
import type { ApiCharacter } from "@/lib/campaign/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/campaign/client/characters", () => ({
  deleteCampaignCharacter: vi.fn(),
}));

const campaignId = "00000000-0000-4000-8000-000000000001";
const characterId = "00000000-0000-4000-8000-000000000002";

const character: ApiCharacter = {
  id: characterId,
  owner_id: "00000000-0000-4000-8000-000000000003",
  name: "Nova Vex",
  species: "Android",
  class_name: "Mechanic",
  level: 3,
  backstory_markdown: "A survivor of the Meridian.",
  physical_description: "Tall, silver-eyed, and marked by a blue circuit scar.",
  art_subject: "A silver-eyed mechanic in a worn flight jacket.",
  art_path: null,
  art_url: null,
  art_prompt: null,
  art_provider: null,
  can_edit: true,
  can_generate_portrait: true,
  portrait_ai_role: "player",
};

function render(node: React.ReactNode) {
  return renderToStaticMarkup(<DirtyFormProvider>{node}</DirtyFormProvider>);
}

describe("character portrait UI boundaries", () => {
  it("keeps generic character AI out of the manual editor", () => {
    const markup = render(<CharacterEditor campaignId={campaignId} />);

    expect(markup).not.toContain("OPEN AI WORKSPACE");
    expect(markup).not.toContain("GENERATE DRAFT");
    expect(markup).not.toContain("GENERATE ART");
  });

    it("exposes the saved-character workspace only when the server grants it", () => {
      const enabledMarkup = render(<CharacterEditor campaignId={campaignId} character={character} />);
      const disabledMarkup = render(
        <CharacterEditor
          campaignId={campaignId}
          character={{ ...character, can_generate_portrait: false, portrait_ai_role: null }}
        />,
      );

      expect(enabledMarkup).toContain("OPEN AI WORKSPACE");
      expect(disabledMarkup).not.toContain("OPEN AI WORKSPACE");
  });

  it("keeps character detail editing on the normal save boundary", () => {
    const markup = render(<CharacterDetailRouteView campaignId={campaignId} initialCharacter={character} />);

    expect(markup).not.toContain("GENERATE PORTRAIT");
    expect(markup).not.toContain("SAVE PORTRAIT");
    expect(markup).toContain("EDIT");
  });

  it("hides model and style administration controls from player portrait studios", () => {
    const playerMarkup = render(
      <AiArtStudio
        campaignId={campaignId}
        kind="character"
        characterId={characterId}
        portraitAiRole="player"
        subject={character.art_subject ?? ""}
        onApproved={() => undefined}
      />,
    );
    const gmMarkup = render(
      <AiArtStudio
        campaignId={campaignId}
        kind="character"
        characterId={characterId}
        portraitAiRole="gm"
        subject={character.art_subject ?? ""}
        onApproved={() => undefined}
      />,
    );

    expect(playerMarkup).toContain("PLAYER TOOL // PORTRAIT DRAFT");
    expect(playerMarkup).toContain("Image description");
    expect(playerMarkup).not.toContain("VISUAL STYLE");
    expect(playerMarkup).not.toContain("IMAGE MODEL");
    expect(gmMarkup).toContain("VISUAL STYLE");
    expect(gmMarkup).toContain("IMAGE MODEL");
  });

  it("uses a single description workflow for character assistance", () => {
    const markup = render(
      <AiDraftAssistant
        descriptionOnly
        open
        campaignId={campaignId}
        endpoint="/api/ai/character"
        entityLabel="CHARACTER"
        mode="create"
        currentDraft={{ visualPrompt: "" }}
        fields={[{ key: "visualPrompt", label: "Image description", maxLength: 1200, multiline: true }]}
        showModelPicker={false}
        onBack={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(markup).toContain("GENERATE DESCRIPTION");
    expect(markup).toContain("Image description direction");
    expect(markup).not.toContain("GM direction");
    expect(markup).not.toContain("Portrait direction");
    expect(markup).not.toContain("NEW DRAFT");
    expect(markup).not.toContain("USE DRAFT");
    expect(markup).not.toContain("KEEP");
    expect(markup).not.toContain("BACK TO EDITOR");
  });

  it("rejects a blank description before it can be used", () => {
    expect(
      hasUsableDescription(
        { visualPrompt: "  " },
        [{ key: "visualPrompt", label: "Image description", maxLength: 1200 }],
      ),
    ).toBe(false);
    expect(
      hasUsableDescription(
        { visualPrompt: "A pilot in a weathered flight suit." },
        [{ key: "visualPrompt", label: "Image description", maxLength: 1200 }],
      ),
    ).toBe(true);
  });

  it("preserves manual artwork controls without the generic generator", () => {
    const markup = render(
      <CampaignArtField
        campaignId={campaignId}
        kind="character"
        showGenerator={false}
        value={null}
        onChange={() => undefined}
        onUrlChange={() => undefined}
      />,
    );

    expect(markup).toContain("UPLOAD ART");
    expect(markup).not.toContain("GENERATE ART");
  });
});
