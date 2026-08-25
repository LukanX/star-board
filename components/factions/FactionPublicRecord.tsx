import type { ReactNode } from "react";
import type { FactionRelatedRecords } from "@/lib/campaign/detail-types";
import { Map } from "lucide-react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import { FactionEmblem } from "@/components/factions/FactionCard";
import ArtDownloadButton from "@/components/ui/ArtDownloadButton";
import ArchiveRecordShell from "@/components/ui/ArchiveRecordShell";
import ArchiveRelatedList from "@/components/ui/ArchiveRelatedList";
import { archiveDetailArtworkClassName, recordDetailMetaClassName, recordMetaClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { getAttachedArtUrl } from "@/lib/campaign/mappers";
import { campaignEntityPath, campaignSectionPath } from "@/lib/campaign/routes";
import { getPlaceBreadcrumb } from "@/lib/places";
import type { ApiPlace, FactionRecord } from "@/lib/campaign/types";

const emptyFactionRelatedRecords: FactionRelatedRecords = { place: null, jobs: [] };

export default function FactionPublicRecord({ campaignId, faction, places, related, actions }: { campaignId: string; faction: FactionRecord; places: ApiPlace[]; related?: FactionRelatedRecords; actions?: ReactNode }) {
  const artUrl = getAttachedArtUrl(faction.art_url, faction.art_path);
  const relatedRecords = related ?? emptyFactionRelatedRecords;
  const primaryPlace = faction.place_id
    ? places.find((place) => place.id === faction.place_id) ?? (relatedRecords.place?.id === faction.place_id ? relatedRecords.place : null)
    : null;
  const placeLabel = getPlaceBreadcrumb(places, faction.place_id) || primaryPlace?.name || "No primary place";

  return <ArchiveRecordShell
    backHref={campaignSectionPath(campaignId, "factions")}
    backLabel="BACK TO FACTIONS"
    eyebrow="PUBLIC FACTION FILE"
    title={faction.name}
    titleId="faction-public-record-title"
    actions={actions}
    metadata={<div className="grid gap-2"><p className={recordDetailMetaClassName}>{faction.status.toUpperCase()}</p>{primaryPlace ? <CampaignRouteLink data-faction-breadcrumb="true" className={`${recordMetaClassName} w-fit text-[var(--cyan)] hover:text-[var(--ink)]`} href={campaignEntityPath(campaignId, "places", primaryPlace.id)}><Map size={13} /> {placeLabel}</CampaignRouteLink> : <span data-faction-breadcrumb="true" className={recordMetaClassName}><Map size={13} /> {placeLabel}</span>}</div>}
    artwork={<div data-faction-public-top="true" data-faction-detail-preview="true" className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-[18px] max-[760px]:grid-cols-1"><div data-faction-detail-art="true" className={archiveDetailArtworkClassName}><FactionEmblem faction={faction} iconSize={72} size="fill" />{artUrl ? <ArtDownloadButton name={faction.name} src={artUrl} /> : null}</div><div data-faction-detail-copy="true" className="min-w-0 grid content-center gap-3"><div data-faction-public-brief="true" className="grid gap-[8px]"><p className={eyebrowClassName}>PUBLIC BRIEF</p><p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65] [overflow-wrap:anywhere]">{faction.description || "No public description recorded yet."}</p></div></div></div>}
    body={null}
    related={<ArchiveRelatedList eyebrow="CAMPAIGN THREADS" title="Giver jobs" emptyMessage="No jobs are assigned to this faction." items={relatedRecords.jobs.map((job) => ({ id: job.id, href: campaignEntityPath(campaignId, "jobs", job.id), label: job.title, meta: job.status.toUpperCase() }))} />}
    className="faction-public-record"
  />;
}