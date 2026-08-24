import type { ReactNode } from "react";
import { BookOpen, LockKeyhole, Skull } from "lucide-react";
import ArtDownloadButton from "@/components/ui/ArtDownloadButton";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { archiveDetailArtworkClassName, recordDetailMetaClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiEnemy } from "@/lib/campaign/types";
import EnemyStatBlock from "@/components/enemies/EnemyStatBlock";

export default function EnemyPublicRecord({ campaignId, enemy, isGM, actions }: { campaignId: string; enemy: ApiEnemy; isGM: boolean; actions?: ReactNode }) {
  const artUrl = getAttachedArtUrl(enemy.art_url, enemy.art_path);
  const source = enemy.source_snapshot;
  const sourceTitle = source && typeof source.sourceTitle === "string" ? source.sourceTitle : null;
  const sourcePage = source && typeof source.sourcePage === "string" ? source.sourcePage : null;
  return <ArchiveRecordShell
    backHref={campaignSectionPath(campaignId, "enemies")}
    backLabel="BACK TO ENEMIES"
    eyebrow={isGM ? "GM CREATURE RECORD" : "REVEALED CREATURE RECORD"}
    title={enemy.name}
    titleId="enemy-public-record-title"
    actions={actions}
    metadata={<div className="grid gap-2"><p className={recordDetailMetaClassName}>{isGM && enemy.level !== undefined ? `LEVEL ${enemy.level} // ${(enemy.size ?? "unknown").toUpperCase()} // ${(enemy.rarity ?? "unknown").toUpperCase()}` : "REVEALED THREAT PROFILE"}</p>{isGM && enemy.traits?.length ? <p className="m-0 text-[var(--pink)] font-mono text-[8px] tracking-[.1em] [overflow-wrap:anywhere]">{enemy.traits.join(" // ")}</p> : null}</div>}
    artwork={<div data-enemy-detail-preview="true" className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-[18px] max-[760px]:grid-cols-1"><div data-enemy-detail-portrait="true" className={`${archiveDetailArtworkClassName} border border-[rgba(255,92,154,.3)] bg-[#0a1118]`}><RecordPortrait src={artUrl} label={`${enemy.name} artwork`} className="w-full h-full" fallback={<Skull size={24} />} />{artUrl ? <ArtDownloadButton name={enemy.name} src={artUrl} /> : null}</div><div className="min-w-0 grid content-center gap-3"><div className="grid gap-[8px]"><p className={`${eyebrowClassName} !mb-0`}>PLAYER-SAFE BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{enemy.player_description || "No player-safe description recorded yet."}</p></div>{isGM ? <p className="m-0 flex items-center gap-1 text-[var(--pink)] font-mono text-[8px] tracking-[.08em]"><LockKeyhole size={12} /> MECHANICS AND GM CONTEXT PRIVATE</p> : null}</div></div>}
    body={<><MarkdownPreview data-enemy-player-notes="true"><MarkdownPreviewToolbar><BookOpen size={14} /> PLAYER BRIEF <span>PLAYER VISIBLE</span></MarkdownPreviewToolbar><p>{enemy.player_description || "No player brief recorded yet."}</p></MarkdownPreview>{isGM ? <><EnemyStatBlock statBlock={enemy.stat_block} /> <MarkdownPreview data-enemy-gm-notes="true" className="border-[rgba(255,92,154,.25)]"><MarkdownPreviewToolbar className="text-[var(--pink)]"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></MarkdownPreviewToolbar><p>{enemy.gm_notes_markdown || "No private notes recorded yet."}</p></MarkdownPreview>{sourceTitle ? <div className="grid gap-1 border border-[rgba(245,184,75,.25)] p-[10px] text-[var(--dim)] font-mono text-[8px] tracking-[.08em]">SOURCE PROVENANCE // {sourceTitle}{sourcePage ? ` // PAGE ${sourcePage}` : ""}<span className="text-[var(--muted)]">{enemy.source_provider === "aon" ? "Archives of Nethys import" : "Manual record"}</span></div> : null}</> : null}</>}
    className="enemy-record-detail"
  />;
}
