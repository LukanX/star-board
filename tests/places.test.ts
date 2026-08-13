import { describe, expect, it } from "vitest";
import { buildPlaceTree, flattenPlaceTree, getPlaceBreadcrumb, isPlaceDescendant } from "@/lib/places";
import { createPlaceSchema, updatePlaceSchema } from "@/lib/validation/place";

const campaignId = "00000000-0000-4000-8000-000000000001";
const rootId = "00000000-0000-4000-8000-000000000002";
const childId = "00000000-0000-4000-8000-000000000003";
const roomId = "00000000-0000-4000-8000-000000000004";

const places = [
  { id: rootId, campaign_id: campaignId, parent_place_id: null, name: "Asterion", kind: "planet" },
  { id: childId, campaign_id: campaignId, parent_place_id: rootId, name: "Night Market", kind: "district" },
  { id: roomId, campaign_id: campaignId, parent_place_id: childId, name: "The Blue Door", kind: "room" },
];

describe("place hierarchy helpers", () => {
  it("builds and flattens arbitrary-depth place trees", () => {
    const tree = buildPlaceTree([places[2], places[0], places[1]]);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Asterion");
    expect(tree[0].children[0].children[0].name).toBe("The Blue Door");
    expect(flattenPlaceTree([places[2], places[0], places[1]]).map(({ place, depth }) => [place.name, depth])).toEqual([
      ["Asterion", 0],
      ["Night Market", 1],
      ["The Blue Door", 2],
    ]);
  });

  it("returns breadcrumbs and descendant relationships", () => {
    expect(getPlaceBreadcrumb(places, roomId)).toBe("Asterion > Night Market > The Blue Door");
    expect(getPlaceBreadcrumb(places, null)).toBe("");
    expect(isPlaceDescendant(places, roomId, rootId)).toBe(true);
    expect(isPlaceDescendant(places, rootId, roomId)).toBe(false);
  });
});

describe("place validation", () => {
  it("accepts a root or nested public record with optional private notes", () => {
    expect(createPlaceSchema.parse({ name: "Asterion", kind: "planet" })).toMatchObject({
      name: "Asterion",
      kind: "planet",
      description: "",
      playerNotesMarkdown: "",
      gmNotesMarkdown: "",
    });

    expect(createPlaceSchema.parse({
      name: "Night Market",
      parentPlaceId: rootId,
      description: "A crowded district.",
      gmNotesMarkdown: "The market hides a sealed gate.",
    })).toMatchObject({ parentPlaceId: rootId, gmNotesMarkdown: "The market hides a sealed gate." });
  });

  it("requires at least one field for updates and rejects malformed parent IDs", () => {
    expect(updatePlaceSchema.safeParse({}).success).toBe(false);
    expect(updatePlaceSchema.safeParse({ parentPlaceId: "not-a-uuid" }).success).toBe(false);
    expect(updatePlaceSchema.safeParse({ parentPlaceId: null }).success).toBe(true);
  });
});
