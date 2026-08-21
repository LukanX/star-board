import { describe, expect, it } from "vitest";
import {
  campaignEntityPath,
  campaignPath,
  campaignSectionPath,
  campaignsPath,
  getCampaignSectionFromPath,
  legacyCampaignPath,
  loginPath,
} from "@/lib/campaign/routes";
import { campaignNavigation, getCampaignNavigationItem } from "@/lib/campaign/navigation";

describe("campaign route contracts", () => {
  it("builds canonical campaign and section paths with overview at the campaign root", () => {
    expect(campaignsPath()).toBe("/campaigns");
    expect(campaignPath("campaign-42")).toBe("/campaigns/campaign-42");
    expect(campaignSectionPath("campaign-42", "overview")).toBe("/campaigns/campaign-42");
    expect(campaignSectionPath("campaign-42", "jobs")).toBe("/campaigns/campaign-42/jobs");
    expect(campaignEntityPath("campaign-42", "jobs", "job-7")).toBe("/campaigns/campaign-42/jobs/job-7");
    expect(campaignSectionPath("campaign-42", "characters")).toBe("/campaigns/campaign-42/characters");
    expect(campaignEntityPath("campaign-42", "characters", "character-7")).toBe("/campaigns/campaign-42/characters/character-7");
    expect(campaignSectionPath("campaign-42", "npcs")).toBe("/campaigns/campaign-42/npcs");
    expect(campaignEntityPath("campaign-42", "npcs", "npc-7")).toBe("/campaigns/campaign-42/npcs/npc-7");
    expect(campaignSectionPath("campaign-42", "factions")).toBe("/campaigns/campaign-42/factions");
    expect(campaignEntityPath("campaign-42", "factions", "faction-7")).toBe("/campaigns/campaign-42/factions/faction-7");
    expect(campaignSectionPath("campaign-42", "places")).toBe("/campaigns/campaign-42/places");
    expect(campaignEntityPath("campaign-42", "places", "place-7")).toBe("/campaigns/campaign-42/places/place-7");
    expect(campaignSectionPath("campaign-42", "episodes")).toBe("/campaigns/campaign-42/episodes");
    expect(campaignEntityPath("campaign-42", "episodes", "episode-7")).toBe("/campaigns/campaign-42/episodes/episode-7");
    expect(campaignSectionPath("campaign-42", "notes")).toBe("/campaigns/campaign-42/notes");
    expect(campaignEntityPath("campaign-42", "notes", "note-7")).toBe("/campaigns/campaign-42/notes/note-7");
    expect(campaignSectionPath("campaign-42", "members")).toBe("/campaigns/campaign-42/members");
    expect(campaignSectionPath("campaign-42", "settings")).toBe("/campaigns/campaign-42/settings");
  });

  it("encodes campaign and entity path segments independently", () => {
    expect(campaignPath("crew alpha/beta")).toBe("/campaigns/crew%20alpha%2Fbeta");
    expect(campaignEntityPath("crew alpha/beta", "notes", "log / one")).toBe(
      "/campaigns/crew%20alpha%2Fbeta/notes/log%20%2F%20one",
    );
  });

  it("derives the active campaign section from list and detail routes", () => {
    expect(getCampaignSectionFromPath("/campaigns/campaign-42", "campaign-42")).toBe("overview");
    expect(getCampaignSectionFromPath("/campaigns/campaign-42/npcs", "campaign-42")).toBe("npcs");
    expect(getCampaignSectionFromPath("/campaigns/campaign-42/npcs/npc-7", "campaign-42")).toBe("npcs");
    expect(getCampaignSectionFromPath("/campaigns/another-campaign/npcs", "campaign-42")).toBe("overview");
  });

  it("builds login paths with and without a next destination", () => {
    expect(loginPath()).toBe("/login");
    expect(loginPath("/campaigns/crew alpha/notes?scope=private")).toBe(
      "/login?next=%2Fcampaigns%2Fcrew+alpha%2Fnotes%3Fscope%3Dprivate",
    );
  });

  it("builds the legacy campaign query path", () => {
    expect(legacyCampaignPath("crew alpha/beta")).toBe("/?campaignId=crew+alpha%2Fbeta");
  });
});

describe("campaign navigation metadata", () => {
  it("includes Crew access in Control and returns it from lookup", () => {
    expect(campaignNavigation).toContainEqual({ id: "members", label: "Crew access", group: "Control" });
    expect(getCampaignNavigationItem("members")).toEqual({ id: "members", label: "Crew access", group: "Control" });
  });

  it("returns undefined for an invalid runtime section", () => {
    expect(getCampaignNavigationItem("invalid" as never)).toBeUndefined();
  });
});