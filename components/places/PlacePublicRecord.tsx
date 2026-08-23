import type { ReactNode } from "react";
import { FileText, LockKeyhole, Map } from "lucide-react";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import ArtDownloadButton from "@/components/ui/ArtDownloadButton";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";
import { recordRowActionsClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath, campaignSectionPath } from "@/lib/campaign/routes";
import type { PlaceRelatedRecords, RelatedPlaceSummary } from "@/lib/campaign/detail-types";
import type { ApiPlace } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";
import { PlaceArt } from "@/components/places/PlaceCard";

const emptyPlaceRelatedRecords: PlaceRelatedRecords = {
  parent: null,
  children: [],
  npcs: [],
  factions: [],
  jobs: [],
  episodes: [],
};

function toPlaceSummary(place: Pick<ApiPlace, "id" | "name" | "kind">): RelatedPlaceSummary {
  return { id: place.id, name: place.name, kind: place.kind };
}

export default function PlacePublicRecord({
  campaignId,
  place,
  places,
  isGM,
  actions,
  related,
}: {
  campaignId: string;
  place: ApiPlace;
  places: ApiPlace[];
  isGM: boolean;
  actions?: ReactNode;
  related?: PlaceRelatedRecords;
}) {
  const artUrl = getAttachedArtUrl(place.art_url, place.art_path);
  const relatedRecords = related ?? emptyPlaceRelatedRecords;
  const parent = place.parent_place_id
    ? places.find((candidate) => candidate.id === place.parent_place_id) ?? relatedRecords.parent
    : null;
  const children = places.length
    ? places.filter((candidate) => candidate.parent_place_id === place.id).map(toPlaceSummary)
    : relatedRecords.children;
  const placeBreadcrumb = getPlaceBreadcrumb(places, place.id);

  return (
    <ArchiveRecordShell
      backHref={campaignSectionPath(campaignId, "places")}
      backLabel="BACK TO PLACES"
      eyebrow={`${place.kind.toUpperCase()} RECORD`}
      title={place.name}
      titleId="place-public-record-title"
      metadata={
        <p
          data-place-breadcrumb="true"
          className="flex items-center gap-[6px] m-0 text-[var(--cyan)] font-mono text-[8px] tracking-[.07em] leading-[1.5] flex-wrap [overflow-wrap:anywhere] max-[420px]:items-start"
        >
          <Map
            className="max-[420px]:mt-[2px] max-[420px]:flex-[0_0_auto]"
            size={13}
          />{" "}
          {placeBreadcrumb}
        </p>
      }
      actions={
        actions ? (
          <div data-place-detail-actions="true" className={`${recordRowActionsClassName} max-[420px]:gap-0`}>
            {actions}
          </div>
        ) : null
      }
      artwork={
        <div className="relative">
          <PlaceArt place={place} variant="detail" />
          {artUrl ? <ArtDownloadButton name={place.name} src={artUrl} /> : null}
        </div>
      }
      body={
        <>
          <div data-place-public-brief="true" className="grid gap-[8px]">
            <p className={eyebrowClassName}>PUBLIC BRIEF</p>
            <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">
              {place.description || "No public description recorded yet."}
            </p>
          </div>
          <MarkdownPreview data-place-public-preview="true">
            <MarkdownPreviewToolbar data-place-public-toolbar="true">
              <FileText size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span>
            </MarkdownPreviewToolbar>
            <p>
              {place.player_notes_markdown || "No player notes recorded yet."}
            </p>
          </MarkdownPreview>
          {isGM ? (
            <MarkdownPreview
              data-place-private-preview="true"
              className="border-[rgba(255,92,154,.25)]"
            >
              <MarkdownPreviewToolbar className="text-[var(--pink)]">
                <LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span>
              </MarkdownPreviewToolbar>
              <p>
                {place.gm_notes_markdown || "No private notes recorded yet."}
              </p>
            </MarkdownPreview>
          ) : null}
        </>
      }
      related={
        <div className="grid gap-4 md:grid-cols-2">
          <ArchiveRelatedList
            eyebrow="LOCATION HIERARCHY"
            title="Parent place"
            emptyMessage="No parent place assigned."
            items={parent ? [{ id: parent.id, href: campaignEntityPath(campaignId, "places", parent.id), label: parent.name, meta: parent.kind.toUpperCase() }] : []}
          />
          <ArchiveRelatedList
            eyebrow="LOCATION HIERARCHY"
            title="Child places"
            emptyMessage="No child places assigned."
            items={children.map((child) => ({ id: child.id, href: campaignEntityPath(campaignId, "places", child.id), label: child.name, meta: child.kind.toUpperCase() }))}
          />
          <ArchiveRelatedList
            eyebrow="ASSOCIATED CONTACTS"
            title="NPCs"
            emptyMessage="No NPCs are assigned to this place."
            items={relatedRecords.npcs.map((npc) => ({ id: npc.id, href: campaignEntityPath(campaignId, "npcs", npc.id), label: npc.name, meta: [npc.species, npc.role].filter(Boolean).join(" // ") }))}
          />
          <ArchiveRelatedList
            eyebrow="ASSOCIATED CONTACTS"
            title="Factions"
            emptyMessage="No factions are assigned to this place."
            items={relatedRecords.factions.map((faction) => ({ id: faction.id, href: campaignEntityPath(campaignId, "factions", faction.id), label: faction.name, meta: faction.status.toUpperCase() }))}
          />
          <ArchiveRelatedList
            eyebrow="CAMPAIGN THREADS"
            title="Jobs"
            emptyMessage="No jobs are assigned to this place."
            items={relatedRecords.jobs.map((job) => ({ id: job.id, href: campaignEntityPath(campaignId, "jobs", job.id), label: job.title, meta: job.status.toUpperCase() }))}
          />
          <ArchiveRelatedList
            eyebrow="CAMPAIGN THREADS"
            title="Episodes"
            emptyMessage="No episodes are assigned to this place."
            items={relatedRecords.episodes.map((episode) => ({ id: episode.id, href: campaignEntityPath(campaignId, "episodes", episode.id), label: episode.title, meta: episode.status.toUpperCase() }))}
          />
        </div>
      }
      panelDataAttribute="data-place-detail-panel"
      contentDataAttribute="data-place-detail"
      headingDataAttribute="data-place-detail-heading"
      bodyDataAttribute="data-place-detail-body"
      className="place-record-detail max-[760px]:order-[-1]"
    />
  );
}
