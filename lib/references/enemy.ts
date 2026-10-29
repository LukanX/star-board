import type { EnemyReferenceSelections } from "@/lib/validation/reference";

export function reconcileEnemyReferences(references: EnemyReferenceSelections, traits: string[], names: Record<string, string>): EnemyReferenceSelections {
  const present = new Set(traits.map((trait) => trait.trim().toLowerCase()));
  return { ancestry: references.ancestry, creatureTraits: references.creatureTraits.filter((binding) => {
    const name = names[binding.id];
    return name !== undefined && present.has(name.toLowerCase());
  }) };
}
