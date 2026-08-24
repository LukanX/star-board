import { ArrowUpRight, LockKeyhole, Skull } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { archivePreviewArtworkClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath } from "@/lib/campaign/routes";
import type { ApiEnemy } from "@/lib/campaign/types";

export default function EnemyPreview({ campaignId, enemy, isGM }: { campaignId: string; enemy: ApiEnemy; isGM: boolean }) {
  const artUrl = getAttachedArtUrl(enemy.art_url, enemy.art_path);
  return <div data-enemy-preview="true" className="grid gap-[17px]">
    <div data-archive-preview-heading="true" tabIndex={-1} className="min-w-0 outline-0">
      <p className={eyebrowClassName}>{isGM ? "GM CREATURE PREVIEW" : "REVEALED CREATURE PREVIEW"}</p>
      <h2 className="m-0 text-[22px] [overflow-wrap:anywhere]">{enemy.name}</h2>
      {isGM ? <p className="mt-[8px] m-0 text-[var(--pink)] font-mono text-[8px] tracking-[.1em]">LEVEL {enemy.level ?? "?"}{" // "}{(enemy.size ?? "unknown").toUpperCase()}{" // "}{(enemy.rarity ?? "unknown").toUpperCase()}</p> : null}
    </div>
    <div data-enemy-preview-art="true" className={`${archivePreviewArtworkClassName} border border-[rgba(255,92,154,.35)] bg-[rgba(255,92,154,.08)] text-[var(--pink)]`}>
      <RecordPortrait src={artUrl} label={`${enemy.name} artwork`} className="grid w-full h-full place-items-center" fallback={<Skull size={24} />} />
      {artUrl ? <span className="sr-only">Artwork attached</span> : null}
    </div>
    {isGM ? <div className="flex flex-wrap gap-[6px]">{(enemy.traits ?? []).map((trait) => <span className="border border-[rgba(255,92,154,.28)] px-[7px] py-[4px] text-[var(--pink)] font-mono text-[8px] tracking-[.08em]" key={trait}>{trait}</span>)}</div> : null}
    <div className="grid gap-[14px]">
      <div className="grid gap-[7px]"><p className={`${eyebrowClassName} !mb-0`}>PLAYER-SAFE BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{enemy.player_description || "No revealed description recorded yet."}</p></div>
      {isGM ? <p className="m-0 flex items-center gap-[6px] text-[var(--pink)] font-mono text-[8px] tracking-[.07em]"><LockKeyhole size={13} /> MECHANICS ARE GM-ONLY</p> : null}
      <CampaignRouteLink className="h-[37px] inline-flex w-fit items-center justify-center gap-2 border border-[var(--line)] bg-[rgba(255,92,154,.08)] px-[14px] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] hover:border-[var(--pink)] hover:bg-[rgba(255,92,154,.14)]" href={campaignEntityPath(campaignId, "enemies", enemy.id)}><ArrowUpRight aria-hidden="true" size={14} /> OPEN FULL RECORD</CampaignRouteLink>
    </div>
  </div>;
}
