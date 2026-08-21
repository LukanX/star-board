import Link from "next/link";
import VisualAsset from "@/components/ui/VisualAsset";
import StatusPill from "@/components/ui/StatusPill";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { Character } from "@/lib/campaign/types";

export default function CharacterCard({ campaignId, character }: { campaignId: string; character: Character }) {
  return <article className="character-card">
    <Link aria-label={`View ${character.name} public record`} className="character-card-main" href={campaignEntityPath(campaignId, "characters", character.id)}>
      <VisualAsset src={character.image} label={`${character.name} portrait`} className={`character-art character-${character.color}`} />
      <div className="character-card-overlay"><div className="card-status-row"><StatusPill color="cyan">Active</StatusPill></div><div className="character-card-copy"><h3>{character.name}</h3><p>{["Level", character.level, character.species, character.className].filter(Boolean).join(" ")}</p></div></div>
    </Link>
  </article>;
}