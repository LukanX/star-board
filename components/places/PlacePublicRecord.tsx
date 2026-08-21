import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, FileText, LockKeyhole, Map } from "lucide-react";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiPlace } from "@/lib/campaign/types";
import { getPlaceBreadcrumb } from "@/lib/places";
import { PlaceArt } from "@/components/places/PlaceCard";

export default function PlacePublicRecord({ campaignId, place, places, isGM, actions }: { campaignId: string; place: ApiPlace; places: ApiPlace[]; isGM: boolean; actions?: ReactNode }) {
  return <section aria-labelledby="place-public-record-title" className="panel place-detail-panel"><div className="place-detail"><Link className="button button-secondary" href={campaignSectionPath(campaignId, "places")}><ArrowLeft size={14} /> BACK TO PLACES</Link><div className="place-detail-heading"><div><p className="eyebrow">{place.kind.toUpperCase()} RECORD</p><h2 id="place-public-record-title">{place.name}</h2><p className="place-breadcrumb"><Map size={13} /> {getPlaceBreadcrumb(places, place.id)}</p></div>{actions ? <div className="record-row-actions">{actions}</div> : null}</div><PlaceArt place={place} className="place-detail-art" /><div className="place-detail-body"><div><p className="eyebrow">PUBLIC BRIEF</p><p>{place.description || "No public description recorded yet."}</p></div><div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> PLAYER NOTES <span>PLAYER VISIBLE</span></div><p>{place.player_notes_markdown || "No player notes recorded yet."}</p></div>{isGM ? <div className="markdown-preview place-private-preview"><div className="preview-toolbar"><LockKeyhole size={14} /> GM NOTES <span>PRIVATE</span></div><p>{place.gm_notes_markdown || "No private notes recorded yet."}</p></div> : null}</div></div></section>;
}