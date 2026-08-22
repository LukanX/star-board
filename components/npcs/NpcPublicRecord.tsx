import Link from "next/link";
import { BookOpen, Map, UserRound } from "lucide-react";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { recordDetailClassName, recordDetailMetaClassName, recordMetaClassName } from "@/components/ui/recordStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, NpcRecord } from "@/lib/campaign/types";

export default function NpcPublicRecord({
  campaignId,
  npc,
  places,
}: {
  campaignId: string;
  npc: NpcRecord;
  places: ApiPlace[];
}) {
  return (
    <section
      aria-labelledby="npc-public-record-title"
      className={`${recordDetailClassName} npc-record-detail`}
    >
      <Link
        className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
        href={campaignSectionPath(campaignId, "npcs")}
      >
        BACK TO NPCS
      </Link>
      <div
        data-npc-detail-preview="true"
        className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-[18px] max-[760px]:grid-cols-1"
      >
        <div
          data-npc-detail-portrait="true"
          className="min-w-[180px] max-w-[260px] h-full aspect-square overflow-hidden border border-[rgba(98,232,255,.28)] bg-[#0a1118] max-[760px]:w-[min(100%,220px)] max-[760px]:min-w-0 max-[760px]:h-auto max-[760px]:justify-self-start"
        >
          <RecordPortrait
            src={getAttachedArtUrl(npc.art_url, npc.art_path)}
            label={`${npc.name} portrait`}
            className="w-full h-full"
            fallback={<UserRound size={19} />}
          />
        </div>
        <div data-npc-detail-copy="true" className="min-w-0 grid gap-3">
          <div>
            <p className="eyebrow">PUBLIC CONTACT FILE</p>
            <h2 id="npc-public-record-title">{npc.name}</h2>
            <p className={recordDetailMetaClassName}>
              {npc.species || "Unclassified"}
              {" // "}
              {npc.role || "Contact"}
            </p>
          </div>
          <p>{npc.description || "No public description recorded yet."}</p>
          <span className={recordMetaClassName}>
            <Map size={13} />{" "}
            {getPlaceBreadcrumb(places, npc.place_id) || "No primary place"}
          </span>
        </div>
        <MarkdownPreview
          data-npc-detail-notes="true"
          className="col-span-2 max-[760px]:col-span-1"
        >
          <MarkdownPreviewToolbar>
            <BookOpen size={14} /> PLAYER NOTES
          </MarkdownPreviewToolbar>
          <p>{npc.player_notes_markdown || "No player notes recorded yet."}</p>
        </MarkdownPreview>
      </div>
    </section>
  );
}
