import type { NpcRelatedRecords } from "@/lib/campaign/detail-types";
import { BookOpen, LockKeyhole, Map, UserRound } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import ArtDownloadButton from "@/components/ui/ArtDownloadButton";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { archiveDetailArtworkClassName, recordDetailMetaClassName, recordMetaClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath, campaignSectionPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, NpcRecord } from "@/lib/campaign/types";

const emptyNpcRelatedRecords: NpcRelatedRecords = { place: null, jobs: [] };

export default function NpcPublicRecord({
  campaignId,
  npc,
  places,
  isGM = false,
  related,
}: {
  campaignId: string;
  npc: NpcRecord;
  places: ApiPlace[];
  isGM?: boolean;
  related?: NpcRelatedRecords;
}) {
  const artUrl = getAttachedArtUrl(npc.art_url, npc.art_path);
  const relatedRecords = related ?? emptyNpcRelatedRecords;
  const primaryPlace = npc.place_id
    ? places.find((place) => place.id === npc.place_id) ?? (relatedRecords.place?.id === npc.place_id ? relatedRecords.place : null)
    : null;
  const placeLabel = getPlaceBreadcrumb(places, npc.place_id) || primaryPlace?.name || "No primary place";

  return (
    <ArchiveRecordShell
      backHref={campaignSectionPath(campaignId, "npcs")}
      backLabel="BACK TO NPCS"
      eyebrow="PUBLIC CONTACT FILE"
      title={npc.name}
      titleId="npc-public-record-title"
      metadata={
        <div className="grid gap-2">
          <p className={recordDetailMetaClassName}>
            {npc.species || "Unclassified"}
            {" // "}
            {npc.role || "Contact"}
          </p>
          {primaryPlace ? (
            <CampaignRouteLink
              data-npc-breadcrumb="true"
              className={`${recordMetaClassName} w-fit text-[var(--cyan)] hover:text-[var(--ink)]`}
              href={campaignEntityPath(campaignId, "places", primaryPlace.id)}
            >
              <Map size={13} /> {placeLabel}
            </CampaignRouteLink>
          ) : (
            <span data-npc-breadcrumb="true" className={recordMetaClassName}>
              <Map size={13} /> {placeLabel}
            </span>
          )}
        </div>
      }
      artwork={
        <div
          data-npc-detail-preview="true"
          className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-[18px] max-[760px]:grid-cols-1"
        >
          <div
            data-npc-detail-portrait="true"
            className={`${archiveDetailArtworkClassName} border border-[rgba(98,232,255,.28)] bg-[#0a1118]`}
          >
            <RecordPortrait
              src={artUrl}
              label={`${npc.name} portrait`}
              className="w-full h-full"
              fallback={<UserRound size={19} />}
            />
            {artUrl ? <ArtDownloadButton name={npc.name} src={artUrl} /> : null}
          </div>
          <div data-npc-detail-copy="true" className="min-w-0 grid gap-3">
            <div data-npc-public-brief="true" className="grid gap-[8px]">
              <p className={eyebrowClassName}>PUBLIC BRIEF</p>
              <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">
                {npc.description || "No public description recorded yet."}
              </p>
            </div>
          </div>
        </div>
      }
      body={
        <>
          <MarkdownPreview
            data-npc-detail-notes="true"
            className="col-span-2 max-[760px]:col-span-1"
          >
            <MarkdownPreviewToolbar>
              <BookOpen size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span>
            </MarkdownPreviewToolbar>
            <p>{npc.player_notes_markdown || "No player notes recorded yet."}</p>
          </MarkdownPreview>
          {isGM ? (
            <MarkdownPreview
              data-npc-detail-gm-notes="true"
              className="col-span-2 border-[rgba(255,92,154,.25)] max-[760px]:col-span-1"
            >
              <MarkdownPreviewToolbar className="text-[var(--pink)]">
                <LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span>
              </MarkdownPreviewToolbar>
              <p>{npc.gm_notes_markdown || "No private notes recorded yet."}</p>
            </MarkdownPreview>
          ) : null}
        </>
      }
      related={
        <ArchiveRelatedList
          eyebrow="CAMPAIGN THREADS"
          title="Giver jobs"
          emptyMessage="No jobs are assigned to this contact."
          items={relatedRecords.jobs.map((job) => ({
            id: job.id,
            href: campaignEntityPath(campaignId, "jobs", job.id),
            label: job.title,
            meta: job.status.toUpperCase(),
          }))}
        />
      }
      className="npc-record-detail"
    />
  );
}
