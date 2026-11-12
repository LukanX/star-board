import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StudioDraftReview from "@/components/ai-studio/StudioDraftReview";
import StudioLibrary from "@/components/ai-studio/StudioLibrary";
import ArtEditPanel from "@/components/ui/ArtEditPanel";
import type { ImageDraft } from "@/lib/ai/image-job-polling";
import type { StudioAsset } from "@/lib/campaign/studio-server";

const manifest = { composition: { subjects: [], grid: "gridless" as const, useCampaignStyle: false }, direction: "A reactor corridor", sources: [], references: [], style: "" };
const id = "00000000-0000-4000-8000-000000000003";

const draft: ImageDraft = {
  generationRunId: id, targetKind: "scene", purpose: "studio-art", mode: "create", operation: "generate", subject: "A reactor corridor",
  aspectRatio: "1:1", prompt: "Prompt", provider: "openrouter", model: "openai/gpt-image-1", createdAt: "2026-08-03T12:34:56.000Z",
  image: { base64: null, url: "https://storage.example/draft.png", mediaType: "image/png" }, studioManifest: manifest,
};

function review(overrides: Partial<Parameters<typeof StudioDraftReview>[0]> = {}) {
  return renderToStaticMarkup(<StudioDraftReview
    jobs={[{ generationRunId: id }]} drafts={[draft]} selectedId={id} busy={null} title="" caption="" editInstruction="" editBlockedReason={null}
    onSelect={() => undefined} onTitle={() => undefined} onCaption={() => undefined} onEditInstruction={() => undefined}
    onSave={() => undefined} onDiscard={() => undefined} onForget={() => undefined} onRedo={() => undefined} onEdit={() => undefined} {...overrides}
  />);
}

describe("ArtEditPanel", () => {
  const panel = (props: Partial<Parameters<typeof ArtEditPanel>[0]> = {}) => renderToStaticMarkup(
    <ArtEditPanel sourceLabel="SELECTED DRAFT" instruction="" busy={false} onInstructionChange={() => undefined} onSubmit={() => undefined} {...props} />,
  );

  it("names the source and keeps Apply disabled until an instruction exists", () => {
    const empty = panel();
    expect(empty).toContain("EDITING // SELECTED DRAFT");
    expect(empty).toMatch(/<button[^>]*\sdisabled=""[^>]*>.*APPLY EDIT/);
    expect(panel({ instruction: "Add rain" })).not.toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("explains an unsupported model and disables the control", () => {
    const blocked = panel({ instruction: "Add rain", blockedReason: "The selected image model cannot edit images." });
    expect(blocked).toContain("The selected image model cannot edit images.");
    expect(blocked).toMatch(/<button[^>]*\sdisabled=""/);
    expect(blocked).toMatch(/<textarea[^>]*\sdisabled=""/);
  });

  it("shows pending state and prevents a duplicate submission", () => {
    const busy = panel({ instruction: "Add rain", busy: true });
    expect(busy).toContain("EDITING...");
    expect(busy).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("bounds the instruction length", () => {
    expect(panel()).toContain('maxLength="600"');
  });
});

describe("Studio draft review actions", () => {
  it("offers redo and edit alongside save and discard", () => {
    const markup = review();
    expect(markup).toContain("Redo with changes");
    expect(markup).toContain("EDIT WITH AI");
    expect(markup).toContain("Add to library");
    expect(markup).toContain("Discard image draft");
  });

  it("disables redo and edit while another request is running", () => {
    const markup = review({ busy: "Saving artwork...", title: "Reactor" });
    expect(markup).toMatch(/<button[^>]*\sdisabled=""[^>]*>(<svg.*?<\/svg>)?Redo with changes/);
    expect(markup).toMatch(/<button[^>]*\sdisabled=""[^>]*>Add to library/);
  });

  it("surfaces the unsupported-model message for Edit", () => {
    expect(review({ editBlockedReason: "Choose an image model that accepts image input." })).toContain("Choose an image model that accepts image input.");
  });

  it("offers Foundry export only for battlemap review drafts", () => {
    expect(review()).not.toContain("Export for Foundry");
    const mapDraft = { ...draft, targetKind: "battlemap" as const };
    expect(review({ drafts: [mapDraft] })).toContain("Export for Foundry");
  });
});

describe("Studio library edit action", () => {
  it("offers an Edit image action for each saved artwork", () => {
    const asset = {
      id, campaign_id: id, title: "Reactor corridor", caption: "", kind: "scene", path: "a/b/c.png", media_type: "image/png", prompt: "Prompt",
      manifest, model: "openai/gpt-image-1", provider: "openrouter", aspect_ratio: "1:1", created_at: "now", updated_at: "now",
      operation: "generate", requested_resolution: null, image_width: null, image_height: null, source_asset_id: null,
      signedUrl: "https://storage.example/a.png", shared: false,
    } as StudioAsset;
    const markup = renderToStaticMarkup(<StudioLibrary campaignId={id} assets={[asset]} filter="all" loading={false}
      onFilter={() => undefined} onChange={() => undefined} onReuse={() => undefined} onEdit={() => undefined} />);
    expect(markup).toContain("Edit image with AI");
  });

  it("offers Foundry export on saved battlemaps but not scene artwork", () => {
    const asset = {
      id, campaign_id: id, title: "Reactor", caption: "", kind: "scene", path: "a/b/c.png",
      media_type: "image/png", prompt: "Prompt", manifest, model: "test/image", provider: "openrouter",
      aspect_ratio: "1:1", created_at: "now", updated_at: "now", operation: "generate",
      requested_resolution: null, image_width: null, image_height: null, source_asset_id: null,
      signedUrl: "https://storage.example/a.png", shared: false,
    } as StudioAsset;
    const render = (entry: StudioAsset) => renderToStaticMarkup(<StudioLibrary campaignId={id} assets={[entry]} filter="all" loading={false}
      onFilter={() => undefined} onChange={() => undefined} onReuse={() => undefined} onEdit={() => undefined} />);
    expect(render(asset)).not.toContain("Export for Foundry");
    expect(render({ ...asset, kind: "battlemap" })).toContain("Export for Foundry");
  });
});
