import Link from "next/link";
import VisualAsset from "@/components/ui/VisualAsset";
import StatusPill from "@/components/ui/StatusPill";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { Character } from "@/lib/campaign/types";

export default function CharacterCard({ campaignId, character }: { campaignId: string; character: Character }) {
  return <article data-character-card="true" className="relative cursor-pointer overflow-hidden rounded-[8px] border border-[var(--line)] bg-[#0f1620] shadow-[0_12px_26px_rgba(0,0,0,.18)] transition-[transform,border-color,box-shadow] duration-[200ms] ease-[ease] hover:-translate-y-0.5 hover:border-[rgba(98,232,255,.5)] hover:shadow-[0_16px_30px_rgba(0,0,0,.28),0_0_20px_rgba(98,232,255,.08)]">
    <Link aria-label={`View ${character.name} public record`} data-character-card-main="true" className="relative block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit [font:inherit] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-[-2px]" href={campaignEntityPath(campaignId, "characters", character.id)}>
      <VisualAsset src={character.image} label={`${character.name} portrait`} className="relative h-auto aspect-[4/5] border-b border-[rgba(139,151,169,.2)] bg-[#0a1118] bg-contain bg-center after:absolute after:inset-0 after:block after:content-[''] after:bg-[linear-gradient(180deg,rgba(7,10,16,.18)_0%,transparent_31%,rgba(7,10,16,.12)_52%,rgba(7,10,16,.94)_100%)]" />
      <div data-character-overlay="true" className="pointer-events-none absolute inset-0 z-[1] flex flex-col justify-between p-[15px]"><div className="flex items-center justify-start"><StatusPill color="cyan">Active</StatusPill></div><div data-character-copy="true" className="mt-auto"><h3 className="m-0 mb-[6px] text-[18px] text-[var(--ink)]">{character.name}</h3><p className="m-0 font-mono text-[9px] leading-[1.5] text-[#c4cfdb]">{["Level", character.level, character.species, character.className].filter(Boolean).join(" ")}</p></div></div>
    </Link>
  </article>;
}