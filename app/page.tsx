"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import AuthPrompt from "@/components/auth/AuthPrompt";
import SignOutButton from "@/components/auth/SignOutButton";
import { CampaignArtEditorSlot, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import CampaignAiSettings from "@/components/archive/CampaignAiSettings";
import CampaignNotesView, { type ApiCampaignNote, type CampaignNote } from "@/components/archive/CampaignNotesView";
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

type NavId = "overview" | "characters" | "npcs" | "factions" | "jobs" | "episodes" | "notes" | "members" | "settings";

type CampaignRecord = {
  id: string;
  name: string;
  system: string;
  description: string;
  created_by: string;
};

type CampaignMembership = {
  role: "gm" | "player";
  display_name: string;
  campaign: CampaignRecord | CampaignRecord[] | null;
};

type Mission = {
  id: string;
  title: string;
  category: string;
  summary: string;
  giver: string;
  giverType: "NPC" | "FACTION";
  votes: number;
  accent: "cyan" | "pink" | "amber";
  image: string | null;
  voted: boolean;
  status: "draft" | "open" | "promoted" | "archived";
  playerNotesMarkdown: string;
  giverId: string;
  artPath?: string | null;
  artUrl?: string | null;
  artPrompt?: string | null;
  artProvider?: string | null;
};

type ApiJob = {
  id: string;
  title: string;
  summary: string;
  status: "draft" | "open" | "promoted" | "archived";
  player_notes_markdown: string;
  giver_npc_id: string | null;
  giver_faction_id: string | null;
  art_path: string | null;
  art_url?: string | null;
  art_prompt: string | null;
  art_provider: string | null;
  giver: { type: "NPC" | "FACTION"; name: string };
  votes: number;
  voted: boolean;
};

type ApiCharacter = {
  id: string;
  owner_id: string;
  name: string;
  species: string;
  class_name: string;
  level: number;
  backstory_markdown: string;
  art_path: string | null;
  art_url?: string | null;
  art_prompt: string | null;
  art_provider?: string | null;
};

type ApiNpc = {
  id: string;
  author_id: string;
  name: string;
  species: string;
  role: string;
  description: string;
  player_notes_markdown: string;
  gm_notes_markdown?: string;
  art_path: string | null;
  art_url?: string | null;
  art_prompt: string | null;
  art_provider?: string | null;
};

type ApiFaction = {
  id: string;
  author_id: string;
  name: string;
  description: string;
  status: string;
  art_path: string | null;
  art_url?: string | null;
  art_prompt: string | null;
  art_provider?: string | null;
};

type ApiEpisode = {
  id: string;
  campaign_id: string;
  source_job_id: string | null;
  created_by: string;
  title: string;
  summary: string;
  player_context_markdown: string;
  status: "planned" | "active" | "complete" | "archived";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  noteCount: number;
};

type EpisodeNote = {
  id: string;
  title: string;
  body_markdown: string;
  visibility: "player" | "gm";
  author_id: string;
  created_at: string;
  updated_at: string;
  author: { id: string; displayName: string };
  permissions: { canEdit: boolean; canDelete: boolean };
};

type ApiCampaignMember = { userId: string; role: "gm" | "player"; displayName: string; joinedAt: string };

type EpisodeRecord = ApiEpisode & { accent: "cyan" | "pink" | "amber" };

type NpcRecord = ApiNpc & { color: "pink" | "cyan" | "amber" };
type FactionRecord = ApiFaction & { color: "pink" | "cyan" | "amber" };

type Character = {
  id: string;
  name: string;
  species: string;
  className: string;
  subtitle: string;
  detail: string;
  color: "pink" | "cyan" | "purple" | "amber";
  image: string | null;
  status: "ACTIVE" | "RESTING";
  backstoryMarkdown: string;
  artPath?: string | null;
  artUrl?: string | null;
  artPrompt?: string | null;
  artProvider?: string | null;
};

type CharacterDraft = {
  name: string;
  species: string;
  className: string;
  level: number;
  backstoryMarkdown: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};
function mapApiJob(job: ApiJob, index: number): Mission {
  const accent = (["cyan", "pink", "amber"] as const)[index % 3];
  const image = getAttachedArtUrl(job.art_url, job.art_path);

  return {
    id: job.id,
    title: job.title,
    category: `${job.status.toUpperCase()} SIGNAL`,
    summary: job.summary || "No public mission brief recorded.",
    giver: job.giver.name,
    giverType: job.giver.type,
    votes: job.votes,
    accent,
    image,
    voted: job.voted,
    status: job.status,
    playerNotesMarkdown: job.player_notes_markdown,
    giverId: job.giver_npc_id ?? job.giver_faction_id ?? "",
    artPath: job.art_path,
    artUrl: job.art_url ?? null,
    artPrompt: job.art_prompt,
    artProvider: job.art_provider,
  };
}

function getCampaignRecord(membership: CampaignMembership) {
  return Array.isArray(membership.campaign) ? membership.campaign[0] : membership.campaign;
}

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
  { label: "Archive", items: [{ id: "characters", label: "Characters", icon: UsersRound, count: "06" }, { id: "npcs", label: "NPCs", icon: UserRound, count: "14" }, { id: "factions", label: "Factions", icon: Network, count: "05" }, { id: "notes", label: "Campaign notes", icon: FileText, count: "21" }] },
  { label: "Control", items: [{ id: "settings", label: "Campaign settings", icon: SlidersHorizontal }] },
];

function mapApiCharacter(character: ApiCharacter, index: number): Character {
  const colors = ["pink", "cyan", "purple", "amber"] as const;
  const subtitle = [character.species, character.class_name].filter(Boolean).join(" ") || "Unclassified crew member";
  const detail = `${character.class_name || "Unassigned class"} // Level ${character.level}`;

  return {
    id: character.id,
    name: character.name,
    species: character.species,
    className: character.class_name,
    subtitle,
    detail,
    color: colors[index % colors.length],
    image: getAttachedArtUrl(character.art_url, character.art_path),
    status: "ACTIVE",
    backstoryMarkdown: character.backstory_markdown,
    artPath: character.art_path,
    artUrl: character.art_url ?? null,
    artPrompt: character.art_prompt,
    artProvider: character.art_provider ?? null,
  };
}

function mapApiNpc(npc: ApiNpc, index: number): NpcRecord {
  return { ...npc, color: (["cyan", "amber", "pink"] as const)[index % 3] };
}

function mapApiFaction(faction: ApiFaction, index: number): FactionRecord {
  return { ...faction, color: (["pink", "cyan", "amber"] as const)[index % 3] };
}

function mapApiNote(note: ApiCampaignNote, index: number): CampaignNote {
  return { ...note, accent: (["cyan", "pink", "amber", "purple"] as const)[index % 4] };
}

function mapApiEpisode(episode: ApiEpisode, index: number): EpisodeRecord {
  return { ...episode, accent: (["cyan", "pink", "amber"] as const)[index % 3] };
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

const emptyCharacterDraft: CharacterDraft = { name: "", species: "", className: "", level: 1, backstoryMarkdown: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function toCharacterDraft(character: Character): CharacterDraft {
  return { name: character.name, species: character.species, className: character.className, level: Number(character.detail.match(/Level (\d+)/)?.[1] ?? 1), backstoryMarkdown: character.backstoryMarkdown, artPath: character.artPath ?? null, artUrl: character.artUrl ?? null, artPrompt: character.artPrompt ?? null, artProvider: character.artProvider ?? null };
}

function VisualAsset({ src, label, className = "" }: { src: string | null; label: string; className?: string }) {
  return <div aria-label={label} className={`visual-asset ${className} ${src ? "has-asset" : "no-asset"}`} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

function getAttachedArtUrl(signedUrl: string | null | undefined, path: string | null | undefined) {
  return signedUrl ?? (path?.startsWith("http") ? path : null);
}

function RecordPortrait({ src, label, className, fallback }: { src: string | null; label: string; className: string; fallback: React.ReactNode }) {
  return <div aria-label={label} className={className} role={src ? "img" : undefined} style={src ? { backgroundImage: `url(${src})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{src ? null : fallback}</div>;
}

function StatusPill({ children, color = "cyan" }: { children: React.ReactNode; color?: string }) {
  return <span className={`status-pill status-${color}`}>{children}</span>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && onAction ? <button className="text-action" onClick={onAction} type="button">{action} <ArrowUpRight size={14} /></button> : null}</div>;
}

function AppStatus({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <main className="app-status-shell"><section className="app-status-panel"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> STAR BOARD</p><h1>{title}</h1><p>{message}</p>{action}</section></main>;
}

export default function Home() {
  const [activeView, setActiveView] = useState<NavId>("overview");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [npcRecords, setNpcRecords] = useState<NpcRecord[]>([]);
  const [factionRecords, setFactionRecords] = useState<FactionRecord[]>([]);
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
    const requestedCampaignId = new URLSearchParams(window.location.search).get("campaignId");
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

        const [jobsResult, charactersResult, npcsResult, factionsResult, notesResult, episodesResult, membersResult] = await Promise.all([
          fetchCampaignJobs(requestedCampaignId),
          fetchCampaignCharacters(requestedCampaignId),
          fetchCampaignNpcs(requestedCampaignId),
          fetchCampaignFactions(requestedCampaignId),
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
  }, []);
  const handleVote = (id: string) => {
    const chosen = missions.find((mission) => mission.id === id);
    if (!chosen) return;
    const wasVoted = chosen.voted;
    setMissions((current) => current.map((mission) => {
      if (mission.id === id) return { ...mission, voted: !wasVoted, votes: wasVoted ? mission.votes - 1 : mission.votes + 1 };
      if (!wasVoted && mission.voted) return { ...mission, voted: false, votes: mission.votes - 1 };
      return mission;
    }));
    if (campaignIdRef.current) {
      const selectedCampaignId = campaignIdRef.current;
      const method = wasVoted ? "DELETE" : "POST";
      void fetch(`/api/campaigns/${encodeURIComponent(selectedCampaignId)}/jobs/${encodeURIComponent(id)}/vote`, { method }).then(async (response) => {
        if (!response.ok) throw new Error("Vote could not be synchronized.");
        const result = await fetchCampaignJobs(selectedCampaignId);
        setMissions(result.jobs.map(mapApiJob));
        setIsGM(result.role === "gm");
      }).catch((error: unknown) => notify(error instanceof Error ? error.message : "Vote could not be synchronized."));
    }
    notify(wasVoted ? `Vote removed from ${chosen.title}` : `Vote locked on ${chosen.title}`);
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
  const selectView = (id: NavId) => { setActiveView(id); setMobileNavOpen(false); };
  const overviewMetrics = getOverviewMetrics(missions, memberRecords, noteRecords, episodeRecords);
  const countByNavId: Partial<Record<NavId, number>> = {
    jobs: overviewMetrics.openJobs,
    episodes: overviewMetrics.episodes,
    characters: characters.length,
    npcs: npcRecords.length,
    factions: factionRecords.length,
    notes: overviewMetrics.notes,
  };
  const displayedNavItems = navItems.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.id !== "settings" || isGM).map((item) => ({ ...item, count: item.id === "settings" ? undefined : String(countByNavId[item.id] ?? 0).padStart(2, "0") })),
  }));
  const activeLabel = navItems.flatMap((group) => group.items).find((item) => item.id === activeView)?.label ?? "Overview";

  if (authRequired) return <AuthPrompt nextPath={requestedPath} />;
  if (isLoading) return <AppStatus title="Loading campaign signal." message="Checking your access and assembling the campaign records." />;
  if (loadError) return <AppStatus title="Campaign signal unavailable." message={loadError} action={<button className="button button-secondary" onClick={() => window.location.reload()} type="button">RETRY LOAD</button>} />;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup"><div className="brand-symbol"><Orbit size={21} strokeWidth={1.8} /></div><div><p className="brand-name">STAR BOARD</p><p className="brand-subtitle">CAMPAIGN OPERATIONS</p></div><button aria-label="Close navigation" className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} title="Close navigation" type="button"><X size={18} /></button></div>
        <button className="campaign-switcher" onClick={() => window.location.assign("/campaigns")} type="button"><div className="campaign-orb"><Hexagon size={18} /></div><div className="campaign-switcher-copy"><span className="micro-label">ACTIVE CAMPAIGN</span><strong>{campaign?.name}</strong></div><ChevronDown size={15} className="muted-icon" /></button>
        <nav className="side-nav" aria-label="Campaign navigation">{displayedNavItems.map((group) => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map((item) => { const Icon = item.icon; return <button className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`} key={item.id} onClick={() => selectView(item.id)} type="button"><Icon size={17} strokeWidth={activeView === item.id ? 2.1 : 1.7} /><span>{item.label}</span>{item.count ? <span className="nav-count">{item.count}</span> : null}</button>; })}</div>)}</nav>
        <div className="side-footer"><div className="sync-status"><span className="live-dot" /> SUPABASE SYNC ACTIVE</div><div className="profile-row"><div className="avatar avatar-user">{displayName.slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><span>{isGM ? "GAME MASTER" : "PLAYER"}</span></div></div><SignOutButton className="nav-item signout-nav-item" label="Sign out" /></div>
      </aside>

      <div className="app-content">
        <header className="topbar"><div className="topbar-left"><button aria-label="Open navigation" className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} title="Open navigation" type="button"><Menu size={20} /></button><div className="crumb-mark"><Command size={14} /></div><span className="crumb-muted">{campaign?.name}</span><ChevronRight size={14} className="muted-icon" /><span className="crumb-current">{activeLabel.toUpperCase()}</span></div><div className="topbar-right"><SignOutButton compact className="icon-button" /></div></header>
        <div className="content-frame">{activeView === "overview" ? <OverviewView campaign={campaign!} missions={missions} characters={characters} npcs={npcRecords} factions={factionRecords} members={memberRecords} notes={noteRecords} episodes={episodeRecords} isGM={isGM} onVote={handleVote} onOpenView={selectView} /> : activeView === "jobs" ? <JobsView missions={missions} campaignId={campaignId} isGM={isGM} npcs={npcRecords} factions={factionRecords} onMissionsChange={setMissions} onVote={handleVote} onPromote={handlePromote} onAction={notify} /> : activeView === "characters" ? <CharactersView characters={characters} campaignId={campaignId} isGM={isGM} onCharactersChange={setCharacters} onAction={notify} /> : activeView === "npcs" ? <NpcsView npcs={npcRecords} campaignId={campaignId} isGM={isGM} onNpcsChange={setNpcRecords} onAction={notify} /> : activeView === "factions" ? <FactionsView factions={factionRecords} campaignId={campaignId} isGM={isGM} onFactionsChange={setFactionRecords} onAction={notify} /> : activeView === "episodes" ? <EpisodesView episodes={episodeRecords} campaignId={campaignId} /> : activeView === "notes" ? <CampaignNotesView notes={noteRecords} episodes={episodeRecords} campaignId={campaignId} isGM={isGM} onNotesChange={setNoteRecords} onAction={notify} /> : activeView === "settings" ? <CampaignSettingsView campaignId={campaignId} /> : <MembersView members={memberRecords} campaignId={campaignId} isGM={isGM} onMembersChange={setMemberRecords} onAction={notify} />}</div>
      </div>
      {toast ? <div className="toast"><span className="toast-icon"><Radio size={14} /></span><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)} title="Dismiss notification" type="button"><X size={14} /></button></div> : null}
    </main>
  );
}

function OverviewView({ campaign, missions, characters, npcs, factions, members, notes, episodes, isGM, onVote, onOpenView }: { campaign: CampaignRecord; missions: Mission[]; characters: Character[]; npcs: NpcRecord[]; factions: FactionRecord[]; members: ApiCampaignMember[]; notes: CampaignNote[]; episodes: EpisodeRecord[]; isGM: boolean; onVote: (id: string) => void; onOpenView: (id: NavId) => void }) {
  const metrics = getOverviewMetrics(missions, members, notes, episodes);
  const roster = members.map((member, index) => ({ ...member, initials: member.displayName.slice(0, 2).toUpperCase(), color: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4] }));

  return <><div className="page-intro overview-intro"><div><p className="eyebrow eyebrow-bright"><span className="live-dot" /> {campaign.system.toUpperCase()} {"//"} CAMPAIGN OVERVIEW</p><h1>{campaign.name}</h1><p className="intro-copy">{campaign.description || "No campaign brief recorded yet."}</p></div><div className="intro-actions"><div className="last-sync"><span>CAMPAIGN RECORDS</span><strong>LIVE</strong></div><button className="button button-primary" onClick={() => onOpenView("jobs")} type="button"><Plus size={16} /> {isGM ? "OPEN JOB BOARD" : "VIEW JOB BOARD"}</button></div></div>
    <div className="signal-strip"><div className="signal-strip-pattern" /><div className="signal-copy"><span className="micro-label">CAMPAIGN BRIEF</span><strong>{campaign.description || "No public campaign brief recorded yet."}</strong></div><div className="signal-stats"><span><strong>{String(metrics.openJobs).padStart(2, "0")}</strong> OPEN JOBS</span><span><strong>{String(metrics.activeVotes).padStart(2, "0")}</strong> VOTED JOBS</span><span><strong>{String(metrics.episodes).padStart(2, "0")}</strong> EPISODES</span></div><Zap size={18} className="signal-zap" /></div>
    <div className="metric-grid"><MetricCard label="Crew roster" value={String(metrics.members).padStart(2, "0")} detail={`${metrics.players} players / ${metrics.gms} GM${metrics.gms === 1 ? "" : "s"}`} icon={UsersRound} accent="cyan" /><MetricCard label="Campaign notes" value={String(metrics.notes).padStart(2, "0")} detail={`${metrics.notesThisWeek} updated in last 7 days`} icon={FileText} accent="pink" /><MetricCard label="Episodes logged" value={String(metrics.episodes).padStart(2, "0")} detail={metrics.latestEpisodeTitle ?? "No episodes logged"} icon={FolderKanban} accent="amber" /><MetricCard label="GM signals" value={String(metrics.draftSignals).padStart(2, "0")} detail={`${metrics.draftSignals} drafts / ${metrics.openJobs} open`} icon={Bot} accent="purple" /></div>
    <div className="dashboard-grid"><section className="panel panel-jobboard"><div className="panel-topline"><div><p className="eyebrow">MISSION CONTROL</p><h2>Job board</h2></div></div>{missions.length ? <div className="job-list">{missions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} compact />)}</div> : <div className="character-empty overview-empty"><BriefcaseBusiness size={22} /><h2>No jobs recorded yet.</h2><p>{isGM ? "Open the job board to create the campaign's first signal." : "The GM has not posted a job yet."}</p></div>}<button className="panel-footer-action" onClick={() => onOpenView("jobs")} type="button">VIEW ALL JOBS <ArrowUpRight size={14} /></button></section>
      <aside className="right-rail"><section className="panel crew-panel"><SectionHeading eyebrow="CREW MANIFEST" title="On the roster" action="Manage" onAction={() => onOpenView("members")} />{roster.length ? <div className="crew-list">{roster.map((member) => <div className="crew-row" key={member.userId}><div className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</div><div className="crew-copy"><strong>{member.displayName}</strong><span>{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div></div>)}</div> : <div className="character-empty overview-empty"><UsersRound size={22} /><h2>No crew members yet.</h2><p>Campaign access has not been established.</p></div>}</section><section className="panel snapshot-panel"><div className="panel-topline"><div><p className="eyebrow">CAMPAIGN SNAPSHOT</p><h2>Record coverage</h2></div><Activity size={17} className="accent-icon-cyan" /></div><div className="snapshot-list"><button onClick={() => onOpenView("characters")} type="button"><UsersRound size={15} /> <span>Characters</span><strong>{characters.length}</strong></button><button onClick={() => onOpenView("npcs")} type="button"><UserRound size={15} /> <span>NPCs</span><strong>{npcs.length}</strong></button><button onClick={() => onOpenView("factions")} type="button"><Network size={15} /> <span>Factions</span><strong>{factions.length}</strong></button></div></section></aside></div></>;
}

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-head"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{detail}</small><div className="metric-bar"><span /></div></div>; }

function MissionCard({ mission, isGM, index, onVote, onEdit, onPromote, compact = false }: { mission: Mission; isGM: boolean; index: number; onVote: (id: string) => void; onEdit?: () => void; onPromote?: (id: string) => void; compact?: boolean }) {
  return <article className={`mission-card mission-${mission.accent} ${compact ? "mission-compact" : ""}`}><VisualAsset src={mission.image} label={`${mission.title} artwork`} className="mission-art" /><div className="mission-art-overlay" /><div className="mission-index">0{index + 1}</div><div className="mission-content"><div className="mission-meta"><StatusPill color={mission.accent}>{mission.category}</StatusPill></div><h3>{mission.title}</h3><p>{mission.summary}</p><div className="mission-footer"><span className="giver"><span className="giver-glyph">{mission.giverType === "NPC" ? "N" : "F"}</span><span><small>{mission.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</small><strong>{mission.giver}</strong></span></span></div></div><div className="mission-vote"><span><strong>{mission.votes.toString().padStart(2, "0")}</strong> votes</span><button className={`vote-button ${mission.voted ? "vote-active" : ""}`} onClick={() => onVote(mission.id)} type="button"><Vote size={15} /> {mission.voted ? "VOTED" : "VOTE"}</button>{isGM && onEdit ? <button className="mission-more icon-button" aria-label={`Edit ${mission.title}`} onClick={onEdit} title="Edit mission" type="button"><MoreHorizontal size={16} /></button> : null}{isGM && mission.status === "open" && onPromote ? <button className="mission-more mission-promote icon-button" aria-label={`Promote ${mission.title} to an episode`} onClick={() => onPromote(mission.id)} title="Promote to episode" type="button"><Sparkles size={16} /></button> : null}</div></article>;
}

type JobDraft = { title: string; summary: string; playerNotesMarkdown: string; giverType: "npc" | "faction"; giverId: string; status: "draft" | "open" | "archived"; artPath: string | null; artUrl: string | null; artPrompt: string | null; artProvider: string | null };
const emptyJobDraft: JobDraft = { title: "", summary: "", playerNotesMarkdown: "", giverType: "npc", giverId: "", status: "draft", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function JobsView({ missions, campaignId, isGM, npcs, factions, onMissionsChange, onVote, onPromote, onAction }: { missions: Mission[]; campaignId: string | null; isGM: boolean; npcs: NpcRecord[]; factions: FactionRecord[]; onMissionsChange: Dispatch<SetStateAction<Mission[]>>; onVote: (id: string) => void; onPromote: (id: string) => void; onAction: (message: string) => void }) {
  const [filter, setFilter] = useState<"open" | "archived" | "drafts">("open");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [draft, setDraft] = useState<JobDraft>(emptyJobDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "job", value: draft.artPath, url: draft.artUrl, currentPrompt: draft.artPrompt, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);

  const filteredMissions = missions.filter((mission) => filter === "drafts" ? mission.status === "draft" : mission.status === filter);
  const openEditor = (mission?: Mission) => {
    if (!isGM) {
      onAction("Only a GM can edit missions.");
      return;
    }
    setEditingMission(mission ?? null);
    setDraft(mission ? { title: mission.title, summary: mission.summary, playerNotesMarkdown: mission.playerNotesMarkdown, giverType: mission.giverType.toLowerCase() as JobDraft["giverType"], giverId: mission.giverId, status: mission.status === "promoted" ? "open" : mission.status, artPath: mission.artPath ?? null, artUrl: mission.artUrl ?? null, artPrompt: mission.artPrompt ?? null, artProvider: mission.artProvider ?? null } : emptyJobDraft);
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

  return <PageLayout eyebrow={`MISSION CONTROL // ${filterCount("open")} OPEN`} title="Job board" description="Potential missions, ranked by the crew. Choose the signal that pulls hardest." action={isGM ? "NEW MISSION" : undefined} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM MISSION EDITOR</p><h2>{editingMission ? `Edit ${editingMission.title}` : "New mission"}</h2></div><button className="icon-button" aria-label="Close mission editor" onClick={() => setEditorOpen(false)} title="Close mission editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveJob}><div className="character-form-grid"><label>Title<input required maxLength={160} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label><label>Status<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as JobDraft["status"] }))}><option value="draft">DRAFT</option><option value="open">OPEN</option><option value="archived">ARCHIVED</option></select></label><label>Giver type<select value={draft.giverType} onChange={(event) => setDraft((current) => ({ ...current, giverType: event.target.value as JobDraft["giverType"], giverId: "" }))}><option value="npc">NPC</option><option value="faction">FACTION</option></select></label><label>Giver<select required value={draft.giverId} onChange={(event) => setDraft((current) => ({ ...current, giverId: event.target.value }))}><option value="">Select a giver</option>{(draft.giverType === "npc" ? npcs : factions).map((giver) => <option key={giver.id} value={giver.id}>{giver.name}</option>)}</select></label></div><label>Summary<textarea maxLength={4000} value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} /></label><label>Player context<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, playerNotesMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingMission ? "SAVE CHANGES" : "ADD MISSION"}</button>{editingMission && editingMission.status !== "promoted" ? <button className="button button-danger" disabled={isSaving} onClick={() => void deleteJob()} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    <div className="view-toolbar"><div className="filter-tabs"><button className={`filter-tab ${filter === "open" ? "filter-tab-active" : ""}`} onClick={() => setFilter("open")} type="button">OPEN <span>{filterCount("open")}</span></button><button className={`filter-tab ${filter === "archived" ? "filter-tab-active" : ""}`} onClick={() => setFilter("archived")} type="button">ARCHIVED <span>{filterCount("archived")}</span></button>{isGM ? <button className={`filter-tab ${filter === "drafts" ? "filter-tab-active" : ""}`} onClick={() => setFilter("drafts")} type="button">DRAFTS <span>{filterCount("draft")}</span></button> : null}</div></div>
    {filteredMissions.length ? <div className="jobs-grid">{filteredMissions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} onEdit={isGM ? () => openEditor(mission) : undefined} onPromote={isGM ? onPromote : undefined} />)}</div> : <div className="character-empty"><BriefcaseBusiness size={22} /><h2>No missions in this view.</h2><p>{filter === "drafts" ? "Draft the next signal when the GM is ready." : "The campaign board has no missions here yet."}</p></div>}
  </PageLayout>;
}

function CharactersView({ characters, campaignId, isGM, onCharactersChange, onAction }: { characters: Character[]; campaignId: string | null; isGM: boolean; onCharactersChange: Dispatch<SetStateAction<Character[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [draft, setDraft] = useState<CharacterDraft>(emptyCharacterDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "character", value: draft.artPath, url: draft.artUrl, currentPrompt: draft.artPrompt, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);
  const featuredCharacter = characters[0] ?? null;

  const openEditor = (character?: Character) => {
    setEditingCharacter(character ?? null);
    setDraft(character ? toCharacterDraft(character) : emptyCharacterDraft);
    setError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingCharacter(null);
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
      onCharactersChange((current) => {
        if (!editingCharacter) return [...current, mapApiCharacter(savedCharacter, current.length)];
        return current.map((character, index) => character.id === editingCharacter.id ? mapApiCharacter(savedCharacter, index) : character);
      });
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
      closeEditor();
      onAction(`${editingCharacter.name} removed from the roster.`);
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Character could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  };

  return <PageLayout eyebrow="ARCHIVE // CREW ROSTER" title="Characters" description="The people, androids, and mysteries currently recorded in this campaign." action="ADD CHARACTER" onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">{isGM ? "GM / PLAYER RECORD" : "PLAYER RECORD"}</p><h2>{editingCharacter ? `Edit ${editingCharacter.name}` : "Add a character"}</h2></div><button className="icon-button" aria-label="Close character editor" onClick={closeEditor} title="Close character editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveCharacter}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))} /></label><label>Class<input maxLength={160} value={draft.className} onChange={(event) => setDraft((current) => ({ ...current, className: event.target.value }))} /></label><label>Level<input type="number" min="1" max="20" value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: Number(event.target.value) }))} /></label></div><label>Backstory<textarea maxLength={20000} placeholder="Write what the crew knows about this character." value={draft.backstoryMarkdown} onChange={(event) => setDraft((current) => ({ ...current, backstoryMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingCharacter ? "SAVE CHANGES" : "ADD TO ROSTER"}</button>{editingCharacter ? <button className="button button-danger" disabled={isSaving} onClick={deleteCharacter} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={closeEditor} type="button">CANCEL</button></div></form></section> : null}
    {characters.length ? <div className="character-grid">{characters.map((character) => <article className="character-card" key={character.id}><VisualAsset src={character.image} label={`${character.name} portrait`} className={`character-art character-${character.color}`} /><div className="character-body"><div className="card-status-row"><StatusPill color={character.status === "ACTIVE" ? "cyan" : "muted"}>{character.status}</StatusPill><button className="icon-button" aria-label={`Open ${character.name} options`} onClick={() => openEditor(character)} title="Character options" type="button"><MoreHorizontal size={16} /></button></div><h3>{character.name}</h3><p>{character.subtitle}</p><span className="mono-detail">{character.detail}</span><button className="card-link" onClick={() => openEditor(character)} type="button">OPEN RECORD <ArrowUpRight size={13} /></button></div></article>)}</div> : <div className="character-empty"><UsersRound size={22} /><h2>No characters in the roster yet.</h2><p>Add the first crew record to begin the campaign manifest.</p></div>}
    {featuredCharacter ? <section className="lower-band"><div className="lower-copy"><p className="eyebrow">PLAYER VIEW</p><h2>{featuredCharacter.name}&apos;s public record.</h2><p>Characters can carry a portrait, a Markdown backstory, and the notes their players want the crew to know.</p></div><div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> BACKSTORY.MD <span>PLAYER VISIBLE</span></div><p>{featuredCharacter.backstoryMarkdown || "No public backstory recorded yet."}</p></div></section> : null}
  </PageLayout>;
}

type NpcDraft = {
  name: string;
  species: string;
  role: string;
  description: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyNpcDraft: NpcDraft = { name: "", species: "", role: "", description: "", playerNotesMarkdown: "", gmNotesMarkdown: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function NpcsView({ npcs: npcRecords, campaignId, isGM, onNpcsChange, onAction }: { npcs: NpcRecord[]; campaignId: string | null; isGM: boolean; onNpcsChange: Dispatch<SetStateAction<NpcRecord[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNpc, setEditingNpc] = useState<NpcRecord | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<NpcRecord | null>(null);
  const [draft, setDraft] = useState<NpcDraft>(emptyNpcDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "npc", value: draft.artPath, url: draft.artUrl, currentPrompt: draft.artPrompt, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);

  const openEditor = (npc?: NpcRecord) => {
    setEditingNpc(npc ?? null);
    setSelectedNpc(npc ?? null);
    setDraft(npc ? { name: npc.name, species: npc.species, role: npc.role, description: npc.description, playerNotesMarkdown: npc.player_notes_markdown, gmNotesMarkdown: npc.gm_notes_markdown ?? "", artPath: npc.art_path ?? null, artUrl: npc.art_url ?? null, artPrompt: npc.art_prompt, artProvider: npc.art_provider ?? null } : emptyNpcDraft);
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

  return <PageLayout eyebrow="ARCHIVE // CONTACTS" title="NPCs" description="People worth knowing, watching, or avoiding. Their private context stays behind the GM lock." action={isGM ? "ADD NPC" : undefined} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM CONTACT RECORD</p><h2>{editingNpc ? `Edit ${editingNpc.name}` : "Add an NPC"}</h2></div><button className="icon-button" aria-label="Close NPC editor" onClick={() => setEditorOpen(false)} title="Close NPC editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveNpc}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))} /></label><label>Role<input maxLength={160} value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} /></label></div><label>Description<textarea maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, playerNotesMarkdown: event.target.value }))} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, gmNotesMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingNpc ? "SAVE CHANGES" : "ADD CONTACT"}</button>{editingNpc ? <button className="button button-danger" disabled={isSaving} onClick={deleteNpc} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    {npcRecords.length ? <div className="record-list">{npcRecords.map((npc) => <article aria-label={`Open public file for ${npc.name}`} className="record-row npc-record-row" key={npc.id} onClick={() => setSelectedNpc(npc)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedNpc(npc); } }} role="button" tabIndex={0}><RecordPortrait src={getAttachedArtUrl(npc.art_url, npc.art_path)} label={`${npc.name} portrait`} className={`record-icon record-icon-${npc.color} record-portrait`} fallback={<UserRound size={19} />} /><div className="record-main"><div className="record-title-row"><h3>{npc.name}</h3><StatusPill color={npc.color}>{npc.role || "CONTACT"}</StatusPill></div><p>{npc.description || npc.species || "No public profile recorded."}</p><span className="record-meta"><Map size={13} /> {npc.species || "Unclassified contact"}</span></div><div className="record-visibility"><span><BookOpen size={14} /> PLAYER NOTES</span>{isGM ? <span className="private-note"><LockKeyhole size={13} /> GM NOTES</span> : null}</div>{isGM ? <div className="record-row-actions"><button className="icon-button" aria-label={`Edit ${npc.name}`} onClick={(event) => { event.stopPropagation(); openEditor(npc); }} title={`Edit ${npc.name}`} type="button"><Pencil size={15} /></button></div> : null}</article>)}</div> : <div className="character-empty"><UserRound size={22} /><h2>No NPCs recorded yet.</h2><p>{isGM ? "Add the first contact to this campaign archive." : "The GM has not recorded any contacts yet."}</p></div>}
    {selectedNpc && !editorOpen ? <section className="record-detail npc-record-detail"><div className="npc-detail-preview"><RecordPortrait src={getAttachedArtUrl(selectedNpc.art_url, selectedNpc.art_path)} label={`${selectedNpc.name} portrait`} className="npc-detail-portrait record-portrait" fallback={<UserRound size={19} />} /><div className="npc-detail-copy"><div><p className="eyebrow">PUBLIC CONTACT FILE</p><h2>{selectedNpc.name}</h2><p className="record-detail-meta">{selectedNpc.species || "Unclassified"}{" // "}{selectedNpc.role || "Contact"}</p></div><p>{selectedNpc.description || "No public description recorded yet."}</p></div><div className="npc-detail-notes markdown-preview"><div className="preview-toolbar"><BookOpen size={14} /> PLAYER NOTES</div><p>{selectedNpc.player_notes_markdown || "No player notes recorded yet."}</p></div></div></section> : null}
  </PageLayout>;
}

type FactionDraft = { name: string; description: string; status: string; artPath: string | null; artUrl: string | null; artPrompt: string | null; artProvider: string | null };
const emptyFactionDraft: FactionDraft = { name: "", description: "", status: "active", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function FactionsView({ factions: factionRecords, campaignId, isGM, onFactionsChange, onAction }: { factions: FactionRecord[]; campaignId: string | null; isGM: boolean; onFactionsChange: Dispatch<SetStateAction<FactionRecord[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFaction, setEditingFaction] = useState<FactionRecord | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<FactionRecord | null>(null);
  const [draft, setDraft] = useState<FactionDraft>(emptyFactionDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "faction", value: draft.artPath, url: draft.artUrl, currentPrompt: draft.artPrompt, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })), onPromptChange: (prompt) => setDraft((current) => ({ ...current, artPrompt: prompt })), onProviderChange: (provider) => setDraft((current) => ({ ...current, artProvider: provider })) } : null);

  const openEditor = (faction?: FactionRecord) => {
    if (!isGM) {
      onAction("Only a GM can edit factions.");
      return;
    }
    setEditingFaction(faction ?? null);
    setSelectedFaction(faction ?? null);
    setDraft(faction ? { name: faction.name, description: faction.description, status: faction.status, artPath: faction.art_path ?? null, artUrl: faction.art_url ?? null, artPrompt: faction.art_prompt, artProvider: faction.art_provider ?? null } : emptyFactionDraft);
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

  return <PageLayout eyebrow="ARCHIVE // POWER MAP" title="Factions" description="The groups shaping this campaign. Use them as mission givers and campaign context." action={isGM ? "ADD FACTION" : undefined} onAction={() => openEditor()}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM FACTION RECORD</p><h2>{editingFaction ? `Edit ${editingFaction.name}` : "Add a faction"}</h2></div><button className="icon-button" aria-label="Close faction editor" onClick={() => setEditorOpen(false)} title="Close faction editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveFaction}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Status<input required maxLength={80} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} /></label></div><label>Public description<textarea maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingFaction ? "SAVE CHANGES" : "ADD FACTION"}</button>{editingFaction ? <button className="button button-danger" disabled={isSaving} onClick={deleteFaction} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    {factionRecords.length ? <div className="faction-grid">{factionRecords.map((faction) => <article aria-label={`Open public file for ${faction.name}`} className={`faction-card faction-${faction.color}`} key={faction.id} onClick={() => setSelectedFaction(faction)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedFaction(faction); } }} role="button" tabIndex={0}><div className="faction-top"><div className="faction-emblem"><Network size={20} /></div><StatusPill color={faction.color}>{faction.status.toUpperCase()}</StatusPill></div><h3>{faction.name}</h3><p>{faction.description || "No public description recorded."}</p><div className="faction-footer"><span><strong>CAMPAIGN</strong><small>MISSION CONTEXT</small></span>{isGM ? <button className="icon-button" aria-label={`Edit ${faction.name}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openEditor(faction); }} title={`Edit ${faction.name}`} type="button"><Pencil size={15} /></button> : <button className="icon-button" aria-label={`Open ${faction.name}`} onClick={(event) => { event.stopPropagation(); setSelectedFaction(faction); }} title={`Open ${faction.name}`} type="button"><ArrowUpRight size={16} /></button>}</div></article>)}</div> : <div className="character-empty"><Network size={22} /><h2>No factions recorded yet.</h2><p>{isGM ? "Add the first faction to establish campaign context." : "The GM has not recorded any factions yet."}</p></div>}
    {selectedFaction && !editorOpen ? <section className="record-detail"><div className="section-heading"><div><p className="eyebrow">PUBLIC FACTION FILE</p><h2>{selectedFaction.name}</h2><p className="record-detail-meta">{selectedFaction.status.toUpperCase()}</p></div>{isGM ? <button className="button button-secondary" onClick={() => openEditor(selectedFaction)} type="button"><Pencil size={14} /> EDIT FACTION</button> : null}</div><p>{selectedFaction.description || "No public description recorded yet."}</p></section> : null}
  </PageLayout>;
}

function CampaignSettingsView({ campaignId }: { campaignId: string | null }) {
  return <><div className="page-intro"><div><p className="eyebrow eyebrow-bright"><span className="live-dot" /> GAME MASTER CONTROL</p><h1>Campaign settings</h1><p className="intro-copy">Shape which AI models are available when this campaign creates text drafts and visual art.</p></div></div><CampaignAiSettings campaignId={campaignId} /></>;
}

function EpisodesView({ episodes: episodeRecords, campaignId }: { episodes: EpisodeRecord[]; campaignId: string | null }) {
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
    {episodeRecords.length ? <div className="episode-list">{episodeRecords.map((episode) => <article className={`episode-row ${episode.status === "active" ? "episode-current" : ""}`} key={episode.id}><div className={`episode-number episode-number-${episode.accent}`}><span>EP.</span><strong>{episodeRecords.indexOf(episode) + 1}</strong></div><div className="episode-info"><div className="record-title-row"><h3>{episode.title}</h3><StatusPill color={episode.status === "active" ? "cyan" : "muted"}>{episode.status.toUpperCase()}</StatusPill></div><p>{episode.summary || "No public episode brief recorded."}</p><span className="record-meta"><Clock3 size={13} /> {new Date(episode.created_at).toLocaleDateString()} <span className="meta-divider" /> <FileText size={13} /> {episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}</span></div><button className="episode-open" disabled={isLoading} onClick={() => void openEpisode(episode)} type="button">OPEN <ArrowUpRight size={14} /></button></article>)}</div> : <div className="character-empty"><FolderKanban size={22} /><h2>No episodes logged yet.</h2><p>Promote an open job when the crew is ready to make it part of the campaign record.</p></div>}
    {selectedEpisode ? <section className="record-detail"><div className="editor-heading"><div><p className="eyebrow">EPISODE DETAIL // {selectedEpisode.status.toUpperCase()}</p><h2>{selectedEpisode.title}</h2><p className="record-detail-meta">{selectedEpisode.noteCount} {selectedEpisode.noteCount === 1 ? "note" : "notes"} in this episode</p></div><button className="icon-button" aria-label="Close episode detail" onClick={() => { setSelectedEpisode(null); setEpisodeNotes([]); }} title="Close episode detail" type="button"><X size={17} /></button></div><p>{selectedEpisode.player_context_markdown || selectedEpisode.summary || "No public episode context recorded yet."}</p>{episodeNotes.length ? <div className="record-list">{episodeNotes.map((note) => <article className="record-row" key={note.id}><div className="record-main"><div className="record-title-row"><h3>{note.title}</h3><span className="record-meta">{note.visibility === "gm" ? "GM ONLY" : "PLAYER"}</span></div><p>{note.body_markdown || "No note body recorded yet."}</p><span className="record-meta">Added by {note.author.displayName}</span></div></article>)}</div> : <p className="record-detail-meta">No visible notes are attached to this episode.</p>}</section> : null}
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

  return <PageLayout eyebrow="CAMPAIGN ADMIN // MEMBERS" title="Crew access" description="Manage who can see the campaign and who is trusted to shape it." action={isGM ? "CREATE JOIN LINK" : undefined} onAction={() => isGM ? void createJoinLink() : onAction("Only a GM can create join links.")}>
    <div className="member-summary"><div><p className="eyebrow">ACCESS MODEL</p><h2>One campaign. Two levels of clearance.</h2><p>Player-visible content is shared by default. GM notes, mission controls, and campaign administration stay behind the command lock.</p></div><div className="clearance-key"><span><i className="legend-dot dot-cyan" /> PLAYER VISIBLE</span><span><i className="legend-dot dot-pink" /> GM ONLY</span></div></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {members.length ? <div className="member-list">{members.map((member, index) => <div className="member-row" key={member.userId}><div className="avatar" style={{ backgroundColor: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4] }}>{member.displayName.slice(0, 2).toUpperCase()}</div><div className="member-copy"><strong>{member.displayName}</strong><span>{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div><StatusPill color={member.role === "gm" ? "amber" : "cyan"}>{member.role === "gm" ? "OWNER" : "ACTIVE"}</StatusPill><span className="member-last">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>{isGM ? <button className="icon-button" aria-label={`Open ${member.displayName} options`} onClick={() => { setSelectedMember(member); setError(null); }} title="Member options" type="button"><MoreHorizontal size={17} /></button> : null}</div>)}</div> : <div className="character-empty"><UsersRound size={22} /><h2>No campaign members yet.</h2><p>Invite a player to establish the crew manifest.</p></div>}
    {selectedMember ? <section className="record-detail"><div className="editor-heading"><div><p className="eyebrow">MEMBER ACCESS // {selectedMember.role.toUpperCase()}</p><h2>{selectedMember.displayName}</h2><p className="record-detail-meta">Joined {new Date(selectedMember.joinedAt).toLocaleDateString()}</p></div><button className="icon-button" aria-label="Close member details" onClick={() => setSelectedMember(null)} title="Close member details" type="button"><X size={17} /></button></div><div className="character-form-actions"><button className="button button-secondary" disabled={isSaving || selectedMember.role === "gm"} onClick={() => void updateMemberRole("gm")} type="button">MAKE GM</button><button className="button button-secondary" disabled={isSaving || selectedMember.role === "player"} onClick={() => void updateMemberRole("player")} type="button">MAKE PLAYER</button><button className="button button-danger" disabled={isSaving} onClick={() => void removeMember()} type="button">REMOVE</button></div></section> : null}
    {joinUrl ? <div className="join-link-card"><div className="join-link-icon"><Send size={18} /></div><div><p className="eyebrow">PLAYER JOIN LINK</p><h3>{joinUrl}</h3><p>One use · no expiration</p></div><button className="button button-secondary" disabled={isSaving} onClick={() => void copyJoinLink()} type="button">COPY LINK</button></div> : null}
  </PageLayout>;
}
function PageLayout({ eyebrow, title, description, action, onAction, children }: { eyebrow: string; title: string; description: string; action?: string; onAction?: () => void; children: React.ReactNode }) { return <><CampaignArtEditorSlot /><div className="page-intro"><div><p className="eyebrow eyebrow-bright">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action && onAction ? <button className="button button-primary" onClick={onAction} type="button"><CirclePlus size={16} /> {action}</button> : null}</div>{children}</>; }
