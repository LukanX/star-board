import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { unified } from "unified";
import type { NoteEntityType } from "@/lib/campaign/note-subject";
import type { NoteVisibility } from "@/lib/campaign/types";

type NoteLinkNode = {
  type?: unknown;
  url?: unknown;
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  children?: unknown[];
};

type NoteLinkType = NoteEntityType | "episode";
type NoteLinkReference = { type: NoteLinkType; id: string };
type NoteLinkResult = { data: unknown[] | null; error: unknown };
type NoteLinkQuery = PromiseLike<NoteLinkResult> & {
  select: (columns: string) => NoteLinkQuery;
  eq: (column: string, value: string) => NoteLinkQuery;
  in: (column: string, values: string[]) => NoteLinkQuery;
};
type NoteLinkClient = { from: (table: string) => NoteLinkQuery };

const typeBySection: Record<string, NoteLinkType> = {
  characters: "character",
  npcs: "npc",
  places: "place",
  factions: "faction",
  jobs: "job",
  enemies: "enemy",
  episodes: "episode",
};
const markdownProcessor = unified().use(remarkParse).use(remarkGfm);

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseCampaignEntityHref(href: string, campaignId: string): NoteLinkReference | "other" | "invalid" {
  if (!href.startsWith("/campaigns/")) return "other";
  const segments = new URL(href, "https://star-board.invalid").pathname.split("/").filter(Boolean);
  if (segments[0] !== "campaigns" || segments.length < 3) return "other";
  const linkedCampaign = decodeSegment(segments[1]);
  if (linkedCampaign !== campaignId) return "invalid";
  const type = typeBySection[segments[2]];
  if (!type) return "other";
  if (segments.length !== 4) return "invalid";
  const id = decodeSegment(segments[3]);
  return id ? { type, id } : "invalid";
}

function collectInternalLinks(markdown: string, campaignId: string) {
  const tree = markdownProcessor.parse(markdown);
  const references = new Map<string, NoteLinkReference>();
  const positions: Array<{ start: number; end: number; reference: NoteLinkReference | "invalid" }> = [];

  const walk = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    const node = candidate as NoteLinkNode;
    if ((node.type === "link" || node.type === "definition") && typeof node.url === "string") {
      const parsed = parseCampaignEntityHref(node.url, campaignId);
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (parsed !== "other") {
        if (parsed !== "invalid" && parsed) references.set(`${parsed.type}:${parsed.id}`, parsed);
        if (typeof start === "number" && typeof end === "number") positions.push({ start, end, reference: parsed });
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };

  walk(tree);
  return { references: [...references.values()], positions };
}

async function readReferenceRows(
  supabase: unknown,
  campaignId: string,
  references: NoteLinkReference[],
): Promise<Map<string, Record<string, unknown>>> {
  const tableByType = {
    character: "characters",
    npc: "npcs",
    place: "places",
    faction: "factions",
    job: "jobs",
    enemy: "enemies",
    episode: "episodes",
  } as const;
  const rows = new Map<string, Record<string, unknown>>();
  const groupedReferences = new Map<NoteLinkType, Set<string>>();
  for (const reference of references) {
    const ids = groupedReferences.get(reference.type) ?? new Set<string>();
    ids.add(reference.id);
    groupedReferences.set(reference.type, ids);
  }

  const client = supabase as NoteLinkClient;
  await Promise.all([...groupedReferences].map(async ([type, ids]) => {
    const columns = type === "job" ? "id, status" : type === "enemy" ? "id, is_revealed" : "id";
    const { data, error } = await client
      .from(tableByType[type])
      .select(columns)
      .in("id", [...ids])
      .eq("campaign_id", campaignId);
    if (error) return;
    for (const row of data ?? []) {
      if (row && typeof row === "object" && "id" in row && typeof row.id === "string") {
        rows.set(`${type}:${row.id}`, row as Record<string, unknown>);
      }
    }
  }));
  return rows;
}

function isReferenceVisible(
  reference: NoteLinkReference,
  rows: Map<string, Record<string, unknown>>,
  visibility: NoteVisibility,
): boolean {
  const data = rows.get(`${reference.type}:${reference.id}`);
  if (!data) return false;
  if (visibility === "player" && reference.type === "job" && data.status === "draft") return false;
  if (visibility === "player" && reference.type === "enemy" && data.is_revealed !== true) return false;
  return true;
}

export async function validateNoteEntityLinks(
  supabase: unknown,
  campaignId: string,
  markdown: string,
): Promise<boolean> {
  const { references, positions } = collectInternalLinks(markdown, campaignId);
  if (positions.some((position) => position.reference === "invalid") || references.length > 64) return false;

  const rows = await readReferenceRows(supabase, campaignId, references);
  return references.every((reference) => isReferenceVisible(reference, rows, "player"));
}

export async function maskHiddenNoteEntityLinks(
  supabase: unknown,
  campaignId: string,
  markdown: string,
  visibility: NoteVisibility,
): Promise<string> {
  const [masked] = await maskHiddenNoteEntityLinksBatch(supabase, campaignId, [{ markdown, visibility }]);
  return masked;
}

export async function maskHiddenNoteEntityLinksBatch(
  supabase: unknown,
  campaignId: string,
  notes: Array<{ markdown: string; visibility: NoteVisibility }>,
): Promise<string[]> {
  const collected = notes.map(({ markdown }) => collectInternalLinks(markdown, campaignId));
  const references = [...new Map(collected.flatMap(({ references: noteReferences }) =>
    noteReferences.map((reference) => [`${reference.type}:${reference.id}`, reference] as const),
  )).values()];
  const rows = await readReferenceRows(supabase, campaignId, references);

  return notes.map((note, index) => {
    const hiddenPositions = collected[index].positions
      .filter((position) => position.reference === "invalid"
        || !isReferenceVisible(position.reference, rows, note.visibility))
      .sort((left, right) => right.start - left.start);
    let masked = note.markdown;
    for (const position of hiddenPositions) {
      masked = `${masked.slice(0, position.start)}Unavailable campaign record${masked.slice(position.end)}`;
    }
    return masked;
  });
}
