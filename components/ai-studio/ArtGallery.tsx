import Link from "next/link";
import PageLayout from "@/components/ui/PageLayout";
import VisualAsset from "@/components/ui/VisualAsset";
import type { PublishedArt } from "@/lib/campaign/studio-server";
import { studioButton, studioPanel } from "./studioStyles";

export default function ArtGallery({ campaignId, art, page = 0, detail = false }: { campaignId: string; art: PublishedArt[]; page?: number; detail?: boolean }) {
  const root = `/campaigns/${campaignId}/art`;
  return <PageLayout eyebrow="CAMPAIGN ARCHIVE" title="Art gallery" description="Artwork shared by your GM. Image links expire within ten minutes; reload this page to renew previews and downloads.">
    {!art.length && <div className={studioPanel}>No artwork has been shared with the campaign yet.</div>}
    <div className={`grid min-w-0 gap-5 ${detail ? "" : "lg:grid-cols-2"}`}>{art.map((image) => <article key={image.id} className={`${studioPanel} space-y-3`}>
      <h2 className="break-words text-lg">{image.title}</h2>
      <VisualAsset src={image.signedUrl} label={image.title} downloadName={image.title} className="aspect-square max-h-[800px] w-full bg-contain" />
      {image.caption && <p className="whitespace-pre-wrap break-words text-sm text-[var(--muted)]">{image.caption}</p>}
      <Link className={studioButton} href={detail ? root : `${root}/${image.id}`}>{detail ? "Back to gallery" : "Open artwork"}</Link>
    </article>)}</div>
    {!detail && <div className="mt-4 flex flex-wrap gap-3">
      {page > 0 && <Link className={studioButton} href={`${root}?page=${page - 1}`}>Previous artwork</Link>}
      {art.length === 24 && <Link className={studioButton} href={`${root}?page=${page + 1}`}>Next artwork</Link>}
    </div>}
  </PageLayout>;
}
