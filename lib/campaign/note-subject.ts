export const noteSubjectColumnByType = {
  character: "character_id",
  npc: "npc_id",
  place: "place_id",
  faction: "faction_id",
  job: "job_id",
  enemy: "enemy_id",
} as const;

export type NoteEntityType = keyof typeof noteSubjectColumnByType;
export type NoteEntitySubject = { type: NoteEntityType; id: string };
export type NoteSubjectColumn = (typeof noteSubjectColumnByType)[NoteEntityType];

export const noteSubjectColumns = Object.values(noteSubjectColumnByType) as NoteSubjectColumn[];
export const campaignNoteColumns = "id, campaign_id, episode_id, author_id, title, body_markdown, visibility, created_at, updated_at, updated_by, revision, character_id, npc_id, place_id, faction_id, job_id, enemy_id";

export type NoteSubjectDatabaseFields = Record<NoteSubjectColumn, string | null>;

export function noteSubjectToDatabase(subject?: NoteEntitySubject): Partial<NoteSubjectDatabaseFields> {
  if (!subject) return {};
  return { [noteSubjectColumnByType[subject.type]]: subject.id } as Partial<NoteSubjectDatabaseFields>;
}

export function noteSubjectFromDatabase<T extends Record<string, unknown>>(
  note: T & NoteSubjectDatabaseFields,
): Omit<T, NoteSubjectColumn> & { entity_type: NoteEntityType | null; entity_id: string | null } {
  const subject = note as T & NoteSubjectDatabaseFields;
  const subjectColumn = noteSubjectColumns.find((column) => subject[column] !== null && subject[column] !== undefined);
  const subjectType = subjectColumn
    ? (Object.entries(noteSubjectColumnByType).find(([, column]) => column === subjectColumn)?.[0] as NoteEntityType)
    : null;
  const subjectId = subjectColumn ? subject[subjectColumn] : null;
  const rest = { ...subject } as Record<string, unknown>;
  noteSubjectColumns.forEach((column) => delete rest[column]);

  return { ...rest, entity_type: subjectType, entity_id: subjectId } as Omit<T, NoteSubjectColumn> & {
    entity_type: NoteEntityType | null;
    entity_id: string | null;
  };
}