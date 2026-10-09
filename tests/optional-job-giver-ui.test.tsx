import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import DirtyFormProvider from "@/components/campaign-shell/DirtyFormProvider";
import JobEditor from "@/components/jobs/JobEditor";
import JobCard from "@/components/jobs/JobCard";
import JobPublicRecord from "@/components/jobs/JobPublicRecord";
import type { Mission } from "@/lib/campaign/types";

vi.mock("@/components/archive/CampaignArtField", () => ({ useCampaignArtEditor: vi.fn() }));

const mission: Mission = {
  id: "job-1", title: "Self-directed mission", category: "OPEN JOB", summary: "Explore a relay.",
  giver: null, giverType: null, giverId: null, votes: 0, voted: false,
  accent: "cyan", image: null, status: "open", playerNotesMarkdown: "", placeId: null,
  hook: "Private hook", gmNotesMarkdown: "Private notes",
};

describe("unassigned mission UI", () => {
  it("defaults a new editor to No giver with no required entity selector", () => {
    const html = renderToStaticMarkup(<DirtyFormProvider><JobEditor campaignId="campaign-1" npcs={[]} factions={[]} places={[]} /></DirtyFormProvider>);
    expect(html).toContain('<option value="none" selected="">NO GIVER</option>');
    expect(html).not.toContain("SELECT A GIVER");
    expect(html).toContain("SAVE MISSION");
  });

  it("opens an unassigned existing mission without a fake faction", () => {
    const html = renderToStaticMarkup(<DirtyFormProvider><JobEditor campaignId="campaign-1" npcs={[]} factions={[]} places={[]} job={mission} /></DirtyFormProvider>);
    expect(html).toContain('<option value="none" selected="">NO GIVER</option>');
  });

  it("renders a neutral job card without a faction glyph", () => {
    const html = renderToStaticMarkup(<JobCard campaignId="campaign-1" job={mission} isGM={false} index={0} onVote={() => {}} />);
    expect(html).toContain("No designated giver");
    expect(html).not.toContain("data-giver-glyph");
    expect(html).not.toContain("Unknown faction");
  });

  it.each([true, false])("renders an unassigned detail record with GM access %s", (isGM) => {
    const html = renderToStaticMarkup(<DirtyFormProvider><JobPublicRecord campaignId="campaign-1" job={mission} places={[]} isGM={isGM} /></DirtyFormProvider>);
    expect(html).toContain("No designated giver");
    expect(html).not.toContain("Unknown contact");
    expect(html.includes("Private notes")).toBe(isGM);
    expect(html.includes("Private hook")).toBe(isGM);
  });
});
