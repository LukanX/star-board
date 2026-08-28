import { describe, expect, test } from "vitest";
import {
  getAttachedArtUrl,
  getCampaignRecord,
  mapApiCharacter,
  mapApiEpisode,
  mapApiFaction,
  mapApiJob,
  mapApiNpc,
  mapApiNote,
  toCharacterDraft,
} from "@/lib/campaign/mappers";
import type {
  ApiCampaignNote,
  ApiCharacter,
  ApiEpisode,
  ApiFaction,
  ApiJob,
  ApiNpc,
  CampaignMembership,
  Character,
} from "@/lib/campaign/types";

const job = (overrides: Partial<ApiJob> = {}): ApiJob => ({
  id: "job-1",
  title: "Recover the signal",
  summary: "",
  status: "open",
  player_notes_markdown: "Notes",
  giver_npc_id: null,
  giver_faction_id: null,
  place_id: null,
  art_path: null,
  art_subject: null,
  art_prompt: null,
  art_provider: null,
  giver: { type: "NPC", name: "Mara" },
  votes: 2,
  voted: false,
  ...overrides,
});

const character = (overrides: Partial<ApiCharacter> = {}): ApiCharacter => ({
  id: "character-1",
  owner_id: "user-1",
  name: "Ari",
  species: "Human",
  class_name: "Pilot",
  level: 3,
  backstory_markdown: "Past",
  physical_description: "Tall",
  art_subject: null,
  art_path: "https://example.com/art.png",
  art_url: null,
  art_prompt: null,
  art_provider: undefined,
  ...overrides,
});

describe("campaign mappers", () => {
  test("prefers signed art URLs and rejects non-http paths", () => {
    expect(getAttachedArtUrl("https://signed.example/art", "https://path.example/art")).toBe("https://signed.example/art");
    expect(getAttachedArtUrl(null, "http://path.example/art")).toBe("http://path.example/art");
    expect(getAttachedArtUrl(undefined, "storage/path.png")).toBeNull();
  });

  test("maps jobs with defaults, giver precedence, and cycling accents", () => {
    expect(mapApiJob(job({ status: "draft", giver_npc_id: "npc-1", giver_faction_id: "faction-1" }), 0)).toMatchObject({ category: "DRAFT SIGNAL", summary: "No public mission brief recorded.", giverId: "npc-1", accent: "cyan" });
    expect(mapApiJob(job({ giver_faction_id: "faction-1" }), 1)).toMatchObject({ giverId: "faction-1", accent: "pink" });
    expect(mapApiJob(job(), 2).accent).toBe("amber");
  });

  test("maps characters with display fields, status, permission, and art", () => {
    expect(mapApiCharacter(character({ species: "", class_name: "", art_url: undefined }), 2)).toMatchObject({ subtitle: "Unclassified crew member", detail: "Unassigned class // Level 3", status: "ACTIVE", canEdit: false, image: "https://example.com/art.png", color: "purple" });
  });

  test("cycles NPC and faction colors", () => {
    const npc = { id: "npc", author_id: "user", name: "N", species: "", role: "", description: "", player_notes_markdown: "", place_id: null, faction_id: null, art_subject: null, art_path: null, art_prompt: null } satisfies ApiNpc;
    const faction = { id: "faction", author_id: "user", name: "F", description: "", status: "active", player_notes_markdown: "", place_id: null, art_path: null, art_subject: null, art_prompt: null } satisfies ApiFaction;
    expect([0, 1, 2].map((index) => mapApiNpc(npc, index).color)).toEqual(["cyan", "amber", "pink"]);
    expect([0, 1, 2].map((index) => mapApiFaction(faction, index).color)).toEqual(["pink", "cyan", "amber"]);
  });

  test("cycles note and episode accents", () => {
    const note = { id: "note", campaign_id: "campaign", episode_id: null, author_id: "user", title: "N", body_markdown: "", visibility: "player", created_at: "", updated_at: "", updated_by: null, author: { id: "user", displayName: "User" }, permissions: { canEdit: true, canDelete: false } } satisfies ApiCampaignNote;
    const episode = { id: "episode", campaign_id: "campaign", source_job_id: null, place_id: null, created_by: "user", title: "E", summary: "", player_context_markdown: "", status: "planned", started_at: null, completed_at: null, created_at: "", updated_at: "", noteCount: 0 } satisfies ApiEpisode;
    expect([0, 1, 2, 3].map((index) => mapApiNote(note, index).accent)).toEqual(["cyan", "pink", "amber", "purple"]);
    expect([0, 1, 2].map((index) => mapApiEpisode(episode, index).accent)).toEqual(["cyan", "pink", "amber"]);
  });

  test("unwraps campaign arrays and returns null when missing", () => {
    const campaign = { id: "campaign", name: "Board", system: "", description: "", created_by: "user" };
    expect(getCampaignRecord({ role: "gm", display_name: "User", campaign: [campaign] })).toEqual(campaign);
    expect(getCampaignRecord({ role: "gm", display_name: "User", campaign: [] })).toBeNull();
    expect(getCampaignRecord({ role: "gm", display_name: "User", campaign: null })).toBeNull();
  });

  test("converts a character to a draft while preserving nullable art fields", () => {
    const mapped = mapApiCharacter(character({ art_subject: null, art_path: null, art_url: null, art_prompt: null, art_provider: null }), 0);
    expect(toCharacterDraft(mapped)).toEqual({ name: "Ari", species: "Human", className: "Pilot", level: 3, backstoryMarkdown: "Past", physicalDescription: "Tall", artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null });
  });
});