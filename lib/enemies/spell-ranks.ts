export const spellRankOptions = [
  { value: "Cantrip", label: "Cantrip" },
  { value: "1st", label: "1st" },
  { value: "2nd", label: "2nd" },
  { value: "3rd", label: "3rd" },
  { value: "4th", label: "4th" },
  { value: "5th", label: "5th" },
  { value: "6th", label: "6th" },
  { value: "7th", label: "7th" },
  { value: "8th", label: "8th" },
  { value: "9th", label: "9th" },
  { value: "10th", label: "10th" },
] as const;

function rankOrder(rank: string) {
  const normalized = rank.trim().toLocaleLowerCase();
  if (normalized === "cantrip" || normalized === "cantrips") return 0;

  const levelMatch = normalized.match(/^(10|[1-9])(?:st|nd|rd|th)?(?=$|[\s-])/);
  return levelMatch ? Number(levelMatch[1]) : Number.MAX_SAFE_INTEGER;
}

export function isCantripRank(rank: string) {
  const normalized = rank.trim().toLocaleLowerCase();
  return normalized === "cantrip" || normalized === "cantrips";
}

export function spellRankLabel(rank: string) {
  const order = rankOrder(rank);
  return order < spellRankOptions.length ? spellRankOptions[order].label : rank;
}

export function cantripCastLevel(creatureLevel: number) {
  return Math.ceil(creatureLevel / 2);
}

export function spellRankLabelForLevel(level: number) {
  const normalizedLevel = Object.is(level, -0) ? 0 : level;
  if (normalizedLevel >= 0 && normalizedLevel < spellRankOptions.length) return normalizedLevel === 0 ? "0th" : spellRankOptions[normalizedLevel].label;
  const lastTwoDigits = Math.abs(normalizedLevel) % 100;
  const suffix = lastTwoDigits >= 11 && lastTwoDigits <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[Math.abs(normalizedLevel) % 10] ?? "th");
  return `${normalizedLevel}${suffix}`;
}

export function sortSpellEntries<Entry extends { rank: string }>(entries: readonly Entry[]) {
  return entries.map((entry, index) => ({ entry, index })).sort((left, right) => rankOrder(left.entry.rank) - rankOrder(right.entry.rank) || left.index - right.index).map(({ entry }) => entry);
}
