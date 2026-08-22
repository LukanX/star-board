import { renderToStaticMarkup } from "react-dom/server";
import { FolderKanban, UsersRound } from "lucide-react";
import { describe, expect, it } from "vitest";
import { authPanelClassName, authShellClassName, authFormClassName, authFooterClassName } from "@/components/auth/authStyles";
import EpisodeCard from "@/components/episodes/EpisodeCard";
import MemberCard from "@/components/members/MemberCard";
import MembersRouteView from "@/components/members/MembersRouteView";
import NpcCard from "@/components/npcs/NpcCard";
import PlaceCard from "@/components/places/PlaceCard";
import CampaignToastHost from "@/components/campaign-shell/CampaignToastHost";
import AppStatus from "@/components/ui/AppStatus";
import EmptyState from "@/components/ui/EmptyState";
import { editorPanelClassName, editorSelectClassName } from "@/components/ui/editorStyles";
import MetricCard from "@/components/ui/MetricCard";
import PageLayout from "@/components/ui/PageLayout";
import RecordPortrait from "@/components/ui/RecordPortrait";
import { panelClassName } from "@/components/ui/recordStyles";
import StatusPill from "@/components/ui/StatusPill";
import VisualAsset from "@/components/ui/VisualAsset";
import MarkdownPreview, { MarkdownPreviewToolbar } from "@/components/markdown/MarkdownPreview";

describe("Editor styles", () => {
  it("keeps the editor panel and select treatments local", () => {
    expect(editorPanelClassName).toContain("border-[rgba(98,232,255,.3)]");
    expect(editorPanelClassName).toContain("bg-[rgba(98,232,255,.045)]");
    expect(editorSelectClassName).toContain("h-[42px]");
    expect(editorSelectClassName).toContain("focus:border-[var(--cyan)]");
  });
});

describe("Panel styles", () => {
  it("keeps the campaign panel treatment in shared component utilities", () => {
    expect(panelClassName).toBe("border border-[var(--line)] bg-[rgba(16,21,30,.84)]");
  });
});

describe("MetricCard", () => {
  it("renders its label, value, and detail", () => {
    const markup = renderToStaticMarkup(
      <MetricCard label="Crew roster" value="04" detail="3 players / 1 GM" icon={UsersRound} accent="cyan" />,
    );

    expect(markup).toContain("Crew roster");
    expect(markup).toContain("04");
    expect(markup).toContain("3 players / 1 GM");
  });
});

describe("EmptyState", () => {
  it("renders its icon, title, message, and action", () => {
    const markup = renderToStaticMarkup(
      <EmptyState icon={FolderKanban} title="No episodes logged yet." message="Promote an open job to begin." action={<button type="button">OPEN JOBS</button>} />,
    );

    expect(markup).toContain("No episodes logged yet.");
    expect(markup).toContain("Promote an open job to begin.");
    expect(markup).toContain("OPEN JOBS");
    expect(markup).toContain("aria-hidden=\"true\"");
  });
});

describe("EpisodeCard", () => {
  it("keeps the active episode row styling in route-owned utilities", () => {
    const markup = renderToStaticMarkup(
      <EpisodeCard
        campaignId="campaign-id"
        episode={{
          id: "episode-id",
          campaign_id: "campaign-id",
          source_job_id: null,
          place_id: null,
          created_by: "user-id",
          title: "The Relay",
          summary: "Recover the signal.",
          player_context_markdown: "The crew reaches the tower.",
          status: "active",
          started_at: null,
          completed_at: null,
          created_at: "2026-08-21T00:00:00.000Z",
          updated_at: "2026-08-21T00:00:00.000Z",
          noteCount: 2,
          accent: "cyan",
        }}
        index={0}
        places={[]}
      />,
    );

    expect(markup).toMatch(/class="[^"]*min-h-\[125px\]/);
    expect(markup).toContain("max-[760px]:items-start");
    expect(markup).toContain("gap-[15px]");
    expect(markup).toContain("px-[18px]");
    expect(markup).toContain("py-[15px]");
    expect(markup).toContain("border-b");
    expect(markup).toContain("bg-[linear-gradient(90deg,rgba(98,232,255,.08),transparent_70%)]");
    expect(markup).not.toContain("episode-row");
    expect(markup).toContain("w-[57px]");
    expect(markup).toContain("flex-[0_0_57px]");
    expect(markup).toContain("border-r");
    expect(markup).toContain("min-w-0 flex-1");
    expect(markup).not.toContain("episode-number");
    expect(markup).not.toContain("episode-info");
    expect(markup).not.toContain("episode-open");
    expect(markup).toContain("ml-auto");
    expect(markup).toContain("font-mono");
    expect(markup).toContain("cursor-pointer");
    expect(markup).not.toContain("record-title-row");
    expect(markup).not.toContain("record-meta");
  });
});

describe("MemberCard", () => {
  it("keeps member row styling in the owning component utilities", () => {
    const markup = renderToStaticMarkup(
      <MemberCard
        currentUserId="current-user-id"
        index={0}
        isGM
        member={{
          userId: "member-user-id",
          role: "player",
          displayName: "Nova",
          joinedAt: "2026-08-21T00:00:00.000Z",
        }}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toMatch(/class="[^\"]*min-h-\[69px\]/);
    expect(markup).toContain("flex items-center");
    expect(markup).toContain("gap-[15px]");
    expect(markup).toContain("px-[18px]");
    expect(markup).toContain("py-[15px]");
    expect(markup).toContain("border-b");
    expect(markup).not.toContain("member-row");
    expect(markup).toContain("min-w-0 flex-1");
    expect(markup).not.toContain("member-copy");
    expect(markup).toContain("text-[var(--ink)]");
    expect(markup).toContain("font-[560]");
    expect(markup).toContain("text-[12px]");
    expect(markup).toContain("font-mono");
    expect(markup).toContain("mt-[4px]");
    expect(markup).toContain("ml-[10px]");
    expect(markup).toContain("max-[760px]:ml-0");
    expect(markup).toContain("max-[1100px]:hidden");
    expect(markup).not.toContain("member-last");
  });

  it("keeps the current-member marker in route-owned utilities", () => {
    const markup = renderToStaticMarkup(
      <MemberCard
        currentUserId="member-user-id"
        index={0}
        isGM
        member={{
          userId: "member-user-id",
          role: "player",
          displayName: "Nova",
          joinedAt: "2026-08-21T00:00:00.000Z",
        }}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Your membership"');
    expect(markup).toContain("w-8 h-8 inline-grid place-items-center");
    expect(markup).toContain("flex-[0_0_32px]");
    expect(markup).toContain("border-[rgba(98,232,255,.25)]");
    expect(markup).toContain("text-[var(--cyan)]");
    expect(markup).toContain("bg-[rgba(98,232,255,.06)]");
    expect(markup).not.toContain("member-current");
  });
});

describe("PlaceCard", () => {
  it("keeps place tree rows in owning component utilities", () => {
    const markup = renderToStaticMarkup(
      <PlaceCard
        campaignId="campaign-id"
        expandedIds={new Set(["place-id"])}
        isGM
        node={{
          id: "place-id",
          campaign_id: "campaign-id",
          parent_place_id: null,
          name: "North Station",
          kind: "station",
          author_id: "author-id",
          description: "",
          player_notes_markdown: "",
          art_subject: null,
          art_path: null,
          art_url: null,
          art_prompt: null,
          art_provider: null,
          created_at: "2026-08-21T00:00:00.000Z",
          updated_at: "2026-08-21T00:00:00.000Z",
          gm_notes_markdown: "",
          children: [{
            id: "child-place-id",
            campaign_id: "campaign-id",
            parent_place_id: "place-id",
            name: "Dock Nine",
            kind: "dock",
            author_id: "author-id",
            description: "",
            player_notes_markdown: "",
            art_subject: null,
            art_path: null,
            art_url: null,
            art_prompt: null,
            art_provider: null,
            created_at: "2026-08-21T00:00:00.000Z",
            updated_at: "2026-08-21T00:00:00.000Z",
            gm_notes_markdown: "",
            children: [],
          }],
        }}
        onAddChild={() => undefined}
        onToggle={() => undefined}
        visiblePlaceIds={new Set(["place-id", "child-place-id"])}
      />,
    );

    expect(markup).toContain('data-place-tree-branch="true"');
    expect(markup).toContain("min-w-0");
    expect(markup).toContain('data-place-tree-row="true"');
    expect(markup).toContain("flex items-center");
    expect(markup).toContain("min-h-[44px]");
    expect(markup).toContain("border-b");
    expect(markup).toContain("border-[rgba(139,151,169,.09)]");
    expect(markup).toContain("last:border-b-0");
    expect(markup).toContain('data-place-tree-chevron="true"');
    expect(markup).toContain("w-[18px] h-[18px]");
    expect(markup).toContain("grid place-items-center");
    expect(markup).toContain("flex-[0_0_18px]");
    expect(markup).toContain("text-[var(--cyan)]");
    expect(markup).toContain('data-place-tree-select="true"');
    expect(markup).toContain("min-w-0 flex-1");
    expect(markup).toContain("gap-[7px]");
    expect(markup).toContain("min-h-[43px]");
    expect(markup).toContain("p-[0_6px]");
    expect(markup).toContain("text-left cursor-pointer");
    expect(markup).toContain("hover:bg-[rgba(255,255,255,.025)]");
    expect(markup).toContain('data-place-tree-copy="true"');
    expect(markup).toContain("grid gap-[3px]");
    expect(markup).toContain("text-[11px]");
    expect(markup).toContain("font-[550]");
    expect(markup).toContain("text-ellipsis");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain("tracking-[.08em]");
    expect(markup).toContain("uppercase");
    expect(markup).toContain("data-place-tree-add=\"true\"");
    expect(markup).toContain("flex-[0_0_30px]");
    expect(markup).toContain('data-place-tree-children="true"');
    expect(markup).toContain("ml-[18px]");
    expect(markup).toContain("border-l");
    expect(markup).toContain("border-[rgba(98,232,255,.18)]");
    expect(markup).toContain("pl-[7px]");
    expect(markup).toContain("max-[420px]:ml-[11px]");
    expect(markup).toContain("max-[420px]:pl-[5px]");
    expect(markup).not.toContain('class="place-tree-branch"');
    expect(markup).not.toContain('class="place-tree-row"');
    expect(markup).not.toContain('class="place-tree-chevron');
    expect(markup).not.toContain('class="place-tree-select');
    expect(markup).not.toContain('class="place-tree-copy');
    expect(markup).not.toContain('class="place-tree-add');
    expect(markup).not.toContain('class="place-tree-children"');
  });
});

describe("MembersRouteView", () => {
  it("keeps the member list surface in route-owned utilities", () => {
    const markup = renderToStaticMarkup(
      <MembersRouteView
        campaignId="campaign-id"
        currentUserId="current-user-id"
        displayName="Nova"
        initialMembers={[{
          userId: "member-user-id",
          role: "player",
          displayName: "Nova",
          joinedAt: "2026-08-21T00:00:00.000Z",
        }]}
        role="player"
      />,
    );

    expect(markup).toContain('data-members-list="true"');
    expect(markup).toContain("border border-[var(--line)] bg-[var(--panel)]");
    expect(markup).not.toContain("member-list");
  });

  it("keeps the member summary and clearance surface in route-owned utilities", () => {
    const markup = renderToStaticMarkup(
      <MembersRouteView
        campaignId="campaign-id"
        currentUserId="current-user-id"
        displayName="Nova"
        initialMembers={[{
          userId: "member-user-id",
          role: "player",
          displayName: "Nova",
          joinedAt: "2026-08-21T00:00:00.000Z",
        }]}
        role="player"
      />,
    );

    expect(markup).toContain('data-member-summary="true"');
    expect(markup).toContain("grid grid-cols-2 gap-6 items-start");
    expect(markup).toContain("mt-0 mb-5");
    expect(markup).toContain("max-[760px]:grid-cols-1");
    expect(markup).toContain("max-[760px]:p-[18px]");
    expect(markup).toContain('data-member-clearance="true"');
    expect(markup).toContain("flex flex-col gap-[11px] py-[6px]");
    expect(markup).toContain("inline-flex items-center gap-[7px]");
    expect(markup).not.toContain('class="member-summary"');
    expect(markup).not.toContain("clearance-key");
  });
});

describe("VisualAsset", () => {
  it("preserves asset and fallback state semantics", () => {
    const assetMarkup = renderToStaticMarkup(<VisualAsset label="Mission artwork" src="/mission.png" />);
    const fallbackMarkup = renderToStaticMarkup(<VisualAsset label="Mission artwork" src={null} />);

    expect(assetMarkup).toContain('role="img"');
    expect(assetMarkup).toContain("has-asset");
    expect(assetMarkup).toContain("/mission.png");
    expect(fallbackMarkup).not.toContain('role="img"');
    expect(fallbackMarkup).toContain("no-asset");
  });
});

describe("RecordPortrait", () => {
  it("preserves portrait and fallback semantics", () => {
    const portraitMarkup = renderToStaticMarkup(<RecordPortrait label="Relay portrait" src="/relay.png" />);
    const fallbackMarkup = renderToStaticMarkup(<RecordPortrait fallback={<span>RELAY</span>} label="Relay portrait" src={null} />);

    expect(portraitMarkup).toContain('role="img"');
    expect(portraitMarkup).toContain("/relay.png");
    expect(fallbackMarkup).not.toContain('role="img"');
    expect(fallbackMarkup).toContain("RELAY");
  });
});

describe("CampaignToastHost", () => {
  it("keeps the toast surface in component-owned utilities", () => {
    const markup = renderToStaticMarkup(
      <CampaignToastHost message="Saved." onDismiss={() => undefined} />,
    );

    expect(markup).toContain("fixed right-[25px] bottom-6");
    expect(markup).toContain("grid h-[31px] w-[31px]");
    expect(markup).not.toContain('class="toast"');
    expect(markup).not.toContain("toast-icon");
  });
});

describe("NpcCard", () => {
  it("keeps NPC portrait variants in component-owned utilities", () => {
    const markup = renderToStaticMarkup(
      <NpcCard
        campaignId="campaign-id"
        npc={{
          id: "npc-id",
          author_id: "author-id",
          name: "Relay Keeper",
          species: "Android",
          role: "CONTACT",
          description: "Keeps the signal alive.",
          player_notes_markdown: "",
          place_id: null,
          art_subject: null,
          art_path: null,
          art_url: null,
          art_prompt: null,
          art_provider: null,
          color: "pink",
        }}
      />,
    );

    expect(markup).toContain("grid h-[62px] w-[62px]");
    expect(markup).toContain("text-[var(--pink)]");
    expect(markup).toContain("min-h-[86px]");
    expect(markup).toContain("last:border-b-0");
    expect(markup).toContain("[&amp;&gt;h3]:m-0");
    expect(markup).toContain("[&amp;&gt;span]:inline-flex");
    expect(markup).not.toContain("record-row");
    expect(markup).not.toContain("record-main");
    expect(markup).not.toContain("record-title-row");
    expect(markup).not.toContain("record-meta");
    expect(markup).not.toContain("record-visibility");
    expect(markup).not.toContain("record-icon");
    expect(markup).not.toContain("record-portrait");
  });
});

describe("PageLayout", () => {
  it("keeps the page introduction layout contract", () => {
    const markup = renderToStaticMarkup(
      <PageLayout action="ADD RECORD" description="A short archive description." eyebrow="ARCHIVE" onAction={() => undefined} title="Records">
        <div>Record content</div>
      </PageLayout>,
    );

    expect(markup).toMatch(/class="[^\"]*\bpage-intro\b[^\"]*\bflex\b[^\"]*"/);
    expect(markup).toContain("Records");
    expect(markup).toContain("ADD RECORD");
    expect(markup).toContain("Record content");
  });
});

describe("AppStatus", () => {
  it("renders the status message and action inside the status surface", () => {
    const markup = renderToStaticMarkup(<AppStatus action={<button type="button">RETRY</button>} message="Checking campaign access." title="Loading campaign signal." />);

    expect(markup).toMatch(/class="[^\"]*\bapp-status-shell\b[^\"]*\bgrid\b[^\"]*"/);
    expect(markup).toContain("Loading campaign signal.");
    expect(markup).toContain("Checking campaign access.");
    expect(markup).toContain("RETRY");
  });
});

describe("StatusPill", () => {
  it("keeps the default cyan status treatment in the component", () => {
    const markup = renderToStaticMarkup(<StatusPill>OPEN</StatusPill>);

    expect(markup).toContain("bg-[rgba(98,232,255,.08)]");
    expect(markup).toContain("text-[var(--cyan)]");
    expect(markup).toContain("OPEN");
  });

  it("keeps non-default status variants in component-owned utilities", () => {
    const markup = renderToStaticMarkup(<StatusPill color="muted">ARCHIVED</StatusPill>);

    expect(markup).toContain("border-[rgba(124,135,150,.35)]");
    expect(markup).toContain("bg-[rgba(124,135,150,.07)]");
    expect(markup).toContain("text-[#7c8796]");
    expect(markup).not.toContain("status-muted");
  });
});

describe("MarkdownPreview", () => {
  it("keeps preview and toolbar styling in the shared component", () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview className="md:col-span-2">
        <MarkdownPreviewToolbar>
          PLAYER NOTES <span>PLAYER VISIBLE</span>
        </MarkdownPreviewToolbar>
        <p>Signal remains stable.</p>
      </MarkdownPreview>,
    );

    expect(markup).toContain("border border-[rgba(98,232,255,.25)]");
    expect(markup).toContain("bg-[#0a1118]");
    expect(markup).toContain("md:col-span-2");
    expect(markup).toContain("border-b border-[var(--line)]");
    expect(markup).toContain("[&amp;&gt;span]:ml-auto");
    expect(markup).not.toContain("markdown-preview");
    expect(markup).not.toContain("preview-toolbar");
  });
});

describe("Auth styles", () => {
  it("keeps the shared auth shell, panel, form, and footer treatments local", () => {
    expect(authShellClassName).toContain("before:bg-[linear-gradient");
    expect(authPanelClassName).toContain("before:border-l");
    expect(authFormClassName).toContain("[&_input]:h-[44px]");
    expect(authFooterClassName).toContain("max-[520px]:flex-col");
  });
});