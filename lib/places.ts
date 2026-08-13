import type { SupabaseClient } from "@supabase/supabase-js";

export type PlaceRecord = {
  id: string;
  campaign_id: string;
  parent_place_id: string | null;
  name: string;
  kind: string;
};

export type PlaceTreeNode<T extends PlaceRecord = PlaceRecord> = T & {
  children: PlaceTreeNode<T>[];
};

export type FlattenedPlace<T extends PlaceRecord = PlaceRecord> = {
  place: T;
  depth: number;
};

export function buildPlaceTree<T extends PlaceRecord>(places: T[]) {
  const nodes = new Map<string, PlaceTreeNode<T>>(
    places.map((place) => [place.id, { ...place, children: [] }]),
  );
  const roots: PlaceTreeNode<T>[] = [];

  for (const place of places) {
    const node = nodes.get(place.id);
    const parent = place.parent_place_id ? nodes.get(place.parent_place_id) : undefined;

    if (!node || !parent || parent.id === node.id) {
      if (node) roots.push(node);
      continue;
    }

    parent.children.push(node);
  }

  return roots;
}

export function flattenPlaceTree<T extends PlaceRecord>(places: T[]) {
  const flattened: FlattenedPlace<T>[] = [];

  function visit(nodes: PlaceTreeNode<T>[], depth: number) {
    for (const node of nodes) {
      flattened.push({ place: node, depth });
      visit(node.children, depth + 1);
    }
  }

  visit(buildPlaceTree(places), 0);
  return flattened;
}

export function getPlaceAncestors<T extends PlaceRecord>(places: T[], placeId: string) {
  const placesById = new Map(places.map((place) => [place.id, place]));
  const ancestors: T[] = [];
  const visited = new Set<string>();
  let current = placesById.get(placeId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    ancestors.unshift(current);
    current = current.parent_place_id ? placesById.get(current.parent_place_id) : undefined;
  }

  return ancestors;
}

export function getPlaceBreadcrumb<T extends PlaceRecord>(places: T[], placeId: string | null | undefined, separator = " > ") {
  if (!placeId) return "";
  return getPlaceAncestors(places, placeId).map((place) => place.name).join(separator);
}

export function isPlaceDescendant<T extends PlaceRecord>(places: T[], candidateId: string, ancestorId: string) {
  const placesById = new Map(places.map((place) => [place.id, place]));
  const visited = new Set<string>();
  let current = placesById.get(candidateId);

  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true;
    visited.add(current.id);
    current = current.parent_place_id ? placesById.get(current.parent_place_id) : undefined;
  }

  return false;
}

export async function validateCampaignPlace(supabase: SupabaseClient, campaignId: string, placeId: string | null | undefined) {
  if (!placeId) return { valid: true, unavailable: false };

  const { data, error } = await supabase
    .from("places")
    .select("id")
    .eq("id", placeId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  return { valid: Boolean(data) && !error, unavailable: Boolean(error) };
}
