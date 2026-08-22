import Link from "next/link";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";
import VisualAsset from "@/components/ui/VisualAsset";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import type { Character } from "@/lib/campaign/types";
import { campaignSectionPath } from "@/lib/campaign/routes";

export default function CharacterPublicRecord({
  campaignId,
  character,
}: {
  campaignId: string;
  character: Character;
}) {
  return (
    <section
      aria-labelledby="character-public-record-title"
      className="grid grid-cols-[minmax(230px,.78fr)_minmax(0,1.22fr)] items-start gap-6 mt-[22px] p-[22px] border border-[var(--line)] bg-[linear-gradient(105deg,rgba(98,232,255,.05),rgba(255,92,154,.025))] max-[760px]:grid-cols-1 max-[760px]:gap-[17px] max-[760px]:p-[17px]"
    >
      <Link
        className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]"
        href={campaignSectionPath(campaignId, "characters")}
      >
        BACK TO CHARACTERS
      </Link>
      <div className="col-span-full flex items-start justify-between gap-[15px] pb-[17px] border-b border-[var(--line)]">
        <div>
          <p className={eyebrowClassName}>PLAYER VIEW // PUBLIC RECORD</p>
          <h2
            className="m-0 mb-2 !text-[26px] max-[760px]:!text-[22px]"
            id="character-public-record-title"
          >
            {character.name}
          </h2>
          <p className="m-0 text-[var(--cyan)] font-mono text-[9px] tracking-[.06em]">
            {["Level", character.level, character.species, character.className]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>
      </div>
      <div
        data-character-public-portrait
        className="min-w-0 aspect-[3/4] overflow-hidden border border-[rgba(98,232,255,.24)] bg-[#0a1118] max-[760px]:w-[min(100%,420px)] max-[760px]:justify-self-center"
      >
        <VisualAsset
          downloadName={character.name}
          src={character.image}
          label={`${character.name} full portrait`}
          className="w-full h-full bg-contain bg-center"
        />
      </div>
      <div className="min-w-0 grid content-start gap-[18px]">
        <MarkdownPreview>
          <MarkdownPreviewToolbar>
            BACKSTORY.MD <span>PLAYER VISIBLE</span>
          </MarkdownPreviewToolbar>
          <p>
            {character.backstoryMarkdown || "No public backstory recorded yet."}
          </p>
        </MarkdownPreview>
        {character.physicalDescription ? (
          <div className="p-[15px] border border-[rgba(98,232,255,.2)] bg-[rgba(98,232,255,.035)]">
            <p className={`${eyebrowClassName} !mb-2 text-[var(--cyan)]`}>
              PHYSICAL APPEARANCE
            </p>
            <p className="m-0 text-[var(--muted)] text-[11px] leading-[1.65]">
              {character.physicalDescription}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
