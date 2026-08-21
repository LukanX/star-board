import Link from "next/link";
import VisualAsset from "@/components/ui/VisualAsset";
import type { Character } from "@/lib/campaign/types";
import { campaignSectionPath } from "@/lib/campaign/routes";

export default function CharacterPublicRecord({ campaignId, character }: { campaignId: string; character: Character }) {
  return <section aria-labelledby="character-public-record-title" className="character-public-record">
    <Link className="button button-secondary" href={campaignSectionPath(campaignId, "characters")}>BACK TO CHARACTERS</Link>
    <div className="character-public-heading"><div><p className="eyebrow">PLAYER VIEW // PUBLIC RECORD</p><h2 id="character-public-record-title">{character.name}</h2><p className="character-public-meta">{["Level", character.level, character.species, character.className].filter(Boolean).join(" ")}</p></div></div>
    <div className="character-public-portrait-frame"><VisualAsset src={character.image} label={`${character.name} full portrait`} className="character-public-portrait" /></div>
    <div className="character-public-copy"><div className="markdown-preview"><div className="preview-toolbar">BACKSTORY.MD <span>PLAYER VISIBLE</span></div><p>{character.backstoryMarkdown || "No public backstory recorded yet."}</p></div>{character.physicalDescription ? <div className="character-public-detail"><p className="eyebrow">PHYSICAL APPEARANCE</p><p>{character.physicalDescription}</p></div> : null}</div>
  </section>;
}