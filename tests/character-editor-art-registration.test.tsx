import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import type { ApiCharacter } from "@/lib/campaign/types";

const mocks = vi.hoisted(() => ({
  useCampaignArtEditor: vi.fn(),
}));

vi.mock("@/components/archive/CampaignArtField", () => ({
  markCampaignArtPersisted: vi.fn(),
  useCampaignArtEditor: mocks.useCampaignArtEditor,
}));

import CharacterEditor from "@/components/characters/CharacterEditor";

const campaignId = "00000000-0000-4000-8000-000000000001";
const character: ApiCharacter = {
  id: "00000000-0000-4000-8000-000000000002",
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

function renderEditor(editor: React.ReactNode) {
  return renderToStaticMarkup(<DirtyFormProvider>{editor}</DirtyFormProvider>);
}

describe("character editor art registration", () => {
  it("registers the saved portrait target with the standard generator identity", () => {
    renderEditor(<CharacterEditor campaignId={campaignId} character={character} />);

    const target = mocks.useCampaignArtEditor.mock.calls.at(-1)?.[0];
    expect(target).toMatchObject({
      campaignId,
      kind: "character",
      characterId: character.id,
      portraitAiRole: "player",
      showGenerator: true,
      trackUnsavedUploads: true,
    });
  });

  it("keeps new characters on manual artwork controls", () => {
    renderEditor(<CharacterEditor campaignId={campaignId} />);

    const target = mocks.useCampaignArtEditor.mock.calls.at(-1)?.[0];
    expect(target).toMatchObject({
      campaignId,
      kind: "character",
      showGenerator: false,
      trackUnsavedUploads: true,
    });
    expect(target.characterId).toBeUndefined();
  });
});
