"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import AuthPrompt from "@/components/auth/AuthPrompt";
import { CampaignArtEditorSlot, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import AiDraftAssistant, { type AiDraftSelectField } from "@/components/archive/AiDraftAssistant";
import CampaignAiSettings from "@/components/settings/CampaignAiSettings";
import CampaignNotesView from "@/components/archive/CampaignNotesView";
import PlacesView from "@/components/archive/PlacesView";
import AppStatus from "@/components/ui/AppStatus";
import CampaignShell from "@/components/campaign-shell/CampaignShell";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";
import CampaignSidebar from "@/components/campaign-shell/CampaignSidebar";
import CampaignToastHost from "@/components/campaign-shell/CampaignToastHost";
import CampaignTopbar from "@/components/campaign-shell/CampaignTopbar";
import PageLayout from "@/components/ui/PageLayout";
import RecordPortrait from "@/components/ui/RecordPortrait";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusPill from "@/components/ui/StatusPill";
import VisualAsset from "@/components/ui/VisualAsset";
import { getAttachedArtUrl, getCampaignRecord, mapApiCharacter, mapApiEpisode, mapApiFaction, mapApiJob, mapApiNpc, mapApiNote, toCharacterDraft } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiCampaignMember, ApiCampaignNote, ApiCharacter, ApiEpisode, ApiFaction, ApiJob, ApiNpc, ApiPlace, CampaignMembership, CampaignNote, CampaignRecord, Character, CharacterDraft, EpisodeNote, EpisodeRecord, FactionRecord, Mission, NpcRecord } from "@/lib/campaign/types";
import { flattenPlaceTree, getPlaceBreadcrumb } from "@/lib/places";
import { getRollingSevenDaysStart } from "@/lib/time";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Clock3,
  Command,
  FileText,
  FolderKanban,
  Gauge,
  Hexagon,
  LockKeyhole,
  Map,
  Menu,
  MoreHorizontal,
  Network,
  Orbit,
  Pencil,
  Plus,
  Radio,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
  Vote,
  X,
  Zap,
} from "lucide-react";

type NavId = "overview" | "characters" | "npcs" | "factions" | "places" | "jobs" | "episodes" | "notes" | "members" | "settings";


async function fetchCampaignManifest() {
  const response = await fetch("/api/campaigns");

  if (response.status === 401) {
    return { authenticated: false, campaigns: [] as CampaignMembership[] };
  }

  const result = (await response.json()) as { error?: string; campaigns?: CampaignMembership[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load your campaigns.");
  }

  return { authenticated: true, campaigns: result.campaigns ?? [] };
}

async function fetchCampaignJobs(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; jobs?: ApiJob[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign jobs.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", jobs: result.jobs ?? [] };
}

async function fetchCampaignCharacters(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; characters?: ApiCharacter[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign characters.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", characters: result.characters ?? [] };
}

async function fetchCampaignNpcs(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/npcs`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; npcs?: ApiNpc[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign NPCs.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", npcs: result.npcs ?? [] };
}

async function fetchCampaignFactions(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/factions`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; factions?: ApiFaction[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign factions.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", factions: result.factions ?? [] };
}

async function fetchCampaignPlaces(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/places`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; places?: ApiPlace[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign places.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", places: result.places ?? [] };
}

async function fetchCampaignNotes(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/notes`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; notes?: ApiCampaignNote[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign notes.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", notes: result.notes ?? [] };
}

async function fetchCampaignEpisodes(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/episodes`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; episodes?: ApiEpisode[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign episodes.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", episodes: result.episodes ?? [] };
}

async function fetchCampaignEpisode(campaignId: string, episodeId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/episodes/${encodeURIComponent(episodeId)}`);
  const result = (await response.json()) as { error?: string; episode?: ApiEpisode; notes?: EpisodeNote[] };

  if (!response.ok || !result.episode) {
    throw new Error(result.error ?? "Unable to load the campaign episode.");
  }

  return { episode: result.episode, notes: result.notes ?? [] };
}

async function fetchCampaignMembers(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; displayName?: string; members?: ApiCampaignMember[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign members.");
  }

  return { role: result.role ?? "player", displayName: result.displayName ?? "Crew member", members: result.members ?? [] };
}

type NavItem = { id: NavId; label: string; icon: LucideIcon; count?: string };

const navItems: { label: string; items: NavItem[] }[] = [
  { label: "Command", items: [{ id: "overview", label: "Overview", icon: Gauge }, { id: "jobs", label: "Job board", icon: BriefcaseBusiness, count: "03" }, { id: "episodes", label: "Episodes", icon: FolderKanban, count: "08" }] },
  { label: "Archive", items: [{ id: "characters", label: "Characters", icon: UsersRound, count: "06" }, { id: "npcs", label: "NPCs", icon: UserRound, count: "14" }, { id: "factions", label: "Factions", icon: Network, count: "05" }, { id: "places", label: "Places", icon: Map, count: "00" }, { id: "notes", label: "Campaign notes", icon: FileText, count: "21" }] },
  { label: "Control", items: [{ id: "settings", label: "Campaign settings", icon: SlidersHorizontal }] },
];

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

function getOverviewMetrics(missions: Mission[], members: ApiCampaignMember[], notes: CampaignNote[], episodes: EpisodeRecord[]): OverviewMetrics {
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
    draftSignals: missions.filter((mission) => mission.status === "draft").length,
    latestEpisodeTitle: episodes[0]?.title ?? null,
  };
}

const emptyCharacterDraft: CharacterDraft = { name: "", species: "", className: "", level: 1, backstoryMarkdown: "", physicalDescription: "", artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function FactionCardArt({ faction }: { faction: FactionRecord }) {
  const src = getAttachedArtUrl(faction.art_url, faction.art_path);

  return <div aria-label={`${faction.name} emblem`} className={`faction-emblem ${src ? "has-art" : "no-art"}`} role="img" style={src ? { backgroundImage: `url(${src})` } : undefined}>{src ? null : <Network size={24} />}</div>;
}

export type CampaignCockpitProps = {
  initialCampaignId?: string;
};

export default function CampaignCockpit({ initialCampaignId }: CampaignCockpitProps) {
  const [activeView] = useState<NavId>("overview");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [npcRecords, setNpcRecords] = useState<NpcRecord[]>([]);
  const [factionRecords, setFactionRecords] = useState<FactionRecord[]>([]);
  const [placeRecords, setPlaceRecords] = useState<ApiPlace[]>([]);
  const [noteRecords, setNoteRecords] = useState<CampaignNote[]>([]);
  const [episodeRecords, setEpisodeRecords] = useState<EpisodeRecord[]>([]);
  const [memberRecords, setMemberRecords] = useState<ApiCampaignMember[]>([]);
  const [isGM, setIsGM] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const campaignIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestedPath, setRequestedPath] = useState("/");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    let cancelled = false;
    const requestedCampaignId = initialCampaignId ?? new URLSearchParams(window.location.search).get("campaignId");
    const currentPath = `${window.location.pathname}${window.location.search}`;
    startTransition(() => setRequestedPath(currentPath));

    async function loadCampaign() {
      try {
        const manifest = await fetchCampaignManifest();

        if (!manifest.authenticated) {
          if (!cancelled) {
            setAuthRequired(true);
            setIsLoading(false);
          }
          return;
        }

        if (!requestedCampaignId) {
          window.location.assign("/campaigns");
          return;
        }

        const membership = manifest.campaigns.find((entry) => getCampaignRecord(entry)?.id === requestedCampaignId);
        const selectedCampaign = membership ? getCampaignRecord(membership) : null;

        if (!membership || !selectedCampaign) {
          window.location.assign("/campaigns");
          return;
        }

        const [jobsResult, charactersResult, npcsResult, factionsResult, placesResult, notesResult, episodesResult, membersResult] = await Promise.all([
          fetchCampaignJobs(requestedCampaignId),
          fetchCampaignCharacters(requestedCampaignId),
          fetchCampaignNpcs(requestedCampaignId),
          fetchCampaignFactions(requestedCampaignId),
          fetchCampaignPlaces(requestedCampaignId),
          fetchCampaignNotes(requestedCampaignId),
          fetchCampaignEpisodes(requestedCampaignId),
          fetchCampaignMembers(requestedCampaignId),
        ]);

        if (cancelled) return;

        campaignIdRef.current = requestedCampaignId;
        setCampaign(selectedCampaign);
        setCampaignId(requestedCampaignId);
        setIsGM(membership.role === "gm");
        setDisplayName(membership.display_name || "Crew member");
        setMissions(jobsResult.jobs.map(mapApiJob));
        setCharacters(charactersResult.characters.map(mapApiCharacter));
        setNpcRecords(npcsResult.npcs.map(mapApiNpc));
        setFactionRecords(factionsResult.factions.map(mapApiFaction));
        setPlaceRecords(placesResult.places);
        setNoteRecords(notesResult.notes.map(mapApiNote));
        setEpisodeRecords(episodesResult.episodes.map(mapApiEpisode));
        setMemberRecords(membersResult.members);
        setIsLoading(false);
      } catch (error: unknown) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load this campaign.");
        setIsLoading(false);
      }
    }

    void loadCampaign();
    return () => { cancelled = true; };
  }, [initialCampaignId]);
  const handleVote = (id: string) => {
    const chosen = missions.find((mission) => mission.id === id);
    if (!chosen) return;
    if (chosen.status !== "open") {
      notify("Only open jobs can be voted on.");
      return;
    }
    const wasVoted = chosen.voted;
    const previousMissions = missions;
    setMissions((current) => current.map((mission) => {
      if (mission.id === id) return { ...mission, voted: !wasVoted, votes: wasVoted ? mission.votes - 1 : mission.votes + 1 };
      if (!wasVoted && mission.voted) return { ...mission, voted: false, votes: mission.votes - 1 };
      return mission;
    }));
    if (campaignIdRef.current) {
      const selectedCampaignId = campaignIdRef.current;
      const method = wasVoted ? "DELETE" : "POST";
      void fetch(`/api/campaigns/${encodeURIComponent(selectedCampaignId)}/jobs/${encodeURIComponent(id)}/vote`, { method }).then(async (response) => {
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(result?.error ?? "Vote could not be synchronized.");
        }
        const result = await fetchCampaignJobs(selectedCampaignId);
        setMissions(result.jobs.map(mapApiJob));
        setIsGM(result.role === "gm");
        notify(wasVoted ? `Vote removed from ${chosen.title}` : `Vote locked on ${chosen.title}`);
      }).catch((error: unknown) => {
        setMissions(previousMissions);
        notify(error instanceof Error ? error.message : "Vote could not be synchronized.");
      });
    }
  };
  const handlePromote = async (jobId: string) => {
    const selectedCampaignId = campaignIdRef.current;
    const chosen = missions.find((mission) => mission.id === jobId);

    if (!selectedCampaignId || !chosen || !window.confirm(`Promote ${chosen.title} into the campaign episode log?`)) return;

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(selectedCampaignId)}/jobs/${encodeURIComponent(jobId)}/promote`, { method: "POST" });
      const result = (await response.json()) as { error?: string; episode?: { title: string } };
      if (!response.ok) throw new Error(result.error ?? "Job could not be promoted.");
      const [jobsResult, episodesResult] = await Promise.all([fetchCampaignJobs(selectedCampaignId), fetchCampaignEpisodes(selectedCampaignId)]);
      setMissions(jobsResult.jobs.map(mapApiJob));
      setEpisodeRecords(episodesResult.episodes.map(mapApiEpisode));
      notify(`${result.episode?.title ?? chosen.title} added to the episode log.`);
    } catch (promoteError: unknown) {
      notify(promoteError instanceof Error ? promoteError.message : "Job could not be promoted.");
    }
  };
  const overviewMetrics = getOverviewMetrics(missions, memberRecords, noteRecords, episodeRecords);
  const countByNavId: Partial<Record<NavId, number>> = {
    jobs: overviewMetrics.openJobs,
    episodes: overviewMetrics.episodes,
    characters: characters.length,
    npcs: npcRecords.length,
    factions: factionRecords.length,
    places: placeRecords.length,
    notes: overviewMetrics.notes,
  };

  if (authRequired) return <AuthPrompt nextPath={requestedPath} />;
  if (isLoading) return <AppStatus title="Loading campaign signal." message="Checking your access and assembling the campaign records." />;
  if (loadError) return <AppStatus title="Campaign signal unavailable." message={loadError} action={<button className="button button-secondary" onClick={() => window.location.reload()} type="button">RETRY LOAD</button>} />;

  const displayedNavItems = navItems.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.id !== "settings" || isGM).map((item) => ({ ...item, href: campaignSectionPath(campaign!.id, item.id), count: item.id === "settings" ? undefined : String(countByNavId[item.id] ?? 0).padStart(2, "0") })),
  }));
  const activeLabel = navItems.flatMap((group) => group.items).find((item) => item.id === activeView)?.label ?? "Overview";

  return <CampaignShell
    sidebar={<CampaignSidebar campaignName={campaign?.name ?? ""} campaignSwitchHref="/campaigns" navItems={displayedNavItems} activeView={activeView} isGM={isGM} displayName={displayName} mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />}
    toast={<CampaignToastHost message={toast} onDismiss={() => setToast(null)} />}
  >
    <CampaignTopbar campaignName={campaign?.name ?? ""} activeLabel={activeLabel} onOpenNavigation={() => setMobileNavOpen(true)} />
    <div className="content-frame">{activeView === "overview" ? <OverviewView campaign={campaign!} missions={missions} characters={characters} npcs={npcRecords} factions={factionRecords} places={placeRecords} members={memberRecords} notes={noteRecords} episodes={episodeRecords} isGM={isGM} onVote={handleVote} /> : activeView === "jobs" ? <JobsView missions={missions} campaignId={campaignId} isGM={isGM} npcs={npcRecords} factions={factionRecords} places={placeRecords} onMissionsChange={setMissions} onVote={handleVote} onPromote={handlePromote} onAction={notify} /> : activeView === "characters" ? <CharactersView characters={characters} campaignId={campaignId} isGM={isGM} onCharactersChange={setCharacters} onAction={notify} /> : activeView === "npcs" ? <NpcsView npcs={npcRecords} places={placeRecords} campaignId={campaignId} isGM={isGM} onNpcsChange={setNpcRecords} onAction={notify} /> : activeView === "factions" ? <FactionsView factions={factionRecords} places={placeRecords} campaignId={campaignId} isGM={isGM} onFactionsChange={setFactionRecords} onAction={notify} /> : activeView === "places" ? <PlacesView places={placeRecords} campaignId={campaignId} isGM={isGM} onPlacesChange={setPlaceRecords} onAction={notify} /> : activeView === "episodes" ? <EpisodesView episodes={episodeRecords} places={placeRecords} campaignId={campaignId} /> : activeView === "notes" ? <CampaignNotesView notes={noteRecords} episodes={episodeRecords} campaignId={campaignId} isGM={isGM} onNotesChange={setNoteRecords} onAction={notify} /> : activeView === "settings" ? <CampaignSettingsView campaignId={campaignId} /> : <MembersView members={memberRecords} campaignId={campaignId} isGM={isGM} onMembersChange={setMemberRecords} onAction={notify} />}</div>
  </CampaignShell>;
}

function OverviewView({ campaign, missions, characters, npcs, factions, places, members, notes, episodes, isGM, onVote }: { campaign: CampaignRecord; missions: Mission[]; characters: Character[]; npcs: NpcRecord[]; factions: FactionRecord[]; places: ApiPlace[]; members: ApiCampaignMember[]; notes: CampaignNote[]; episodes: EpisodeRecord[]; isGM: boolean; onVote: (id: string) => void }) {
  const metrics = getOverviewMetrics(missions, members, notes, episodes);
  const roster = members.map((member, index) => ({ ...member, initials: member.displayName.slice(0, 2).toUpperCase(), color: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4] }));

  return <><div className="page-intro overview-intro"><div><p className="eyebrow eyebrow-bright"><span className="live-dot" /> {campaign.system.toUpperCase()} {"//"} CAMPAIGN OVERVIEW</p><h1>{campaign.name}</h1><p className="intro-copy">{campaign.description || "No campaign brief recorded yet."}</p></div><div className="intro-actions"><div className="last-sync"><span>CAMPAIGN RECORDS</span><strong>LIVE</strong></div><CampaignRouteLink className="button button-primary" href={campaignSectionPath(campaign.id, "jobs")}><Plus size={16} /> {isGM ? "OPEN JOB BOARD" : "VIEW JOB BOARD"}</CampaignRouteLink></div></div>
    <div className="signal-strip"><div className="signal-strip-pattern" /><div className="signal-copy"><span className="micro-label">CAMPAIGN BRIEF</span><strong>{campaign.description || "No public campaign brief recorded yet."}</strong></div><div className="signal-stats"><span><strong>{String(metrics.openJobs).padStart(2, "0")}</strong> OPEN JOBS</span><span><strong>{String(metrics.activeVotes).padStart(2, "0")}</strong> VOTED JOBS</span><span><strong>{String(metrics.episodes).padStart(2, "0")}</strong> EPISODES</span></div><Zap size={18} className="signal-zap" /></div>
    <div className="metric-grid"><MetricCard label="Crew roster" value={String(metrics.members).padStart(2, "0")} detail={`${metrics.players} players / ${metrics.gms} GM${metrics.gms === 1 ? "" : "s"}`} icon={UsersRound} accent="cyan" /><MetricCard label="Campaign notes" value={String(metrics.notes).padStart(2, "0")} detail={`${metrics.notesThisWeek} updated in last 7 days`} icon={FileText} accent="pink" /><MetricCard label="Episodes logged" value={String(metrics.episodes).padStart(2, "0")} detail={metrics.latestEpisodeTitle ?? "No episodes logged"} icon={FolderKanban} accent="amber" /><MetricCard label="GM signals" value={String(metrics.draftSignals).padStart(2, "0")} detail={`${metrics.draftSignals} drafts / ${metrics.openJobs} open`} icon={Bot} accent="purple" /></div>
    <div className="dashboard-grid"><section className="panel panel-jobboard"><div className="panel-topline"><div><p className="eyebrow">MISSION CONTROL</p><h2>Job board</h2></div></div>{missions.length ? <div className="job-list">{missions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} compact />)}</div> : <div className="character-empty overview-empty"><BriefcaseBusiness size={22} /><h2>No jobs recorded yet.</h2><p>{isGM ? "Open the job board to create the campaign's first signal." : "The GM has not posted a job yet."}</p></div>}<CampaignRouteLink className="panel-footer-action" href={campaignSectionPath(campaign.id, "jobs")}>VIEW ALL JOBS <ArrowUpRight size={14} /></CampaignRouteLink></section>
      <aside className="right-rail"><section className="panel crew-panel"><SectionHeading eyebrow="CREW MANIFEST" title="On the roster" action="Manage" actionHref={campaignSectionPath(campaign.id, "members")} actionIcon={<ArrowUpRight size={14} />} />{roster.length ? <div className="crew-list">{roster.map((member) => <div className="crew-row" key={member.userId}><div className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</div><div className="crew-copy"><strong>{member.displayName}</strong><span>{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div></div>)}</div> : <div className="character-empty overview-empty"><UsersRound size={22} /><h2>No crew members yet.</h2><p>Campaign access has not been established.</p></div>}</section><section className="panel snapshot-panel"><div className="panel-topline"><div><p className="eyebrow">CAMPAIGN SNAPSHOT</p><h2>Record coverage</h2></div><Activity size={17} className="accent-icon-cyan" /></div><div className="snapshot-list"><CampaignRouteLink href={campaignSectionPath(campaign.id, "characters")}><UsersRound size={15} /> <span>Characters</span><strong>{characters.length}</strong></CampaignRouteLink><CampaignRouteLink href={campaignSectionPath(campaign.id, "npcs")}><UserRound size={15} /> <span>NPCs</span><strong>{npcs.length}</strong></CampaignRouteLink><CampaignRouteLink href={campaignSectionPath(campaign.id, "factions")}><Network size={15} /> <span>Factions</span><strong>{factions.length}</strong></CampaignRouteLink><CampaignRouteLink href={campaignSectionPath(campaign.id, "places")}><Map size={15} /> <span>Places</span><strong>{places.length}</strong></CampaignRouteLink></div></section></aside></div></>;
}

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-head"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{detail}</small><div className="metric-bar"><span /></div></div>; }

function MissionCard({ mission, isGM, index, onVote, onEdit, onPromote, compact = false }: { mission: Mission; isGM: boolean; index: number; onVote: (id: string) => void; onEdit?: () => void; onPromote?: (id: string) => void; compact?: boolean }) {
  return <article className={`mission-card mission-${mission.accent} ${compact ? "mission-compact" : ""}`}><VisualAsset src={mission.image} label={`${mission.title} artwork`} className="mission-art" /><div className="mission-art-overlay" /><div className="mission-index">0{index + 1}</div><div className="mission-content"><div className="mission-meta"><StatusPill color={mission.status === "open" ? "open" : mission.accent}>{mission.status === "open" ? "OPEN JOB" : mission.category}</StatusPill></div><h3>{mission.title}</h3><p>{mission.summary}</p><div className="mission-footer"><span className="giver"><span className="giver-glyph">{mission.giverType === "NPC" ? "N" : "F"}</span><span><small>{mission.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</small><strong>{mission.giver}</strong></span></span></div></div><div className="mission-vote"><span><strong>{mission.votes.toString().padStart(2, "0")}</strong> votes</span>{mission.status === "open" ? <button className={`vote-button ${mission.voted ? "vote-active" : ""}`} onClick={() => onVote(mission.id)} type="button"><Vote size={15} /> {mission.voted ? "VOTED" : "VOTE"}</button> : null}{isGM && onEdit ? <button className="mission-more icon-button" aria-label={`Edit ${mission.title}`} onClick={onEdit} title="Edit mission" type="button"><MoreHorizontal size={16} /></button> : null}{isGM && mission.status === "open" && onPromote ? <button className="mission-more mission-promote icon-button" aria-label={`Promote ${mission.title} to an episode`} onClick={() => onPromote(mission.id)} title="Promote to episode" type="button"><Sparkles size={16} /></button> : null}</div></article>;
}

type JobDraft = { title: string; summary: string; playerNotesMarkdown: string; gmNotesMarkdown: string; hook: string; giverType: "npc" | "faction"; giverId: string; placeId: string | null; status: "draft" | "open" | "archived"; artSubject: string; artPath: string | null; artUrl: string | null; artPrompt: string | null; artProvider: string | null };
const emptyJobDraft: JobDraft = { title: "", summary: "", playerNotesMarkdown: "", gmNotesMarkdown: "", hook: "", giverType: "npc", giverId: "", placeId: null, status: "draft", artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function JobsView({ missions, campaignId, isGM, npcs, factions, places, onMissionsChange, onVote, onPromote, onAction }: { missions: Mission[]; campaignId: string | null; isGM: boolean; npcs: NpcRecord[]; factions: FactionRecord[]; places: ApiPlace[]; onMissionsChange: Dispatch<SetStateAction<Mission[]>>; onVote: (id: string) => void; onPromote: (id: string) => void; onAction: (message: string) => void }) {
  const [filter, setFilter] = useState<"open" | "archived" | "drafts">("open");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [draft, setDraft] = useState<JobDraft>(emptyJobDraft);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const giverOptions = (draft.giverType === "npc" ? npcs : factions).map((giver) => ({ value: giver.id, label: giver.name }));
  const placeOptions = flattenPlaceTree(places).map(({ place, depth }) => ({ value: place.id, label: `${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]` }));
  const jobContextFields: AiDraftSelectField[] = [
    { key: "giver-type", label: "GIVER TYPE", value: draft.giverType, options: [{ value: "npc", label: "NPC" }, { value: "faction", label: "FACTION" }], onChange: (value) => setDraft((current) => ({ ...current, giverType: value as JobDraft["giverType"], giverId: "" })) },
    { key: "giver", label: draft.giverType === "npc" ? "NPC" : "FACTION", value: draft.giverId, placeholder: draft.giverType === "npc" ? "SELECT NPC" : "SELECT FACTION", options: giverOptions, onChange: (value) => setDraft((current) => ({ ...current, giverId: value })) },
    { key: "location", label: "LOCATION", value: draft.placeId ?? "", placeholder: "NO PRIMARY LOCATION", options: placeOptions, onChange: (value) => setDraft((current) => ({ ...current, placeId: value || null })) },
  ];
  const jobAssistant = editorOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/mission" entityLabel="job" mode={editingMission ? "refine" : "create"} contextFields={jobContextFields} requestFields={{ title: draft.title, ...(draft.giverId ? { giverType: draft.giverType, giverId: draft.giverId } : {}), ...(draft.placeId ? { placeId: draft.placeId } : {}) }} currentDraft={{ title: draft.title, summary: draft.summary, playerNotes: draft.playerNotesMarkdown, gmNotes: draft.gmNotesMarkdown, hook: draft.hook, thumbnailDescription: draft.artSubject }} fields={[{ key: "title", label: "Title", maxLength: 160 }, { key: "summary", label: "Summary", maxLength: 4000, multiline: true }, { key: "playerNotes", label: "Player context", maxLength: 20000, multiline: true }, { key: "gmNotes", label: "GM notes", maxLength: 20000, multiline: true }, { key: "hook", label: "Hook", maxLength: 1200, multiline: true }, { key: "thumbnailDescription", label: "Thumbnail description", maxLength: 1600, multiline: true }, { key: "suggestedGiverType", label: "Suggested giver type", maxLength: 20, readOnly: true }, { key: "suggestedGiverName", label: "Suggested giver", maxLength: 160, readOnly: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, title: candidate.title ?? current.title, summary: candidate.summary ?? current.summary, playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown, gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown, hook: candidate.hook ?? current.hook, artSubject: candidate.thumbnailDescription ?? current.artSubject }))} /> : null;
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "job", value: draft.artPath, url: draft.artUrl, subject: draft.artSubject, currentPrompt: draft.artPrompt, onSubjectChange: (subject) => setDraft((current) => ({ ...current, artSubject: subject })), onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);

  const filteredMissions = missions.filter((mission) => filter === "drafts" ? mission.status === "draft" : mission.status === filter);
  const openEditor = (mission?: Mission) => {
    if (!isGM) {
      onAction("Only a GM can edit missions.");
      return;
    }
    setEditingMission(mission ?? null);
    setDraft(mission ? { title: mission.title, summary: mission.summary, playerNotesMarkdown: mission.playerNotesMarkdown, gmNotesMarkdown: mission.gmNotesMarkdown ?? "", hook: mission.hook ?? "", giverType: mission.giverType.toLowerCase() as JobDraft["giverType"], giverId: mission.giverId, placeId: mission.placeId, status: mission.status === "promoted" ? "open" : mission.status, artSubject: mission.artSubject ?? "", artPath: mission.artPath ?? null, artUrl: mission.artUrl ?? null, artPrompt: mission.artPrompt ?? null, artProvider: mission.artProvider ?? null } : emptyJobDraft);
    setAssistantOpen(false);
    setError(null);
    setEditorOpen(true);
  };

  const saveJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs`, { method: editingMission ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingMission ? { ...draft, jobId: editingMission.id } : draft) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Mission could not be saved.");
      const refreshed = await fetchCampaignJobs(campaignId);
      onMissionsChange(refreshed.jobs.map(mapApiJob));
      setEditorOpen(false);
      setEditingMission(null);
      onAction(editingMission ? `${draft.title} updated.` : `${draft.title} added to the job board.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Mission could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteJob = async () => {
    if (!campaignId || !editingMission || !window.confirm(`Remove ${editingMission.title} from the job board?`)) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs?jobId=${encodeURIComponent(editingMission.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Mission could not be removed.");
      onMissionsChange((current) => current.filter((mission) => mission.id !== editingMission.id));
      setEditorOpen(false);
      setEditingMission(null);
      onAction(`${editingMission.title} removed from the job board.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Mission could not be removed.");
    } finally {
      setIsSaving(false);
    }
  };

  const filterCount = (status: "open" | "archived" | "draft") => missions.filter((mission) => mission.status === status).length.toString().padStart(2, "0");

  return <PageLayout eyebrow={`MISSION CONTROL // ${filterCount("open")} OPEN`} title="Job board" description="Potential missions, ranked by the crew. Choose the signal that pulls hardest." action={isGM ? "NEW MISSION" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM MISSION EDITOR</p><h2>{editingMission ? `Edit ${editingMission.title}` : "New mission"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE JOB"}</button><button className="icon-button" aria-label="Close mission editor" onClick={() => setEditorOpen(false)} title="Close mission editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? jobAssistant : null}<form className="character-form" onSubmit={saveJob}><div className="character-form-grid"><label>Title<input required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as JobDraft["status"] }))}><option value="draft">DRAFT</option><option value="open">OPEN</option><option value="archived">ARCHIVED</option></select></label><label>Giver type<select value={draft.giverType} onChange={(event) => setDraft((current) => ({ ...current, giverType: event.target.value as JobDraft["giverType"], giverId: "" }))}><option value="npc">NPC</option><option value="faction">FACTION</option></select></label><label>Giver<select required value={draft.giverId} onChange={(event) => setDraft((current) => ({ ...current, giverId: event.target.value }))}><option value="">Select a giver</option>{(draft.giverType === "npc" ? npcs : factions).map((giver) => <option key={giver.id} value={giver.id}>{giver.name}</option>)}</select></label></div><label>Summary<textarea maxLength={4000} value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} /></label><label>Player context<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, playerNotesMarkdown: event.target.value }))} /></label><label>Hook<textarea maxLength={1200} value={draft.hook} onChange={(event) => setDraft((current) => ({ ...current, hook: event.target.value }))} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, gmNotesMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingMission ? "SAVE CHANGES" : "ADD MISSION"}</button>{editingMission && editingMission.status !== "promoted" ? <button className="button button-danger" disabled={isSaving} onClick={() => void deleteJob()} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    {editorOpen ? <label className="place-quick-field">Primary place<select value={draft.placeId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, placeId: event.target.value || null }))}><option value="">NO PRIMARY PLACE</option>{flattenPlaceTree(places).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}</select></label> : null}<div className="view-toolbar"><div className="filter-tabs"><button className={`filter-tab ${filter === "open" ? "filter-tab-active" : ""}`} onClick={() => setFilter("open")} type="button">OPEN <span>{filterCount("open")}</span></button><button className={`filter-tab ${filter === "archived" ? "filter-tab-active" : ""}`} onClick={() => setFilter("archived")} type="button">ARCHIVED <span>{filterCount("archived")}</span></button>{isGM ? <button className={`filter-tab ${filter === "drafts" ? "filter-tab-active" : ""}`} onClick={() => setFilter("drafts")} type="button">DRAFTS <span>{filterCount("draft")}</span></button> : null}</div></div>
    {filteredMissions.length ? <div className="jobs-grid">{filteredMissions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} onEdit={isGM ? () => openEditor(mission) : undefined} onPromote={isGM ? onPromote : undefined} />)}</div> : <div className="character-empty"><BriefcaseBusiness size={22} /><h2>No missions in this view.</h2><p>{filter === "drafts" ? "Draft the next signal when the GM is ready." : "The campaign board has no missions here yet."}</p></div>}
  </PageLayout>;
}

function CharactersView({ characters, campaignId, isGM, onCharactersChange, onAction }: { characters: Character[]; campaignId: string | null; isGM: boolean; onCharactersChange: Dispatch<SetStateAction<Character[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [draft, setDraft] = useState<CharacterDraft>(emptyCharacterDraft);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "character", value: draft.artPath, url: draft.artUrl, subject: draft.artSubject, onSubjectChange: (subject) => setDraft((current) => ({ ...current, artSubject: subject })), currentPrompt: draft.artPrompt, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);
  const characterAssistant = editorOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/character" entityLabel="character portrait" mode={editingCharacter ? "refine" : "create"} toolLabel="PLAYER TOOL" showModelPicker={false} requestFields={{ name: draft.name, species: draft.species, className: draft.className, level: draft.level, backstoryMarkdown: draft.backstoryMarkdown, physicalDescription: draft.physicalDescription }} currentDraft={{ name: draft.name, species: draft.species, className: draft.className, backstoryMarkdown: draft.backstoryMarkdown, physicalDescription: draft.physicalDescription, visualPrompt: draft.artSubject }} fields={[{ key: "visualPrompt", label: "Image generation prompt", maxLength: 1600, multiline: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, artSubject: candidate.visualPrompt ?? current.artSubject }))} /> : null;

  const openEditor = (character?: Character) => {
    setEditingCharacter(character ?? null);
    setDraft(character ? toCharacterDraft(character) : emptyCharacterDraft);
    setAssistantOpen(false);
    setError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingCharacter(null);
    setAssistantOpen(false);
    setError(null);
  };

  const saveCharacter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!campaignId) {
      onAction("Campaign is unavailable. Return to the campaign selector and try again.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters${editingCharacter ? `/${encodeURIComponent(editingCharacter.id)}` : ""}`, {
        method: editingCharacter ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; character?: ApiCharacter };

      if (!response.ok || !result.character) {
        throw new Error(result.error ?? "Character could not be saved.");
      }

      const savedCharacter = result.character;
      const editingIndex = editingCharacter ? characters.findIndex((character) => character.id === editingCharacter.id) : characters.length;
      const mappedCharacter = mapApiCharacter(savedCharacter, editingIndex >= 0 ? editingIndex : characters.length);
      onCharactersChange((current) => {
        if (!editingCharacter) return [...current, mapApiCharacter(savedCharacter, current.length)];
        return current.map((character) => character.id === editingCharacter.id ? mappedCharacter : character);
      });
      if (editingCharacter) setSelectedCharacter((current) => current?.id === editingCharacter.id ? mappedCharacter : current);
      closeEditor();
      onAction(editingCharacter ? `${savedCharacter.name} updated.` : `${savedCharacter.name} added to the roster.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Character could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCharacter = async () => {
    if (!campaignId || !editingCharacter) return;
    if (!window.confirm(`Delete ${editingCharacter.name} from this campaign?`)) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(editingCharacter.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) throw new Error(result.error ?? "Character could not be deleted.");

      onCharactersChange((current) => current.filter((character) => character.id !== editingCharacter.id));
      setSelectedCharacter((current) => current?.id === editingCharacter.id ? null : current);
      closeEditor();
      onAction(`${editingCharacter.name} removed from the roster.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Character could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <PageLayout eyebrow="ARCHIVE // CREW ROSTER" title="Characters" description="The people, androids, and mysteries currently recorded in this campaign." action="ADD CHARACTER" actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">{isGM ? "GM / PLAYER RECORD" : "PLAYER RECORD"}</p><h2>{editingCharacter ? `Edit ${editingCharacter.name}` : "Add a character"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE PORTRAIT TOOL" : "GENERATE PORTRAIT PROMPT"}</button><button className="icon-button" aria-label="Close character editor" onClick={closeEditor} title="Close character editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? characterAssistant : null}<form className="character-form" onSubmit={saveCharacter}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))} /></label><label>Class<input maxLength={160} value={draft.className} onChange={(event) => setDraft((current) => ({ ...current, className: event.target.value }))} /></label><label>Level<input type="number" min="1" max="20" value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: Number(event.target.value) }))} /></label></div><label>Backstory<textarea maxLength={20000} placeholder="Write what the crew knows about this character." value={draft.backstoryMarkdown} onChange={(event) => setDraft((current) => ({ ...current, backstoryMarkdown: event.target.value }))} /></label><label>Physical appearance<textarea maxLength={4000} placeholder="Describe the features, build, hair, eyes, skin, clothing, and other details the crew should recognize." value={draft.physicalDescription} onChange={(event) => setDraft((current) => ({ ...current, physicalDescription: event.target.value }))} /></label><label>Image generation prompt<textarea maxLength={1600} placeholder="Describe the visual direction to reuse for future character art." value={draft.artSubject} onChange={(event) => setDraft((current) => ({ ...current, artSubject: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingCharacter ? "SAVE CHANGES" : "ADD TO ROSTER"}</button>{editingCharacter ? <button className="button button-danger" disabled={isSaving} onClick={deleteCharacter} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={closeEditor} type="button">CANCEL</button></div></form></section> : null}
    {characters.length ? <div className="character-grid">{characters.map((character) => <article className={`character-card ${selectedCharacter?.id === character.id ? "character-card-selected" : ""}`} key={character.id}><button aria-label={`View ${character.name} public record`} className="character-card-main" onClick={() => setSelectedCharacter(character)} type="button"><VisualAsset src={character.image} label={`${character.name} portrait`} className={`character-art character-${character.color}`} /><div className="character-card-overlay"><div className="card-status-row"><StatusPill color={character.status === "ACTIVE" ? "cyan" : "muted"}>{character.status === "ACTIVE" ? "Active" : "Resting"}</StatusPill></div><div className="character-card-copy"><h3>{character.name}</h3><p>{["Level", character.level, character.species, character.className].filter(Boolean).join(" ")}</p></div></div></button>{character.canEdit ? <button aria-label={`Edit ${character.name}`} className="character-edit-button icon-button" onClick={() => openEditor(character)} title="Edit character" type="button"><Pencil size={15} /></button> : null}</article>)}</div> : <div className="character-empty"><UsersRound size={22} /><h2>No characters in the roster yet.</h2><p>Add the first crew record to begin the campaign manifest.</p></div>}
    {selectedCharacter ? <section aria-labelledby="character-public-record-title" className="character-public-record" id="character-public-record"><div className="character-public-heading"><div><p className="eyebrow">PLAYER VIEW // PUBLIC RECORD</p><h2 id="character-public-record-title">{selectedCharacter.name}</h2><p className="character-public-meta">{["Level", selectedCharacter.level, selectedCharacter.species, selectedCharacter.className].filter(Boolean).join(" ")}</p></div>{selectedCharacter.canEdit ? <button aria-label={`Edit ${selectedCharacter.name}`} className="icon-button" onClick={() => openEditor(selectedCharacter)} title="Edit character" type="button"><Pencil size={16} /></button> : null}</div><div className="character-public-portrait-frame"><VisualAsset src={selectedCharacter.image} label={`${selectedCharacter.name} full portrait`} className="character-public-portrait" /></div><div className="character-public-copy"><div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> BACKSTORY.MD <span>PLAYER VISIBLE</span></div><p>{selectedCharacter.backstoryMarkdown || "No public backstory recorded yet."}</p></div>{selectedCharacter.physicalDescription ? <div className="character-public-detail"><p className="eyebrow">PHYSICAL APPEARANCE</p><p>{selectedCharacter.physicalDescription}</p></div> : null}</div></section> : null}
  </PageLayout>;
}

type NpcDraft = {
  name: string;
  species: string;
  role: string;
  description: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  placeId: string | null;
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyNpcDraft: NpcDraft = { name: "", species: "", role: "", description: "", playerNotesMarkdown: "", gmNotesMarkdown: "", placeId: null, artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function NpcsView({ npcs: npcRecords, places, campaignId, isGM, onNpcsChange, onAction }: { npcs: NpcRecord[]; places: ApiPlace[]; campaignId: string | null; isGM: boolean; onNpcsChange: Dispatch<SetStateAction<NpcRecord[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNpc, setEditingNpc] = useState<NpcRecord | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<NpcRecord | null>(null);
  const [draft, setDraft] = useState<NpcDraft>(emptyNpcDraft);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const npcAssistant = editorOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/npc" entityLabel="NPC" mode={editingNpc ? "refine" : "create"} requestFields={{ name: draft.name, species: draft.species, role: draft.role }} currentDraft={{ name: draft.name, species: draft.species, role: draft.role, shortDescription: draft.description, playerNotes: draft.playerNotesMarkdown, gmNotes: draft.gmNotesMarkdown, visualPrompt: draft.artSubject }} fields={[{ key: "name", label: "Name", maxLength: 160 }, { key: "species", label: "Species", maxLength: 120 }, { key: "role", label: "Role", maxLength: 160 }, { key: "shortDescription", label: "Description", maxLength: 4000, multiline: true }, { key: "playerNotes", label: "Player notes", maxLength: 20000, multiline: true }, { key: "gmNotes", label: "GM notes", maxLength: 20000, multiline: true }, { key: "visualPrompt", label: "Portrait description", maxLength: 1600, multiline: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, name: candidate.name ?? current.name, species: candidate.species ?? current.species, role: candidate.role ?? current.role, description: candidate.shortDescription ?? current.description, playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown, gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown, artSubject: candidate.visualPrompt ?? current.artSubject }))} /> : null;
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "npc", value: draft.artPath, url: draft.artUrl, subject: draft.artSubject, currentPrompt: draft.artPrompt, onSubjectChange: (subject) => setDraft((current) => ({ ...current, artSubject: subject })), onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);

  const openEditor = (npc?: NpcRecord) => {
    setEditingNpc(npc ?? null);
    setSelectedNpc(npc ?? null);
    setDraft(npc ? { name: npc.name, species: npc.species, role: npc.role, description: npc.description, playerNotesMarkdown: npc.player_notes_markdown, gmNotesMarkdown: npc.gm_notes_markdown ?? "", placeId: npc.place_id, artSubject: npc.art_subject ?? "", artPath: npc.art_path ?? null, artUrl: npc.art_url ?? null, artPrompt: npc.art_prompt, artProvider: npc.art_provider ?? null } : emptyNpcDraft);
    setAssistantOpen(false);
    setError(null);
    setEditorOpen(true);
  };

  const saveNpc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) {
      onAction("Campaign is unavailable. Return to the campaign selector and try again.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/npcs${editingNpc ? `/${encodeURIComponent(editingNpc.id)}` : ""}`, {
        method: editingNpc ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string; npc?: ApiNpc };
      if (!response.ok || !result.npc) throw new Error(result.error ?? "NPC could not be saved.");
      onNpcsChange((current) => {
        if (!editingNpc) return [mapApiNpc(result.npc!, current.length), ...current];
        return current.map((npc, index) => npc.id === editingNpc.id ? mapApiNpc(result.npc!, index) : npc);
      });
      setEditorOpen(false);
      setEditingNpc(null);
      onAction(editingNpc ? `${result.npc.name} updated.` : `${result.npc.name} added to contacts.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "NPC could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNpc = async () => {
    if (!campaignId || !editingNpc || !window.confirm(`Delete ${editingNpc.name} from this campaign?`)) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/npcs/${encodeURIComponent(editingNpc.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "NPC could not be deleted.");
      onNpcsChange((current) => current.filter((npc) => npc.id !== editingNpc.id));
      setEditorOpen(false);
      setEditingNpc(null);
      setSelectedNpc(null);
      onAction(`${editingNpc.name} removed from contacts.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "NPC could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <PageLayout eyebrow="ARCHIVE // CONTACTS" title="NPCs" description="People worth knowing, watching, or avoiding. Their private context stays behind the GM lock." action={isGM ? "ADD NPC" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM CONTACT RECORD</p><h2>{editingNpc ? `Edit ${editingNpc.name}` : "Add an NPC"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE NPC"}</button><button className="icon-button" aria-label="Close NPC editor" onClick={() => setEditorOpen(false)} title="Close NPC editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? npcAssistant : null}<form className="character-form" onSubmit={saveNpc}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))} /></label><label>Role<input maxLength={160} value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} /></label></div><label>Description<textarea maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, playerNotesMarkdown: event.target.value }))} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, gmNotesMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingNpc ? "SAVE CHANGES" : "ADD CONTACT"}</button>{editingNpc ? <button className="button button-danger" disabled={isSaving} onClick={deleteNpc} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    {editorOpen ? <label className="place-quick-field">Primary place<select value={draft.placeId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, placeId: event.target.value || null }))}><option value="">NO PRIMARY PLACE</option>{flattenPlaceTree(places).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}</select></label> : null}{npcRecords.length ? <div className="record-list">{npcRecords.map((npc) => <article aria-label={`Open public file for ${npc.name}`} className="record-row npc-record-row" key={npc.id} onClick={() => setSelectedNpc(npc)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedNpc(npc); } }} role="button" tabIndex={0}><RecordPortrait src={getAttachedArtUrl(npc.art_url, npc.art_path)} label={`${npc.name} portrait`} className={`record-icon record-icon-${npc.color} record-portrait`} fallback={<UserRound size={19} />} /><div className="record-main"><div className="record-title-row"><h3>{npc.name}</h3><StatusPill color={npc.color}>{npc.role || "CONTACT"}</StatusPill></div><p>{npc.description || npc.species || "No public profile recorded."}</p><span className="record-meta"><Map size={13} /> {getPlaceBreadcrumb(places, npc.place_id) || npc.species || "Unclassified contact"}</span></div><div className="record-visibility"><span><BookOpen size={14} /> PLAYER NOTES</span>{isGM ? <span className="private-note"><LockKeyhole size={13} /> GM NOTES</span> : null}</div>{isGM ? <div className="record-row-actions"><button className="icon-button" aria-label={`Edit ${npc.name}`} onClick={(event) => { event.stopPropagation(); openEditor(npc); }} title={`Edit ${npc.name}`} type="button"><Pencil size={15} /></button></div> : null}</article>)}</div> : <div className="character-empty"><UserRound size={22} /><h2>No NPCs recorded yet.</h2><p>{isGM ? "Add the first contact to this campaign archive." : "The GM has not recorded any contacts yet."}</p></div>}
    {selectedNpc && !editorOpen ? <section className="record-detail npc-record-detail"><div className="npc-detail-preview"><RecordPortrait src={getAttachedArtUrl(selectedNpc.art_url, selectedNpc.art_path)} label={`${selectedNpc.name} portrait`} className="npc-detail-portrait record-portrait" fallback={<UserRound size={19} />} /><div className="npc-detail-copy"><div><p className="eyebrow">PUBLIC CONTACT FILE</p><h2>{selectedNpc.name}</h2><p className="record-detail-meta">{selectedNpc.species || "Unclassified"}{" // "}{selectedNpc.role || "Contact"}</p></div><p>{selectedNpc.description || "No public description recorded yet."}</p></div><div className="npc-detail-notes markdown-preview"><div className="preview-toolbar"><BookOpen size={14} /> PLAYER NOTES</div><p>{selectedNpc.player_notes_markdown || "No player notes recorded yet."}</p></div></div></section> : null}
  </PageLayout>;
}

type FactionDraft = { name: string; description: string; status: string; placeId: string | null; artSubject: string; artPath: string | null; artUrl: string | null; artPrompt: string | null; artProvider: string | null };
const emptyFactionDraft: FactionDraft = { name: "", description: "", status: "active", placeId: null, artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function FactionsView({ factions: factionRecords, places, campaignId, isGM, onFactionsChange, onAction }: { factions: FactionRecord[]; places: ApiPlace[]; campaignId: string | null; isGM: boolean; onFactionsChange: Dispatch<SetStateAction<FactionRecord[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFaction, setEditingFaction] = useState<FactionRecord | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<FactionRecord | null>(null);
  const [draft, setDraft] = useState<FactionDraft>(emptyFactionDraft);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const factionAssistant = editorOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/faction" entityLabel="faction" mode={editingFaction ? "refine" : "create"} requestFields={{ name: draft.name, status: draft.status }} currentDraft={{ name: draft.name, status: draft.status, description: draft.description, visualPrompt: draft.artSubject }} fields={[{ key: "name", label: "Name", maxLength: 160 }, { key: "status", label: "Status", maxLength: 80 }, { key: "description", label: "Public description", maxLength: 4000, multiline: true }, { key: "visualPrompt", label: "Emblem or logo description", maxLength: 1600, multiline: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, name: candidate.name ?? current.name, status: candidate.status ?? current.status, description: candidate.description ?? current.description, artSubject: candidate.visualPrompt ?? current.artSubject }))} /> : null;
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "faction", value: draft.artPath, url: draft.artUrl, subject: draft.artSubject, currentPrompt: draft.artPrompt, onSubjectChange: (subject) => setDraft((current) => ({ ...current, artSubject: subject })), onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);

  const openEditor = (faction?: FactionRecord) => {
    if (!isGM) {
      onAction("Only a GM can edit factions.");
      return;
    }
    setEditingFaction(faction ?? null);
    setSelectedFaction(faction ?? null);
    setDraft(faction ? { name: faction.name, description: faction.description, status: faction.status, placeId: faction.place_id, artSubject: faction.art_subject ?? "", artPath: faction.art_path ?? null, artUrl: faction.art_url ?? null, artPrompt: faction.art_prompt, artProvider: faction.art_provider ?? null } : emptyFactionDraft);
    setAssistantOpen(false);
    setError(null);
    setEditorOpen(true);
  };

  const saveFaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) {
      onAction("Campaign is unavailable. Return to the campaign selector and try again.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/factions${editingFaction ? `/${encodeURIComponent(editingFaction.id)}` : ""}`, { method: editingFaction ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = (await response.json()) as { error?: string; faction?: ApiFaction };
      if (!response.ok || !result.faction) throw new Error(result.error ?? "Faction could not be saved.");
      onFactionsChange((current) => {
        if (!editingFaction) return [mapApiFaction(result.faction!, current.length), ...current];
        return current.map((faction, index) => faction.id === editingFaction.id ? mapApiFaction(result.faction!, index) : faction);
      });
      setEditorOpen(false);
      setEditingFaction(null);
      onAction(editingFaction ? `${result.faction.name} updated.` : `${result.faction.name} added to the power map.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Faction could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFaction = async () => {
    if (!campaignId || !editingFaction || !window.confirm(`Delete ${editingFaction.name} from this campaign?`)) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/factions/${encodeURIComponent(editingFaction.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Faction could not be deleted.");
      onFactionsChange((current) => current.filter((faction) => faction.id !== editingFaction.id));
      setEditorOpen(false);
      setEditingFaction(null);
      setSelectedFaction(null);
      onAction(`${editingFaction.name} removed from the power map.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Faction could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <PageLayout eyebrow="ARCHIVE // POWER MAP" title="Factions" description="The groups shaping this campaign. Use them as mission givers and campaign context." action={isGM ? "ADD FACTION" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM FACTION RECORD</p><h2>{editingFaction ? `Edit ${editingFaction.name}` : "Add a faction"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE FACTION"}</button><button className="icon-button" aria-label="Close faction editor" onClick={() => setEditorOpen(false)} title="Close faction editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? factionAssistant : null}<form className="character-form" onSubmit={saveFaction}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Status<input required maxLength={80} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} /></label></div><label>Public description<textarea maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingFaction ? "SAVE CHANGES" : "ADD FACTION"}</button>{editingFaction ? <button className="button button-danger" disabled={isSaving} onClick={deleteFaction} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    {editorOpen ? <label className="place-quick-field">Primary place<select value={draft.placeId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, placeId: event.target.value || null }))}><option value="">NO PRIMARY PLACE</option>{flattenPlaceTree(places).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}</select></label> : null}
    {factionRecords.length ? <div className="faction-grid">{factionRecords.map((faction) => <article aria-label={`Open public file for ${faction.name}`} className={`faction-card faction-${faction.color}`} key={faction.id} onClick={() => setSelectedFaction(faction)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedFaction(faction); } }} role="button" tabIndex={0}><div className="faction-top"><FactionCardArt faction={faction} /><StatusPill color={faction.color}>{faction.status.toUpperCase()}</StatusPill></div><h3>{faction.name}</h3><p>{faction.description || "No public description recorded."}</p><div className="faction-footer"><span><strong>CAMPAIGN</strong><small>{getPlaceBreadcrumb(places, faction.place_id) || "MISSION CONTEXT"}</small></span>{isGM ? <button className="icon-button" aria-label={`Edit ${faction.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openEditor(faction); }} title={`Edit ${faction.name}`} type="button"><Pencil size={15} /></button> : <button className="icon-button" aria-label={`Open ${faction.name}`} onClick={(event) => { event.stopPropagation(); setSelectedFaction(faction); }} title={`Open ${faction.name}`} type="button"><ArrowUpRight size={16} /></button>}</div></article>)}</div> : <div className="character-empty"><Network size={22} /><h2>No factions recorded yet.</h2><p>{isGM ? "Add the first faction to establish campaign context." : "The GM has not recorded any factions yet."}</p></div>}
    {selectedFaction && !editorOpen ? <section className="record-detail"><div className="section-heading"><div><p className="eyebrow">PUBLIC FACTION FILE</p><h2>{selectedFaction.name}</h2><p className="record-detail-meta">{selectedFaction.status.toUpperCase()}</p></div>{isGM ? <button className="button button-secondary" onClick={() => openEditor(selectedFaction)} type="button"><Pencil size={14} /> EDIT FACTION</button> : null}</div><p>{selectedFaction.description || "No public description recorded yet."}</p></section> : null}
  </PageLayout>;
}

function CampaignSettingsView({ campaignId }: { campaignId: string | null }) {
  return <><div className="page-intro"><div><p className="eyebrow eyebrow-bright"><span className="live-dot" /> GAME MASTER CONTROL</p><h1>Campaign settings</h1><p className="intro-copy">Shape which AI models are available when this campaign creates text drafts and visual art.</p></div></div><CampaignAiSettings campaignId={campaignId} /></>;
}

function EpisodesView({ episodes: episodeRecords, places, campaignId }: { episodes: EpisodeRecord[]; places: ApiPlace[]; campaignId: string | null }) {
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeRecord | null>(null);
  const [episodeNotes, setEpisodeNotes] = useState<EpisodeNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEpisode = async (episode: EpisodeRecord) => {
    setSelectedEpisode(episode);
    setError(null);
    if (!campaignId) return;

    setIsLoading(true);
    try {
      const result = await fetchCampaignEpisode(campaignId, episode.id);
      setSelectedEpisode({ ...episode, ...result.episode, accent: episode.accent });
      setEpisodeNotes(result.notes);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load episode details.");
    } finally {
      setIsLoading(false);
    }
  };

  return <PageLayout eyebrow="CAMPAIGN LOG // EPISODES" title="Episodes" description="The campaign record, one transmission at a time.">
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {episodeRecords.length ? <div className="episode-list">{episodeRecords.map((episode) => <article className={`episode-row ${episode.status === "active" ? "episode-current" : ""}`} key={episode.id}><div className={`episode-number episode-number-${episode.accent}`}><span>EP.</span><strong>{episodeRecords.indexOf(episode) + 1}</strong></div><div className="episode-info"><div className="record-title-row"><h3>{episode.title}</h3><StatusPill color={episode.status === "active" ? "cyan" : "muted"}>{episode.status.toUpperCase()}</StatusPill></div><p>{episode.summary || "No public episode brief recorded."}</p><span className="record-meta"><Clock3 size={13} /> {new Date(episode.created_at).toLocaleDateString()} <span className="meta-divider" /> <FileText size={13} /> {episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}{getPlaceBreadcrumb(places, episode.place_id) ? <><span className="meta-divider" /><Map size={13} /> {getPlaceBreadcrumb(places, episode.place_id)}</> : null}</span></div><button className="episode-open" disabled={isLoading} onClick={() => void openEpisode(episode)} type="button">OPEN <ArrowUpRight size={14} /></button></article>)}</div> : <div className="character-empty"><FolderKanban size={22} /><h2>No episodes logged yet.</h2><p>Promote an open job when the crew is ready to make it part of the campaign record.</p></div>}
    {selectedEpisode ? <section className="record-detail"><div className="editor-heading"><div><p className="eyebrow">EPISODE DETAIL // {selectedEpisode.status.toUpperCase()}</p><h2>{selectedEpisode.title}</h2><p className="record-detail-meta">{selectedEpisode.noteCount} {selectedEpisode.noteCount === 1 ? "note" : "notes"} in this episode{getPlaceBreadcrumb(places, selectedEpisode.place_id) ? ` // ${getPlaceBreadcrumb(places, selectedEpisode.place_id)}` : ""}</p></div><button className="icon-button" aria-label="Close episode detail" onClick={() => { setSelectedEpisode(null); setEpisodeNotes([]); }} title="Close episode detail" type="button"><X size={17} /></button></div><p>{selectedEpisode.player_context_markdown || selectedEpisode.summary || "No public episode context recorded yet."}</p>{episodeNotes.length ? <div className="record-list">{episodeNotes.map((note) => <article className="record-row" key={note.id}><div className="record-main"><div className="record-title-row"><h3>{note.title}</h3><span className="record-meta">{note.visibility === "gm" ? "GM ONLY" : "PLAYER"}</span></div><p>{note.body_markdown || "No note body recorded yet."}</p><span className="record-meta">Added by {note.author.displayName}</span></div></article>)}</div> : <p className="record-detail-meta">No visible notes are attached to this episode.</p>}</section> : null}
  </PageLayout>;
}

function MembersView({ members, campaignId, isGM, onMembersChange, onAction }: { members: ApiCampaignMember[]; campaignId: string | null; isGM: boolean; onMembersChange: Dispatch<SetStateAction<ApiCampaignMember[]>>; onAction: (message: string) => void }) {
  const [selectedMember, setSelectedMember] = useState<ApiCampaignMember | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createJoinLink = async () => {
    if (!campaignId) return;

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/join-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUses: 1, expiresAt: null }) });
      const result = (await response.json()) as { error?: string; joinUrl?: string };
      if (!response.ok || !result.joinUrl) throw new Error(result.error ?? "Unable to create join link.");
      setJoinUrl(result.joinUrl);
      onAction("New player join link created.");
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : "Unable to create join link.");
    } finally {
      setIsSaving(false);
    }
  };

  const copyJoinLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      onAction("Join link copied to clipboard.");
    } catch {
      onAction(joinUrl);
    }
  };

  const updateMemberRole = async (role: "gm" | "player") => {
    if (!campaignId || !selectedMember) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(selectedMember.userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const result = (await response.json()) as { error?: string; member?: ApiCampaignMember };
      if (!response.ok || !result.member) throw new Error(result.error ?? "Unable to update campaign member.");
      onMembersChange((current) => current.map((member) => member.userId === result.member!.userId ? result.member! : member));
      setSelectedMember(result.member);
      onAction(`${result.member.displayName} is now ${role === "gm" ? "a GM" : "a player"}.`);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update campaign member.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeMember = async () => {
    if (!campaignId || !selectedMember || !window.confirm(`Remove ${selectedMember.displayName} from this campaign?`)) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(selectedMember.userId)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to remove campaign member.");
      onMembersChange((current) => current.filter((member) => member.userId !== selectedMember.userId));
      onAction(`${selectedMember.displayName} removed from the campaign.`);
      setSelectedMember(null);
    } catch (removeError: unknown) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove campaign member.");
    } finally {
      setIsSaving(false);
    }
  };

  return <PageLayout eyebrow="CAMPAIGN ADMIN // MEMBERS" title="Crew access" description="Manage who can see the campaign and who is trusted to shape it." action={isGM ? "CREATE JOIN LINK" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => isGM ? void createJoinLink() : onAction("Only a GM can create join links.")}>
    <div className="member-summary"><div><p className="eyebrow">ACCESS MODEL</p><h2>One campaign. Two levels of clearance.</h2><p>Player-visible content is shared by default. GM notes, mission controls, and campaign administration stay behind the command lock.</p></div><div className="clearance-key"><span><i className="legend-dot dot-cyan" /> PLAYER VISIBLE</span><span><i className="legend-dot dot-pink" /> GM ONLY</span></div></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {members.length ? <div className="member-list">{members.map((member, index) => <div className="member-row" key={member.userId}><div className="avatar" style={{ backgroundColor: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4] }}>{member.displayName.slice(0, 2).toUpperCase()}</div><div className="member-copy"><strong>{member.displayName}</strong><span>{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div><StatusPill color={member.role === "gm" ? "amber" : "cyan"}>{member.role === "gm" ? "OWNER" : "ACTIVE"}</StatusPill><span className="member-last">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>{isGM ? <button className="icon-button" aria-label={`Open ${member.displayName} options`} onClick={() => { setSelectedMember(member); setError(null); }} title="Member options" type="button"><MoreHorizontal size={17} /></button> : null}</div>)}</div> : <div className="character-empty"><UsersRound size={22} /><h2>No campaign members yet.</h2><p>Invite a player to establish the crew manifest.</p></div>}
    {selectedMember ? <section className="record-detail"><div className="editor-heading"><div><p className="eyebrow">MEMBER ACCESS // {selectedMember.role.toUpperCase()}</p><h2>{selectedMember.displayName}</h2><p className="record-detail-meta">Joined {new Date(selectedMember.joinedAt).toLocaleDateString()}</p></div><button className="icon-button" aria-label="Close member details" onClick={() => setSelectedMember(null)} title="Close member details" type="button"><X size={17} /></button></div><div className="character-form-actions"><button className="button button-secondary" disabled={isSaving || selectedMember.role === "gm"} onClick={() => void updateMemberRole("gm")} type="button">MAKE GM</button><button className="button button-secondary" disabled={isSaving || selectedMember.role === "player"} onClick={() => void updateMemberRole("player")} type="button">MAKE PLAYER</button><button className="button button-danger" disabled={isSaving} onClick={() => void removeMember()} type="button">REMOVE</button></div></section> : null}
    {joinUrl ? <div className="join-link-card"><div className="join-link-icon"><Send size={18} /></div><div><p className="eyebrow">PLAYER JOIN LINK</p><h3>{joinUrl}</h3><p>One use - no expiration</p></div><button className="button button-secondary" disabled={isSaving} onClick={() => void copyJoinLink()} type="button">COPY LINK</button></div> : null}
  </PageLayout>;
}
