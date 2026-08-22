"use client";

import { useState } from "react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import CampaignToastHost from "@/components/campaign-shell/CampaignToastHost";
import JobCard from "@/components/jobs/JobCard";
import EmptyState from "@/components/ui/EmptyState";
import MetricCard from "@/components/ui/MetricCard";
import SectionHeading from "@/components/ui/SectionHeading";
import { panelClassName } from "@/components/ui/recordStyles";
import {
  accentIconCyanClassName,
  eyebrowBrightClassName,
  eyebrowClassName,
  liveDotBrightClassName,
  microLabelClassName,
} from "@/components/ui/terminalStyles";
import {
  mapApiCharacter,
  mapApiEpisode,
  mapApiFaction,
  mapApiJob,
  mapApiNpc,
  mapApiNote,
} from "@/lib/campaign/mappers";
import {
  campaignPath,
  campaignSectionPath,
  loginPath,
} from "@/lib/campaign/routes";
import type { CampaignOverviewResult } from "@/lib/campaign/server";
import type {
  ApiCampaignMember,
  ApiJob,
  ApiPlace,
  CampaignNote,
  CampaignRecord,
  Character,
  EpisodeRecord,
  FactionRecord,
  Mission,
  NpcRecord,
} from "@/lib/campaign/types";
import { getRollingSevenDaysStart } from "@/lib/time";
import {
  Activity,
  ArrowUpRight,
  Bot,
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  Map,
  Network,
  Plus,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";

async function fetchCampaignJobs(campaignId: string) {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/jobs`,
  );

  if (response.status === 401) {
    window.location.href = loginPath(campaignPath(campaignId));
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as {
    error?: string;
    role?: "gm" | "player";
    displayName?: string;
    jobs?: ApiJob[];
  };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign jobs.");
  }

  return {
    role: result.role ?? "player",
    displayName: result.displayName ?? "Crew member",
    jobs: result.jobs ?? [],
  };
}

type OverviewMetrics = {
  openJobs: number;
  activeVotes: number;
  episodes: number;
  members: number;
  players: number;
  gms: number;
  notes: number;
  notesThisWeek: number;
  draftSignals: number;
  latestEpisodeTitle: string | null;
};

function getOverviewMetrics(
  missions: Mission[],
  members: ApiCampaignMember[],
  notes: CampaignNote[],
  episodes: EpisodeRecord[],
): OverviewMetrics {
  const rollingSevenDaysStart = getRollingSevenDaysStart().getTime();
  const notesInLastSevenDays = notes.filter((note) => {
    const timestamp = Date.parse(note.updated_at || note.created_at);
    return !Number.isNaN(timestamp) && timestamp >= rollingSevenDaysStart;
  }).length;

  return {
    openJobs: missions.filter((mission) => mission.status === "open").length,
    activeVotes: missions.filter((mission) => mission.voted).length,
    episodes: episodes.length,
    members: members.length,
    players: members.filter((member) => member.role === "player").length,
    gms: members.filter((member) => member.role === "gm").length,
    notes: notes.length,
    notesThisWeek: notesInLastSevenDays,
    draftSignals: missions.filter((mission) => mission.status === "draft")
      .length,
    latestEpisodeTitle: episodes[0]?.title ?? null,
  };
}

export type CampaignOverviewProps = {
  campaignId: string;
  overview: CampaignOverviewResult;
};

export default function CampaignOverview({
  campaignId,
  overview,
}: CampaignOverviewProps) {
  const [missions, setMissions] = useState<Mission[]>(() =>
    overview.jobs.map(mapApiJob),
  );
  const [toast, setToast] = useState<string | null>(null);
  const notify = (message: string) => setToast(message);
  const characters = overview.characters.map(mapApiCharacter);
  const npcRecords = overview.npcs.map(mapApiNpc);
  const factionRecords = overview.factions.map(mapApiFaction);
  const noteRecords = overview.notes.map(mapApiNote);
  const episodeRecords = overview.episodes.map(mapApiEpisode);
  const isGM = overview.role === "gm";

  const handleVote = (id: string) => {
    const chosen = missions.find((mission) => mission.id === id);
    if (!chosen) return;
    if (chosen.status !== "open") {
      notify("Only open jobs can be voted on.");
      return;
    }

    const wasVoted = chosen.voted;
    const previousMissions = missions;
    setMissions((current) =>
      current.map((mission) => {
        if (mission.id === id)
          return {
            ...mission,
            voted: !wasVoted,
            votes: wasVoted ? mission.votes - 1 : mission.votes + 1,
          };
        if (!wasVoted && mission.voted)
          return { ...mission, voted: false, votes: mission.votes - 1 };
        return mission;
      }),
    );

    const method = wasVoted ? "DELETE" : "POST";
    void fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(id)}/vote`,
      { method },
    )
      .then(async (response) => {
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(result?.error ?? "Vote could not be synchronized.");
        }
        const result = await fetchCampaignJobs(campaignId);
        setMissions(result.jobs.map(mapApiJob));
        notify(
          wasVoted
            ? `Vote removed from ${chosen.title}`
            : `Vote locked on ${chosen.title}`,
        );
      })
      .catch((error: unknown) => {
        setMissions(previousMissions);
        notify(
          error instanceof Error
            ? error.message
            : "Vote could not be synchronized.",
        );
      });
  };

  return (
    <>
      <OverviewView
        campaign={overview.campaign}
        missions={missions}
        characters={characters}
        npcs={npcRecords}
        factions={factionRecords}
        places={overview.places}
        members={overview.members}
        notes={noteRecords}
        episodes={episodeRecords}
        isGM={isGM}
        onVote={handleVote}
      />
      <CampaignToastHost message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function OverviewView({
  campaign,
  missions,
  characters,
  npcs,
  factions,
  places,
  members,
  notes,
  episodes,
  isGM,
  onVote,
}: {
  campaign: CampaignRecord;
  missions: Mission[];
  characters: Character[];
  npcs: NpcRecord[];
  factions: FactionRecord[];
  places: ApiPlace[];
  members: ApiCampaignMember[];
  notes: CampaignNote[];
  episodes: EpisodeRecord[];
  isGM: boolean;
  onVote: (id: string) => void;
}) {
  const metrics = getOverviewMetrics(missions, members, notes, episodes);
  const roster = members.map((member, index) => ({
    ...member,
    initials: member.displayName.slice(0, 2).toUpperCase(),
    color: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4],
  }));

  return (
    <>
      <div className="page-intro overview-intro flex items-center justify-between gap-6 mb-[29px] max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[19px] max-[760px]:mb-[25px]">
        <div>
          <p className={eyebrowBrightClassName}>
            <span className={liveDotBrightClassName} /> {campaign.system.toUpperCase()} {"//"}{" "}
            CAMPAIGN OVERVIEW
          </p>
          <h1>{campaign.name}</h1>
          <p className="m-0 max-w-[510px] text-[var(--muted)] text-[13px] leading-[1.6]">
            {campaign.description || "No campaign brief recorded yet."}
          </p>
        </div>
        <div className="flex items-center gap-[23px] max-[760px]:w-full max-[760px]:justify-between">
          <div className="border-l border-[var(--line)] pl-[17px] max-[420px]:hidden [&_span]:mb-[5px] [&_span]:block [&_span]:text-[8px] [&_strong]:block [&_strong]:text-[var(--muted)] [&_strong]:font-mono [&_strong]:text-[10px] [&_strong]:font-medium">
            <span className={microLabelClassName}>CAMPAIGN RECORDS</span>
            <strong>LIVE</strong>
          </div>
          <CampaignRouteLink
            className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff]"
            href={campaignSectionPath(campaign.id, "jobs")}
          >
            <Plus size={16} /> {isGM ? "OPEN JOB BOARD" : "VIEW JOB BOARD"}
          </CampaignRouteLink>
        </div>
      </div>
      <div className="relative flex min-h-[82px] items-center overflow-hidden mb-[17px] border border-[rgba(98,232,255,.21)] bg-[linear-gradient(104deg,rgba(98,232,255,.1),rgba(98,232,255,.035)_42%,rgba(255,92,154,.05))] p-6 max-[760px]:flex-col max-[760px]:items-start max-[760px]:gap-[14px] max-[760px]:p-[17px]">
        <div className="absolute inset-0 opacity-[.19] bg-[linear-gradient(90deg,transparent_0_49%,rgba(98,232,255,.28)_50%,transparent_51%),linear-gradient(rgba(98,232,255,.15)_1px,transparent_1px)] bg-[length:48px_48px,100%_10px] [mask-image:linear-gradient(90deg,black,transparent_74%)]" />
        <div className="relative z-[1]">
          <span className={`${microLabelClassName} mb-[7px] block !text-[var(--cyan)]`}>
            CAMPAIGN BRIEF
          </span>
          <strong className="block text-[14px] font-[540] text-[#dcebf2]">
            {campaign.description || "No public campaign brief recorded yet."}
          </strong>
        </div>
        <div className="z-[1] ml-auto flex gap-7 text-[var(--dim)] font-mono text-[9px] tracking-[.11em] max-[1100px]:gap-[14px] max-[760px]:m-0 max-[760px]:flex-wrap max-[760px]:gap-[13px]">
          <span>
            <strong className="mr-[5px] text-[15px] font-semibold text-[var(--cyan)]">
              {String(metrics.openJobs).padStart(2, "0")}
            </strong>{" "}
            OPEN JOBS
          </span>
          <span>
            <strong className="mr-[5px] text-[15px] font-semibold text-[var(--cyan)]">
              {String(metrics.activeVotes).padStart(2, "0")}
            </strong>{" "}
            VOTED JOBS
          </span>
          <span>
            <strong className="mr-[5px] text-[15px] font-semibold text-[var(--cyan)]">
              {String(metrics.episodes).padStart(2, "0")}
            </strong>{" "}
            EPISODES
          </span>
        </div>
        <Zap
          size={18}
          className="relative z-[1] ml-[25px] text-[var(--pink)] max-[760px]:absolute max-[760px]:right-[17px] max-[760px]:top-[18px]"
        />
      </div>
      <div className="grid grid-cols-4 gap-[11px] mb-[19px] max-[1100px]:grid-cols-2 max-[760px]:gap-2">
        <MetricCard
          label="Crew roster"
          value={String(metrics.members).padStart(2, "0")}
          detail={`${metrics.players} players / ${metrics.gms} GM${metrics.gms === 1 ? "" : "s"}`}
          icon={UsersRound}
          accent="cyan"
        />
        <MetricCard
          label="Campaign notes"
          value={String(metrics.notes).padStart(2, "0")}
          detail={`${metrics.notesThisWeek} updated in last 7 days`}
          icon={FileText}
          accent="pink"
        />
        <MetricCard
          label="Episodes logged"
          value={String(metrics.episodes).padStart(2, "0")}
          detail={metrics.latestEpisodeTitle ?? "No episodes logged"}
          icon={FolderKanban}
          accent="amber"
        />
        <MetricCard
          label="GM signals"
          value={String(metrics.draftSignals).padStart(2, "0")}
          detail={`${metrics.draftSignals} drafts / ${metrics.openJobs} open`}
          icon={Bot}
          accent="purple"
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(285px,.72fr)] items-start gap-[18px] max-[1100px]:grid-cols-1">
        <section className={`${panelClassName} min-w-0`}>
          <div className="panel-topline flex items-start justify-between px-[21px] pb-4 pt-5">
            <div>
              <p className={`${eyebrowClassName} !mb-2`}>MISSION CONTROL</p>
              <h2>Job board</h2>
            </div>
          </div>
          {missions.length ? (
            <div className="border-t border-[var(--line)]">
              {missions.map((mission, index) => (
                <JobCard
                  campaignId={campaign.id}
                  key={mission.id}
                  job={mission}
                  isGM={isGM}
                  index={index}
                  onVote={onVote}
                  compact
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No jobs recorded yet."
              message={
                isGM
                  ? "Open the job board to create the campaign's first signal."
                  : "The GM has not posted a job yet."
              }
            />
          )}
          <CampaignRouteLink
            className="flex w-full h-[42px] items-center justify-end gap-2 border-0 border-t border-[var(--line)] bg-transparent px-5 text-[var(--cyan)] font-mono text-[8px] tracking-[.11em] cursor-pointer hover:bg-[rgba(98,232,255,.04)]"
            href={campaignSectionPath(campaign.id, "jobs")}
          >
            VIEW ALL JOBS <ArrowUpRight size={14} />
          </CampaignRouteLink>
        </section>
        <aside className="grid gap-[18px] max-[1100px]:grid-cols-2 max-[760px]:grid-cols-1">
          <section className={`${panelClassName} pt-px`}>
            <div className="p-[19px_19px_15px]">
              <SectionHeading
                eyebrow="CREW MANIFEST"
                title="On the roster"
                action="Manage"
                actionHref={campaignSectionPath(campaign.id, "members")}
                actionIcon={<ArrowUpRight size={14} />}
              />
            </div>
            {roster.length ? (
              <div className="border-t border-[var(--line)] px-[19px] py-1">
                {roster.map((member) => (
                  <div
                    className="flex items-center gap-[10px] border-b border-[rgba(139,151,169,.1)] py-[10px] last:border-b-0"
                    key={member.userId}
                  >
                    <div
                      className="grid h-7 w-7 flex-[0_0_28px] place-items-center text-[#071017] font-mono text-[8px] font-bold"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[#d9e1eb] text-[11px] font-[550]">
                        {member.displayName}
                      </strong>
                      <span className="mt-[3px] block text-[var(--dim)] text-[9px]">
                        {member.role === "gm" ? "GAME MASTER" : "PLAYER"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UsersRound}
                title="No crew members yet."
                message="Campaign access has not been established."
              />
            )}
          </section>
          <section className={panelClassName}>
            <div className="panel-topline flex items-start justify-between px-[21px] pb-4 pt-5">
              <div>
                <p className={`${eyebrowClassName} !mb-2`}>CAMPAIGN SNAPSHOT</p>
                <h2>Record coverage</h2>
              </div>
              <Activity size={17} className={accentIconCyanClassName} />
            </div>
            <div className="grid grid-cols-2 border-t border-[var(--line)]">
              <CampaignRouteLink
                className="flex min-w-0 items-center gap-[7px] border-b border-r border-[var(--line)] p-[13px_19px] text-[var(--muted)] font-mono text-[9px] tracking-[.05em] hover:bg-[rgba(98,232,255,.04)]"
                href={campaignSectionPath(campaign.id, "characters")}
              >
                <UsersRound size={15} />{" "}
                <span className="min-w-0 flex-1">Characters</span>
                <strong className="text-[var(--cyan)]">
                  {characters.length}
                </strong>
              </CampaignRouteLink>
              <CampaignRouteLink
                className="flex min-w-0 items-center gap-[7px] border-b border-[var(--line)] p-[13px_19px] text-[var(--muted)] font-mono text-[9px] tracking-[.05em] hover:bg-[rgba(98,232,255,.04)]"
                href={campaignSectionPath(campaign.id, "npcs")}
              >
                <UserRound size={15} />{" "}
                <span className="min-w-0 flex-1">NPCs</span>
                <strong className="text-[var(--cyan)]">{npcs.length}</strong>
              </CampaignRouteLink>
              <CampaignRouteLink
                className="flex min-w-0 items-center gap-[7px] border-r border-[var(--line)] p-[13px_19px] text-[var(--muted)] font-mono text-[9px] tracking-[.05em] hover:bg-[rgba(98,232,255,.04)]"
                href={campaignSectionPath(campaign.id, "factions")}
              >
                <Network size={15} />{" "}
                <span className="min-w-0 flex-1">Factions</span>
                <strong className="text-[var(--cyan)]">
                  {factions.length}
                </strong>
              </CampaignRouteLink>
              <CampaignRouteLink
                className="flex min-w-0 items-center gap-[7px] p-[13px_19px] text-[var(--muted)] font-mono text-[9px] tracking-[.05em] hover:bg-[rgba(98,232,255,.04)]"
                href={campaignSectionPath(campaign.id, "places")}
              >
                <Map size={15} /> <span className="min-w-0 flex-1">Places</span>
                <strong className="text-[var(--cyan)]">{places.length}</strong>
              </CampaignRouteLink>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
