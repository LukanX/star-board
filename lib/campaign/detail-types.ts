export type RelatedPlaceSummary = {
  id: string;
  name: string;
  kind: string;
};

export type RelatedNpcSummary = {
  id: string;
  name: string;
  species: string;
  role: string;
};

export type RelatedFactionSummary = {
  id: string;
  name: string;
  status: string;
};

export type RelatedJobSummary = {
  id: string;
  title: string;
  status: "draft" | "open" | "promoted" | "archived";
};

export type RelatedEpisodeSummary = {
  id: string;
  title: string;
  status: "planned" | "active" | "complete" | "archived";
};

export type PlaceRelatedRecords = {
  parent: RelatedPlaceSummary | null;
  children: RelatedPlaceSummary[];
  npcs: RelatedNpcSummary[];
  factions: RelatedFactionSummary[];
  jobs: RelatedJobSummary[];
  episodes: RelatedEpisodeSummary[];
};

export type NpcRelatedRecords = {
  place: RelatedPlaceSummary | null;
  faction: RelatedFactionSummary | null;
  jobs: RelatedJobSummary[];
};

export type FactionRelatedRecords = {
  place: RelatedPlaceSummary | null;
  npcs: RelatedNpcSummary[];
  jobs: RelatedJobSummary[];
};