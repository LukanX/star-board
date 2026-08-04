"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { CampaignArtEditorSlot, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import CampaignNotesView, { type ApiCampaignNote, type CampaignNote } from "@/components/archive/CampaignNotesView";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowUpRight,
  Bell,
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
  ImagePlus,
  LockKeyhole,
  Mail,
  Map,
  Menu,
  MoreHorizontal,
  Network,
  Orbit,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Vote,
  X,
  Zap,
} from "lucide-react";

type NavId = "overview" | "characters" | "npcs" | "factions" | "jobs" | "episodes" | "notes" | "members";

type Mission = {
  id: string;
  title: string;
  category: string;
  summary: string;
  giver: string;
  giverType: "NPC" | "FACTION";
  votes: number;
  eta: string;
  region: string;
  accent: "cyan" | "pink" | "amber";
  image: string;
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
  image: string;
  status: "ACTIVE" | "RESTING";
  backstoryMarkdown: string;
  artPath?: string | null;
  artUrl?: string | null;
  artPrompt?: string | null;
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
};
const persistentMissionImages = [
  "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1000&q=85",
];

function mapApiJob(job: ApiJob, index: number): Mission {
  const accent = (["cyan", "pink", "amber"] as const)[index % 3];
  const image = job.art_url ?? (job.art_path?.startsWith("http") ? job.art_path : persistentMissionImages[index % persistentMissionImages.length]);

  return {
    id: job.id,
    title: job.title,
    category: `${job.status.toUpperCase()} SIGNAL`,
    summary: job.summary || "No public mission brief recorded.",
    giver: job.giver.name,
    giverType: job.giver.type,
    votes: job.votes,
    eta: "UNSCHEDULED",
    region: "CAMPAIGN SPACE",
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
];

const missionsSeed: Mission[] = [
  { id: "nightglass", title: "The Nightglass Relay", category: "SALVAGE / HIGH RISK", summary: "A dead comms relay just woke up beyond the Drift lane. Its signal is repeating a distress call in a language no archive can place.", giver: "Sera Vonn", giverType: "NPC", votes: 5, eta: "2–3 sessions", region: "Gallowglass Reach", accent: "cyan", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85", voted: true, status: "open", playerNotesMarkdown: "", giverId: "" },
  { id: "velvet", title: "A Favor in Velvet", category: "DIPLOMACY / SOCIAL", summary: "The Red Ledger wants one quiet evening at the embassy. Quiet is not usually how the crew leaves a room.", giver: "The Red Ledger", giverType: "FACTION", votes: 3, eta: "1 session", region: "Absalom Station", accent: "pink", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1000&q=85", voted: false, status: "open", playerNotesMarkdown: "", giverId: "" },
  { id: "hollow", title: "Hollow Moon Protocol", category: "EXPLORATION / UNKNOWN", summary: "A survey drone has mapped a second interior to a moon that should be solid all the way through.", giver: "Dr. Ilyra Quell", giverType: "NPC", votes: 1, eta: "3+ sessions", region: "Veskarium Fringe", accent: "amber", image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1000&q=85", voted: false, status: "open", playerNotesMarkdown: "", giverId: "" },
];

const crew = [
  { name: "Kaia Vex", role: "Operative", initials: "KV", color: "#ff5c9a", online: true },
  { name: "Rook-7", role: "Mechanic", initials: "R7", color: "#62e8ff", online: true },
  { name: "Mira Sol", role: "Mystic", initials: "MS", color: "#b992ff", online: false },
  { name: "Jax Tallow", role: "Envoy", initials: "JT", color: "#f5b84b", online: true },
];

const charactersSeed: Character[] = [
  { id: "kaia-vex", name: "Kaia Vex", species: "Human", className: "Operative", subtitle: "Human Operative", detail: "Ghost // Level 4", color: "pink", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80", status: "ACTIVE", backstoryMarkdown: "Kaia keeps a list of every station where the lights flickered before someone disappeared." },
  { id: "rook-7", name: "Rook-7", species: "Android", className: "Mechanic", subtitle: "Android Mechanic", detail: "Exocortex // Level 4", color: "cyan", image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=600&q=80", status: "ACTIVE", backstoryMarkdown: "Rook remembers every machine they have repaired, including the ones that never existed." },
  { id: "mira-sol", name: "Mira Sol", species: "Lashunta", className: "Mystic", subtitle: "Lashunta Mystic", detail: "Xenodruid // Level 4", color: "purple", image: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=600&q=80", status: "RESTING", backstoryMarkdown: "Mira hears a second heartbeat whenever the crew enters the Drift." },
  { id: "jax-tallow", name: "Jax Tallow", species: "Ysoki", className: "Envoy", subtitle: "Ysoki Envoy", detail: "Celebrity // Level 4", color: "amber", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80", status: "ACTIVE", backstoryMarkdown: "Jax can turn a bad docking fine into a standing ovation, given enough witnesses." },
];

const persistentCharacterImages = charactersSeed.map((character) => character.image);

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
    image: character.art_url ?? (character.art_path?.startsWith("http") ? character.art_path : persistentCharacterImages[index % persistentCharacterImages.length]),
    status: "ACTIVE",
    backstoryMarkdown: character.backstory_markdown,
    artPath: character.art_path,
    artUrl: character.art_url ?? null,
    artPrompt: character.art_prompt,
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
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const notesThisWeek = notes.filter((note) => {
    const timestamp = Date.parse(note.updated_at || note.created_at);
    return !Number.isNaN(timestamp) && timestamp >= weekAgo;
  }).length;

  return {
    openJobs: missions.filter((mission) => mission.status === "open").length,
    activeVotes: missions.some((mission) => mission.voted) ? 1 : 0,
    episodes: episodes.length,
    members: members.length,
    players: members.filter((member) => member.role === "player").length,
    gms: members.filter((member) => member.role === "gm").length,
    notes: notes.length,
    notesThisWeek,
    draftSignals: missions.filter((mission) => mission.status === "draft").length,
    latestEpisodeTitle: episodes[0]?.title ?? null,
  };
}

const emptyCharacterDraft: CharacterDraft = { name: "", species: "", className: "", level: 1, backstoryMarkdown: "", artPath: null, artUrl: null, artPrompt: null };

function toCharacterDraft(character: Character): CharacterDraft {
  return { name: character.name, species: character.species, className: character.className, level: Number(character.detail.match(/Level (\d+)/)?.[1] ?? 1), backstoryMarkdown: character.backstoryMarkdown, artPath: character.artPath ?? null, artUrl: character.artUrl ?? null, artPrompt: character.artPrompt ?? null };
}

const npcs = [
  { name: "Sera Vonn", subtitle: "Independent salvager", status: "TRUSTED", location: "Absalom Station", color: "cyan" },
  { name: "Dr. Ilyra Quell", subtitle: "Xenobiologist / contract lead", status: "UNKNOWN", location: "Veskarium Fringe", color: "amber" },
  { name: "The Glass Cardinal", subtitle: "Masked information broker", status: "HOSTILE", location: "Unknown", color: "pink" },
];

const factions = [
  { name: "The Red Ledger", type: "Trade syndicate", members: "1,200+", status: "ACTIVE", color: "pink" },
  { name: "Helix Cartography", type: "Drift survey collective", members: "86", status: "ALLIED", color: "cyan" },
  { name: "Veskarium Fringe Authority", type: "Colonial administration", members: "4,800", status: "TENSE", color: "amber" },
];

const fallbackNpcRecords: NpcRecord[] = npcs.map((npc, index) => ({ ...npc, id: `seed-${index}`, author_id: "", species: "", role: npc.subtitle, description: npc.location, player_notes_markdown: "", gm_notes_markdown: "", art_path: null, art_prompt: null, color: (["cyan", "amber", "pink"] as const)[index % 3] }));
const fallbackFactionRecords: FactionRecord[] = factions.map((faction, index) => ({ ...faction, id: `seed-${index}`, author_id: "", description: faction.type, status: faction.status.toLowerCase(), art_path: null, art_prompt: null, color: (["pink", "cyan", "amber"] as const)[index % 3] }));

const episodes = [
  { number: "08", title: "The Last Safe Harbor", date: "JUL 11, 2026", status: "CURRENT", summary: "A station lockdown, three missing cargo manifests, and one very expensive hourglass." },
  { number: "07", title: "Static in the Green", date: "JUN 28, 2026", status: "ARCHIVED", summary: "The crew followed a signal into a living nebula and came back with a new passenger." },
  { number: "06", title: "Dead Reckoning", date: "JUN 14, 2026", status: "ARCHIVED", summary: "An old nav beacon offered a shortcut. The shortcut had opinions." },
];

const notes = [
  { title: "The station has a second sun", scope: "GLOBAL", author: "Mira Sol", age: "12m ago", visibility: "PLAYER", accent: "cyan" },
  { title: "Ask Sera about the blue key", scope: "EP. 08", author: "Jax Tallow", age: "1h ago", visibility: "PLAYER", accent: "pink" },
  { title: "The Cardinal knows Rook's original designation", scope: "EP. 08", author: "GM / Arlen", age: "3h ago", visibility: "GM ONLY", accent: "amber" },
  { title: "Drift route: Gallowglass to Absalom", scope: "GLOBAL", author: "Kaia Vex", age: "Yesterday", visibility: "PLAYER", accent: "purple" },
];

function VisualAsset({ src, label, className = "" }: { src: string; label: string; className?: string }) {
  return <div aria-label={label} className={`visual-asset ${className}`} role="img" style={{ backgroundImage: `url(${src})` }} />;
}

function AccentMark({ color }: { color: string }) { return <span aria-hidden="true" className={`accent-mark accent-${color}`} />; }

function StatusPill({ children, color = "cyan" }: { children: React.ReactNode; color?: string }) {
  return <span className={`status-pill status-${color}`}>{children}</span>;
}

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && onAction ? <button className="text-action" onClick={onAction} type="button">{action} <ArrowUpRight size={14} /></button> : null}</div>;
}

export default function Home() {
  const [activeView, setActiveView] = useState<NavId>("overview");
  const [missions, setMissions] = useState(missionsSeed);
  const [characters, setCharacters] = useState(charactersSeed);
  const [npcRecords, setNpcRecords] = useState<NpcRecord[]>([]);
  const [factionRecords, setFactionRecords] = useState<FactionRecord[]>([]);
  const [noteRecords, setNoteRecords] = useState<CampaignNote[]>([]);
  const [episodeRecords, setEpisodeRecords] = useState<EpisodeRecord[]>([]);
  const [memberRecords, setMemberRecords] = useState<ApiCampaignMember[]>([]);
  const [isGM, setIsGM] = useState(true);
  const [displayName, setDisplayName] = useState("Arlen Rook");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const campaignIdRef = useRef<string | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    const requestedCampaignId = new URLSearchParams(window.location.search).get("campaignId");

    if (!requestedCampaignId) return;

    campaignIdRef.current = requestedCampaignId;
    void fetchCampaignJobs(requestedCampaignId).then((result) => {
      setMissions(result.jobs.map(mapApiJob));
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign jobs.");
    });
    void fetchCampaignCharacters(requestedCampaignId).then((result) => {
      setCharacters(result.characters.map(mapApiCharacter));
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign characters.");
    });
    void fetchCampaignNpcs(requestedCampaignId).then((result) => {
      setNpcRecords(result.npcs.map(mapApiNpc));
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign NPCs.");
    });
    void fetchCampaignFactions(requestedCampaignId).then((result) => {
      setFactionRecords(result.factions.map(mapApiFaction));
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign factions.");
    });
    void fetchCampaignNotes(requestedCampaignId).then((result) => {
      setNoteRecords(result.notes.map(mapApiNote));
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign notes.");
    });
    void fetchCampaignEpisodes(requestedCampaignId).then((result) => {
      setEpisodeRecords(result.episodes.map(mapApiEpisode));
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign episodes.");
    });
    void fetchCampaignMembers(requestedCampaignId).then((result) => {
      setMemberRecords(result.members);
      setIsGM(result.role === "gm");
      setDisplayName(result.displayName);
      setCampaignId(requestedCampaignId);
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign members.");
    });
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
  const overviewMetrics = isPersistent ? getOverviewMetrics(missions, memberRecords, noteRecords, episodeRecords) : null;
  const countByNavId: Partial<Record<NavId, number>> = overviewMetrics ? {
    jobs: overviewMetrics.openJobs,
    episodes: overviewMetrics.episodes,
    characters: characters.length,
    npcs: npcRecords.length,
    factions: factionRecords.length,
    notes: overviewMetrics.notes,
  } : {};
  const displayedNavItems = isPersistent ? navItems.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, count: String(countByNavId[item.id] ?? 0).padStart(2, "0") })),
  })) : navItems;
  const activeLabel = navItems.flatMap((group) => group.items).find((item) => item.id === activeView)?.label ?? "Overview";

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup"><div className="brand-symbol"><Orbit size={21} strokeWidth={1.8} /></div><div><p className="brand-name">STAR BOARD</p><p className="brand-subtitle">CAMPAIGN OPERATIONS</p></div><button aria-label="Close navigation" className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} title="Close navigation" type="button"><X size={18} /></button></div>
        <div className="campaign-switcher"><div className="campaign-orb"><Hexagon size={18} /></div><div className="campaign-switcher-copy"><span className="micro-label">ACTIVE CAMPAIGN</span><strong>Signal / Noise</strong></div><ChevronDown size={15} className="muted-icon" /></div>
        <nav className="side-nav" aria-label="Campaign navigation">{displayedNavItems.map((group) => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map((item) => { const Icon = item.icon; return <button className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`} key={item.id} onClick={() => selectView(item.id)} type="button"><Icon size={17} strokeWidth={activeView === item.id ? 2.1 : 1.7} /><span>{item.label}</span>{item.count ? <span className="nav-count">{item.count}</span> : null}</button>; })}</div>)}</nav>
        <div className="side-footer"><div className="sync-status"><span className="live-dot" /> {isPersistent ? "SUPABASE SYNC ACTIVE" : "ALL SYSTEMS NOMINAL"}</div><button className="nav-item" onClick={() => notify("Campaign settings are queued for the next build.")} type="button"><Settings2 size={17} /><span>Campaign settings</span></button><div className="profile-row"><div className="avatar avatar-user">{displayName.slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><span>{isGM ? "GAME MASTER" : "PLAYER"}</span></div><MoreHorizontal size={17} className="muted-icon" /></div></div>
      </aside>

      <div className="app-content">
        <header className="topbar"><div className="topbar-left"><button aria-label="Open navigation" className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} title="Open navigation" type="button"><Menu size={20} /></button><div className="crumb-mark"><Command size={14} /></div><span className="crumb-muted">SIGNAL / NOISE</span><ChevronRight size={14} className="muted-icon" /><span className="crumb-current">{activeLabel.toUpperCase()}</span></div><div className="topbar-right"><button className="search-trigger" onClick={() => notify("Search will scan campaign records.")} type="button"><Search size={16} /><span>Search records</span><kbd>⌘ K</kbd></button><button aria-label="Notifications" className="icon-button notification-button" onClick={() => notify("No new priority signals.")} title="Notifications" type="button"><Bell size={17} /><span className="notification-dot" /></button><button className={`role-switch ${isGM ? "role-gm" : "role-player"}`} onClick={() => { setIsGM((current) => !current); notify(isGM ? "Player view enabled" : "GM view enabled"); }} type="button"><ShieldCheck size={15} /> {isGM ? "GM MODE" : "PLAYER MODE"}</button></div></header>
        <div className="content-frame">{activeView === "overview" ? <OverviewView missions={missions} members={memberRecords} notes={noteRecords} episodes={episodeRecords} isPersistent={isPersistent} isGM={isGM} onVote={handleVote} onAction={notify} /> : activeView === "jobs" ? <JobsView missions={missions} campaignId={campaignId} isPersistent={isPersistent} isGM={isGM} npcs={npcRecords} factions={factionRecords} onMissionsChange={setMissions} onVote={handleVote} onPromote={handlePromote} onAction={notify} /> : activeView === "characters" ? <CharactersView characters={characters} campaignId={campaignId} isPersistent={isPersistent} isGM={isGM} onCharactersChange={setCharacters} onAction={notify} /> : activeView === "npcs" ? <NpcsView npcs={isPersistent ? npcRecords : fallbackNpcRecords} campaignId={campaignId} isPersistent={isPersistent} isGM={isGM} onNpcsChange={setNpcRecords} onAction={notify} /> : activeView === "factions" ? <FactionsView factions={isPersistent ? factionRecords : fallbackFactionRecords} campaignId={campaignId} isPersistent={isPersistent} isGM={isGM} onFactionsChange={setFactionRecords} onAction={notify} /> : activeView === "episodes" ? <EpisodesView episodes={episodeRecords} campaignId={campaignId} isPersistent={isPersistent} onAction={notify} /> : activeView === "notes" ? isPersistent ? <CampaignNotesView notes={noteRecords} episodes={episodeRecords} campaignId={campaignId} isPersistent={isPersistent} isGM={isGM} onNotesChange={setNoteRecords} onAction={notify} /> : <NotesView isGM={isGM} onAction={notify} /> : <MembersView members={memberRecords} campaignId={campaignId} isPersistent={isPersistent} isGM={isGM} onMembersChange={setMemberRecords} onAction={notify} />}</div>
      </div>
      {toast ? <div className="toast"><span className="toast-icon"><Radio size={14} /></span><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)} title="Dismiss notification" type="button"><X size={14} /></button></div> : null}
    </main>
  );
}

function OverviewView({ missions, members, notes, episodes, isPersistent, isGM, onVote, onAction }: { missions: Mission[]; members: ApiCampaignMember[]; notes: CampaignNote[]; episodes: EpisodeRecord[]; isPersistent: boolean; isGM: boolean; onVote: (id: string) => void; onAction: (message: string) => void }) {
  const metrics = isPersistent ? getOverviewMetrics(missions, members, notes, episodes) : null;
  const openJobs = metrics?.openJobs ?? 3;
  const activeVotes = metrics?.activeVotes ?? 1;
  const episodeCount = metrics?.episodes ?? 8;
  const rosterCount = metrics?.members ?? 6;
  const noteCount = metrics?.notes ?? 21;
  const draftSignalCount = metrics?.draftSignals ?? 4;
  const rosterDetail = metrics ? `${metrics.players} players / ${metrics.gms} GM${metrics.gms === 1 ? "" : "s"}` : "4 active / 2 resting";
  const noteDetail = metrics ? `${metrics.notesThisWeek} added this week` : "3 added this week";
  const episodeLabel = metrics ? "Episodes logged" : "Next episode";
  const episodeDetail = metrics ? metrics.latestEpisodeTitle ?? "No episodes logged" : "Last safe harbor";
  const signalDetail = metrics ? `${draftSignalCount} drafts / ${openJobs} open` : "2 need your review";
  const roster: Array<{ name: string; role: string; initials: string; color: string; online: boolean }> = isPersistent
    ? members.map((member, index) => ({ name: member.displayName, role: member.role === "gm" ? "GAME MASTER" : "PLAYER", initials: member.displayName.slice(0, 2).toUpperCase(), color: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4], online: true }))
    : crew;

  return <><div className="page-intro overview-intro"><div><p className="eyebrow eyebrow-bright"><span className="live-dot" /> LIVE CAMPAIGN // SEASON 02</p><h1>Good evening, Arlen.</h1><p className="intro-copy">The crew is between jumps. {openJobs} signal{openJobs === 1 ? " is" : "s are"} waiting for a decision.</p></div><div className="intro-actions"><div className="last-sync"><span>LAST SYNC</span><strong>18:42:07 UTC</strong></div><button className="button button-primary" onClick={() => onAction(isGM ? "New mission draft opened." : "Only a GM can create a mission.")} type="button"><Plus size={16} /> NEW SIGNAL</button></div></div>
    <div className="signal-strip"><div className="signal-strip-pattern" /><div className="signal-copy"><span className="micro-label">CURRENT OBJECTIVE</span><strong>Decide what gets the crew off-station next.</strong></div><div className="signal-stats"><span><strong>{String(openJobs).padStart(2, "0")}</strong> OPEN JOBS</span><span><strong>{String(activeVotes).padStart(2, "0")}</strong> ACTIVE VOTE</span><span><strong>{String(episodeCount).padStart(2, "0")}</strong> EPISODES LOGGED</span></div><Zap size={18} className="signal-zap" /></div>
    <div className="metric-grid"><MetricCard label="Crew roster" value={String(rosterCount).padStart(2, "0")} detail={rosterDetail} icon={UsersRound} accent="cyan" /><MetricCard label="Campaign notes" value={String(noteCount).padStart(2, "0")} detail={noteDetail} icon={FileText} accent="pink" /><MetricCard label={episodeLabel} value={String(episodeCount).padStart(2, "0")} detail={episodeDetail} icon={FolderKanban} accent="amber" /><MetricCard label="GM signals" value={String(draftSignalCount).padStart(2, "0")} detail={signalDetail} icon={Bot} accent="purple" /></div>
    <div className="dashboard-grid"><section className="panel panel-jobboard"><div className="panel-topline"><div><p className="eyebrow">MISSION CONTROL</p><h2>Job board</h2></div><button className="icon-button" aria-label="Job board options" onClick={() => onAction("Job board filters are ready for the next build.")} title="Job board options" type="button"><MoreHorizontal size={18} /></button></div><div className="job-list">{missions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} onAction={onAction} compact />)}</div><button className="panel-footer-action" onClick={() => onAction("Full job board selected.")} type="button">VIEW ALL JOBS <ArrowUpRight size={14} /></button></section>
      <aside className="right-rail"><section className="panel crew-panel"><SectionHeading eyebrow="CREW MANIFEST" title="On the roster" action="Manage" onAction={() => onAction("Crew management selected.")} /><div className="crew-list">{roster.map((member) => <div className="crew-row" key={member.name}><div className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</div><div className="crew-copy"><strong>{member.name}</strong><span>{member.role}</span></div><span className={`online-indicator ${member.online ? "is-online" : ""}`} title={member.online ? "Online" : "Away"} /></div>)}</div><button className="invite-row" onClick={() => onAction("Invite link copied to clipboard.")} type="button"><Mail size={15} /> INVITE PLAYER <Plus size={14} /></button></section><section className="panel pulse-panel"><div className="panel-topline"><div><p className="eyebrow">CAMPAIGN PULSE</p><h2>Signal strength</h2></div><Activity size={17} className="accent-icon-cyan" /></div><div className="pulse-visual"><div className="pulse-grid" /><div className="pulse-wave pulse-wave-one" /><div className="pulse-wave pulse-wave-two" /><span className="pulse-label pulse-label-left">EP. 01</span><span className="pulse-label pulse-label-right">NOW</span></div><div className="pulse-legend"><span><i className="legend-dot dot-cyan" /> Momentum</span><strong>78%</strong></div></section></aside></div>
    <section className="feed-section"><SectionHeading eyebrow="RECENT TRANSMISSIONS" title="Signal feed" action="Open archive" onAction={() => onAction("Signal archive selected.")} /><div className="feed-grid"><FeedItem icon={Sparkles} accent="pink" title="Mission promoted to episode 08" detail="The Last Safe Harbor is now part of the campaign record." age="2h ago" /><FeedItem icon={BookOpen} accent="cyan" title="Mira added a campaign note" detail="The station has a second sun // player visible" age="4h ago" /><FeedItem icon={ImagePlus} accent="amber" title="New art asset generated" detail="The Glass Cardinal // visual profile v2" age="Yesterday" /></div></section></>;
}

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-head"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{detail}</small><div className="metric-bar"><span /></div></div>; }

function MissionCard({ mission, isGM, index, onVote, onAction, onEdit, onPromote, compact = false }: { mission: Mission; isGM: boolean; index: number; onVote: (id: string) => void; onAction: (message: string) => void; onEdit?: () => void; onPromote?: (id: string) => void; compact?: boolean }) {
  return <article className={`mission-card mission-${mission.accent} ${compact ? "mission-compact" : ""}`}><VisualAsset src={mission.image} label={`${mission.title} artwork`} className="mission-art" /><div className="mission-art-overlay" /><div className="mission-index">0{index + 1}</div><div className="mission-content"><div className="mission-meta"><StatusPill color={mission.accent}>{mission.category}</StatusPill><span>{mission.region}</span></div><h3>{mission.title}</h3><p>{mission.summary}</p><div className="mission-footer"><span className="giver"><span className="giver-glyph">{mission.giverType === "NPC" ? "N" : "F"}</span><span><small>{mission.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</small><strong>{mission.giver}</strong></span></span><span className="mission-eta"><Clock3 size={13} /> {mission.eta}</span></div></div><div className="mission-vote"><span><strong>{mission.votes.toString().padStart(2, "0")}</strong> votes</span><button className={`vote-button ${mission.voted ? "vote-active" : ""}`} onClick={() => onVote(mission.id)} type="button"><Vote size={15} /> {mission.voted ? "VOTED" : "VOTE"}</button>{isGM ? <><button className="mission-more icon-button" aria-label={`Edit ${mission.title}`} onClick={() => onEdit ? onEdit() : onAction(`${mission.title} options opened.`)} title={onEdit ? "Edit mission" : "Mission options"} type="button"><MoreHorizontal size={16} /></button>{mission.status === "open" && onPromote ? <button className="mission-more mission-promote icon-button" aria-label={`Promote ${mission.title} to an episode`} onClick={() => onPromote(mission.id)} title="Promote to episode" type="button"><Sparkles size={16} /></button> : null}</> : null}</div></article>;
}

type JobDraft = { title: string; summary: string; playerNotesMarkdown: string; giverType: "npc" | "faction"; giverId: string; status: "draft" | "open" | "archived"; artPath: string | null; artUrl: string | null; artPrompt: string | null; artProvider: string | null };
const emptyJobDraft: JobDraft = { title: "", summary: "", playerNotesMarkdown: "", giverType: "npc", giverId: "", status: "draft", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function JobsView({ missions, campaignId, isPersistent, isGM, npcs, factions, onMissionsChange, onVote, onPromote, onAction }: { missions: Mission[]; campaignId: string | null; isPersistent: boolean; isGM: boolean; npcs: NpcRecord[]; factions: FactionRecord[]; onMissionsChange: Dispatch<SetStateAction<Mission[]>>; onVote: (id: string) => void; onPromote: (id: string) => void; onAction: (message: string) => void }) {
  const [filter, setFilter] = useState<"open" | "archived" | "drafts">("open");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [draft, setDraft] = useState<JobDraft>(emptyJobDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "job", value: draft.artPath, url: draft.artUrl, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })) } : null);

  const filteredMissions = missions.filter((mission) => filter === "drafts" ? mission.status === "draft" : mission.status === filter);
  const openEditor = (mission?: Mission) => {
    if (!isPersistent || !isGM) {
      onAction(isGM ? "Mission editor becomes persistent when a campaign is selected." : "Only a GM can edit missions.");
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
    <div className="view-toolbar"><div className="filter-tabs"><button className={`filter-tab ${filter === "open" ? "filter-tab-active" : ""}`} onClick={() => setFilter("open")} type="button">OPEN <span>{filterCount("open")}</span></button><button className={`filter-tab ${filter === "archived" ? "filter-tab-active" : ""}`} onClick={() => setFilter("archived")} type="button">ARCHIVED <span>{filterCount("archived")}</span></button>{isGM ? <button className={`filter-tab ${filter === "drafts" ? "filter-tab-active" : ""}`} onClick={() => setFilter("drafts")} type="button">DRAFTS <span>{filterCount("draft")}</span></button> : null}</div><button className="button button-ai" onClick={() => onAction("AI mission studio is queued for the review editor.")} type="button"><Sparkles size={15} /> AI MISSION STUDIO</button></div>
    {filteredMissions.length ? <div className="jobs-grid">{filteredMissions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} onEdit={isPersistent && isGM ? () => openEditor(mission) : undefined} onPromote={isPersistent ? onPromote : undefined} onAction={onAction} />)}</div> : <div className="character-empty"><BriefcaseBusiness size={22} /><h2>No missions in this view.</h2><p>{filter === "drafts" ? "Draft the next signal when the GM is ready." : "The campaign board has no missions here yet."}</p></div>}
  </PageLayout>;
}

function CharactersView({ characters, campaignId, isPersistent, isGM, onCharactersChange, onAction }: { characters: Character[]; campaignId: string | null; isPersistent: boolean; isGM: boolean; onCharactersChange: Dispatch<SetStateAction<Character[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [draft, setDraft] = useState<CharacterDraft>(emptyCharacterDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "character", value: draft.artPath, url: draft.artUrl, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })) } : null);
  const featuredCharacter = characters[0] ?? charactersSeed[0];

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
      onAction("Character editor becomes persistent when a campaign is selected.");
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

  return <PageLayout eyebrow="ARCHIVE // CREW ROSTER" title="Characters" description="The people, androids, and mysteries currently flying under the Signal / Noise flag." action="ADD CHARACTER" onAction={() => isPersistent ? openEditor() : onAction("Character editor becomes persistent when a campaign is selected.")}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">{isGM ? "GM / PLAYER RECORD" : "PLAYER RECORD"}</p><h2>{editingCharacter ? `Edit ${editingCharacter.name}` : "Add a character"}</h2></div><button className="icon-button" aria-label="Close character editor" onClick={closeEditor} title="Close character editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveCharacter}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))} /></label><label>Class<input maxLength={160} value={draft.className} onChange={(event) => setDraft((current) => ({ ...current, className: event.target.value }))} /></label><label>Level<input type="number" min="1" max="20" value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: Number(event.target.value) }))} /></label></div><label>Backstory<textarea maxLength={20000} placeholder="Write what the crew knows about this character." value={draft.backstoryMarkdown} onChange={(event) => setDraft((current) => ({ ...current, backstoryMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingCharacter ? "SAVE CHANGES" : "ADD TO ROSTER"}</button>{editingCharacter ? <button className="button button-danger" disabled={isSaving} onClick={deleteCharacter} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={closeEditor} type="button">CANCEL</button></div></form></section> : null}
    {characters.length ? <div className="character-grid">{characters.map((character) => <article className="character-card" key={character.id}><VisualAsset src={character.image} label={`${character.name} portrait`} className={`character-art character-${character.color}`} /><div className="character-body"><div className="card-status-row"><StatusPill color={character.status === "ACTIVE" ? "cyan" : "muted"}>{character.status}</StatusPill><button className="icon-button" aria-label={`Open ${character.name} options`} onClick={() => isPersistent ? openEditor(character) : onAction(`${character.name} options opened.`)} title="Character options" type="button"><MoreHorizontal size={16} /></button></div><h3>{character.name}</h3><p>{character.subtitle}</p><span className="mono-detail">{character.detail}</span><button className="card-link" onClick={() => isPersistent ? openEditor(character) : onAction(`${character.name} character sheet opened.`)} type="button">OPEN RECORD <ArrowUpRight size={13} /></button></div></article>)}</div> : <div className="character-empty"><UsersRound size={22} /><h2>No characters in the roster yet.</h2><p>Add the first crew record to begin the campaign manifest.</p></div>}
    <section className="lower-band"><div className="lower-copy"><p className="eyebrow">PLAYER VIEW</p><h2>Everyone has a story in the archive.</h2><p>Characters can carry a portrait, a Markdown backstory, and the notes their players want the crew to know.</p></div><div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> BACKSTORY.MD <span>PLAYER VISIBLE</span></div><p>{featuredCharacter.backstoryMarkdown || "No public backstory recorded yet."}</p></div></section>
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

function NpcsView({ npcs: npcRecords, campaignId, isPersistent, isGM, onNpcsChange, onAction }: { npcs: NpcRecord[]; campaignId: string | null; isPersistent: boolean; isGM: boolean; onNpcsChange: Dispatch<SetStateAction<NpcRecord[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNpc, setEditingNpc] = useState<NpcRecord | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<NpcRecord | null>(null);
  const [draft, setDraft] = useState<NpcDraft>(emptyNpcDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "npc", value: draft.artPath, url: draft.artUrl, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })) } : null);

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
      onAction("NPC editor becomes persistent when a campaign is selected.");
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

  return <PageLayout eyebrow="ARCHIVE // CONTACTS" title="NPCs" description="People worth knowing, watching, or avoiding. Their private context stays behind the GM lock." action={isGM ? "ADD NPC" : undefined} onAction={() => isPersistent && isGM ? openEditor() : onAction(isGM ? "NPC editor becomes persistent when a campaign is selected." : "Only a GM can create NPCs.")}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM CONTACT RECORD</p><h2>{editingNpc ? `Edit ${editingNpc.name}` : "Add an NPC"}</h2></div><button className="icon-button" aria-label="Close NPC editor" onClick={() => setEditorOpen(false)} title="Close NPC editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveNpc}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => setDraft((current) => ({ ...current, species: event.target.value }))} /></label><label>Role<input maxLength={160} value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} /></label></div><label>Description<textarea maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, playerNotesMarkdown: event.target.value }))} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => setDraft((current) => ({ ...current, gmNotesMarkdown: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingNpc ? "SAVE CHANGES" : "ADD CONTACT"}</button>{editingNpc ? <button className="button button-danger" disabled={isSaving} onClick={deleteNpc} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    <div className="record-list">{npcRecords.map((npc) => <article className="record-row" key={npc.id}><div className={`record-icon record-icon-${npc.color}`}><UserRound size={19} /></div><div className="record-main"><div className="record-title-row"><h3>{npc.name}</h3><StatusPill color={npc.color}>{npc.role || "CONTACT"}</StatusPill></div><p>{npc.description || npc.species || "No public profile recorded."}</p><span className="record-meta"><Map size={13} /> {npc.species || "Unclassified contact"}</span></div><div className="record-visibility"><span><BookOpen size={14} /> PLAYER NOTES</span>{isGM ? <span className="private-note"><LockKeyhole size={13} /> GM NOTES</span> : null}</div><button className="icon-button" aria-label={`Open ${npc.name}`} onClick={() => isGM ? openEditor(npc) : setSelectedNpc(npc)} title={`Open ${npc.name}`} type="button"><ChevronRight size={17} /></button></article>)}</div>
    {selectedNpc && !editorOpen ? <section className="record-detail"><div><p className="eyebrow">PUBLIC CONTACT FILE</p><h2>{selectedNpc.name}</h2><p className="record-detail-meta">{selectedNpc.species || "Unclassified"}{" // "}{selectedNpc.role || "Contact"}</p></div><p>{selectedNpc.description || "No public description recorded yet."}</p><div className="markdown-preview"><div className="preview-toolbar"><BookOpen size={14} /> PLAYER NOTES</div><p>{selectedNpc.player_notes_markdown || "No player notes recorded yet."}</p></div></section> : null}
    {isGM ? <div className="ai-callout"><div className="ai-callout-icon"><Bot size={20} /></div><div><p className="eyebrow">GM TOOL // AI ASSIST</p><h3>Build a contact from a single signal.</h3><p>Generate a whole NPC or refine one detail while you are in the editor. Every suggestion stays a draft until you approve it.</p></div><button className="button button-ai" onClick={() => onAction("AI NPC studio opened.")} type="button"><Sparkles size={15} /> OPEN STUDIO</button></div> : null}
  </PageLayout>;
}

type FactionDraft = { name: string; description: string; status: string; artPath: string | null; artUrl: string | null; artPrompt: string | null };
const emptyFactionDraft: FactionDraft = { name: "", description: "", status: "active", artPath: null, artUrl: null, artPrompt: null };

function FactionsView({ factions: factionRecords, campaignId, isPersistent, isGM, onFactionsChange, onAction }: { factions: FactionRecord[]; campaignId: string | null; isPersistent: boolean; isGM: boolean; onFactionsChange: Dispatch<SetStateAction<FactionRecord[]>>; onAction: (message: string) => void }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFaction, setEditingFaction] = useState<FactionRecord | null>(null);
  const [selectedFaction, setSelectedFaction] = useState<FactionRecord | null>(null);
  const [draft, setDraft] = useState<FactionDraft>(emptyFactionDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCampaignArtEditor(editorOpen ? { campaignId, kind: "faction", value: draft.artPath, url: draft.artUrl, onChange: (path) => setDraft((current) => ({ ...current, artPath: path })), onUrlChange: (url) => setDraft((current) => ({ ...current, artUrl: url })) } : null);

  const openEditor = (faction?: FactionRecord) => {
    setEditingFaction(faction ?? null);
    setSelectedFaction(faction ?? null);
    setDraft(faction ? { name: faction.name, description: faction.description, status: faction.status, artPath: faction.art_path ?? null, artUrl: faction.art_url ?? null, artPrompt: faction.art_prompt } : emptyFactionDraft);
    setError(null);
    setEditorOpen(true);
  };

  const saveFaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignId) {
      onAction("Faction editor becomes persistent when a campaign is selected.");
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

  return <PageLayout eyebrow="ARCHIVE // POWER MAP" title="Factions" description="The groups shaping the lanes around Signal / Noise. Use them as mission givers and campaign context." action={isGM ? "ADD FACTION" : undefined} onAction={() => isPersistent && isGM ? openEditor() : onAction(isGM ? "Faction editor becomes persistent when a campaign is selected." : "Only a GM can create factions.")}>
    {editorOpen ? <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM FACTION RECORD</p><h2>{editingFaction ? `Edit ${editingFaction.name}` : "Add a faction"}</h2></div><button className="icon-button" aria-label="Close faction editor" onClick={() => setEditorOpen(false)} title="Close faction editor" type="button"><X size={17} /></button></div><form className="character-form" onSubmit={saveFaction}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Status<input required maxLength={80} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} /></label></div><label>Public description<textarea maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit"><CirclePlus size={15} /> {isSaving ? "SAVING..." : editingFaction ? "SAVE CHANGES" : "ADD FACTION"}</button>{editingFaction ? <button className="button button-danger" disabled={isSaving} onClick={deleteFaction} type="button">REMOVE</button> : null}<button className="text-action" disabled={isSaving} onClick={() => setEditorOpen(false)} type="button">CANCEL</button></div></form></section> : null}
    <div className="faction-grid">{factionRecords.map((faction) => <article className={`faction-card faction-${faction.color}`} key={faction.id}><div className="faction-top"><div className="faction-emblem"><Network size={20} /></div><StatusPill color={faction.color}>{faction.status.toUpperCase()}</StatusPill></div><h3>{faction.name}</h3><p>{faction.description || "No public description recorded."}</p><div className="faction-footer"><span><strong>CAMPAIGN</strong><small>MISSION CONTEXT</small></span><button className="icon-button" aria-label={`Open ${faction.name}`} onClick={() => isGM ? openEditor(faction) : setSelectedFaction(faction)} title={`Open ${faction.name}`} type="button"><ArrowUpRight size={16} /></button></div></article>)}</div>
    {selectedFaction && !editorOpen ? <section className="record-detail"><div><p className="eyebrow">PUBLIC FACTION FILE</p><h2>{selectedFaction.name}</h2><p className="record-detail-meta">{selectedFaction.status.toUpperCase()}</p></div><p>{selectedFaction.description || "No public description recorded yet."}</p></section> : null}
    <div className="map-panel"><div className="map-copy"><p className="eyebrow">RELATIONSHIP MAP</p><h2>The board has a gravity well.</h2><p>Every favor, debt, and cold shoulder can become the next mission. Faction relationships are campaign context, not a spreadsheet.</p><button className="text-action" onClick={() => onAction("Faction relationship map selected.")} type="button">OPEN MAP <ArrowUpRight size={14} /></button></div><div className="map-visual"><div className="map-lines" /><div className="map-node map-node-one">RL</div><div className="map-node map-node-two">HC</div><div className="map-node map-node-three">VA</div><span className="map-label map-label-one">RED LEDGER</span><span className="map-label map-label-two">HELIX</span></div></div>
  </PageLayout>;
}

function EpisodesView({ episodes: episodeRecords, campaignId, isPersistent, onAction }: { episodes: EpisodeRecord[]; campaignId: string | null; isPersistent: boolean; onAction: (message: string) => void }) {
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeRecord | null>(null);
  const [episodeNotes, setEpisodeNotes] = useState<EpisodeNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openEpisode = async (episode: EpisodeRecord) => {
    setSelectedEpisode(episode);
    setError(null);

    if (!campaignId || !isPersistent) {
      onAction(`Episode ${episode.title} opened.`);
      return;
    }

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

  return <PageLayout eyebrow="CAMPAIGN LOG // EPISODES" title="Episodes" description="The campaign record, one transmission at a time." action="NEW EPISODE" onAction={() => onAction(isPersistent ? "Episodes are created by promoting an open job." : "Episode archive becomes persistent when a campaign is selected.")}>
    {isPersistent ? <>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {episodeRecords.length ? <div className="episode-list">{episodeRecords.map((episode) => <article className={`episode-row ${episode.status === "active" ? "episode-current" : ""}`} key={episode.id}><div className={`episode-number episode-number-${episode.accent}`}><span>EP.</span><strong>{episodeRecords.indexOf(episode) + 1}</strong></div><div className="episode-info"><div className="record-title-row"><h3>{episode.title}</h3><StatusPill color={episode.status === "active" ? "cyan" : "muted"}>{episode.status.toUpperCase()}</StatusPill></div><p>{episode.summary || "No public episode brief recorded."}</p><span className="record-meta"><Clock3 size={13} /> {new Date(episode.created_at).toLocaleDateString()} <span className="meta-divider" /> <FileText size={13} /> {episode.noteCount} {episode.noteCount === 1 ? "note" : "notes"}</span></div><button className="episode-open" disabled={isLoading} onClick={() => void openEpisode(episode)} type="button">OPEN <ArrowUpRight size={14} /></button></article>)}</div> : <div className="character-empty"><FolderKanban size={22} /><h2>No episodes logged yet.</h2><p>Promote an open job when the crew is ready to make it part of the campaign record.</p></div>}
      {selectedEpisode ? <section className="record-detail"><div className="editor-heading"><div><p className="eyebrow">EPISODE DETAIL // {selectedEpisode.status.toUpperCase()}</p><h2>{selectedEpisode.title}</h2><p className="record-detail-meta">{selectedEpisode.noteCount} {selectedEpisode.noteCount === 1 ? "note" : "notes"} in this episode</p></div><button className="icon-button" aria-label="Close episode detail" onClick={() => { setSelectedEpisode(null); setEpisodeNotes([]); }} title="Close episode detail" type="button"><X size={17} /></button></div><p>{selectedEpisode.player_context_markdown || selectedEpisode.summary || "No public episode context recorded yet."}</p>{episodeNotes.length ? <div className="record-list">{episodeNotes.map((note) => <article className="record-row" key={note.id}><div className="record-main"><div className="record-title-row"><h3>{note.title}</h3><span className="record-meta">{note.visibility === "gm" ? "GM ONLY" : "PLAYER"}</span></div><p>{note.body_markdown || "No note body recorded yet."}</p><span className="record-meta">Added by {note.author.displayName}</span></div></article>)}</div> : <p className="record-detail-meta">No visible notes are attached to this episode.</p>}</section> : null}
    </> : <><div className="episode-list">{episodes.map((episode, index) => <article className={`episode-row ${index === 0 ? "episode-current" : ""}`} key={episode.number}><div className="episode-number"><span>EP.</span><strong>{episode.number}</strong></div><div className="episode-info"><div className="record-title-row"><h3>{episode.title}</h3><StatusPill color={index === 0 ? "cyan" : "muted"}>{episode.status}</StatusPill></div><p>{episode.summary}</p><span className="record-meta"><Clock3 size={13} /> {episode.date} <span className="meta-divider" /> <FileText size={13} /> {index === 0 ? "3 notes" : "6 notes"}</span></div><button className="episode-open" onClick={() => onAction(`Episode ${episode.number} opened.`)} type="button">OPEN <ArrowUpRight size={14} /></button></article>)}</div><div className="promotion-card"><div className="promotion-icon"><Sparkles size={18} /></div><div><p className="eyebrow">PROMOTE A SIGNAL</p><h3>The job board is where episodes begin.</h3><p>When the crew is ready, a GM can promote an open mission into the campaign log with its public context preserved.</p></div><button className="button button-secondary" onClick={() => onAction("Open missions ready to promote: 3.")} type="button">REVIEW JOBS <ArrowUpRight size={14} /></button></div></>}
  </PageLayout>;
}

function NotesView({ isGM, onAction }: { isGM: boolean; onAction: (message: string) => void }) { return <PageLayout eyebrow="CAMPAIGN LOG // SHARED MEMORY" title="Campaign notes" description="Global context and episode notes, with authorship and visibility kept visible." action="ADD NOTE" onAction={() => onAction("Note editor opened.")}><div className="notes-toolbar"><div className="filter-tabs"><button className="filter-tab filter-tab-active" type="button">ALL NOTES <span>21</span></button><button className="filter-tab" onClick={() => onAction("Global notes selected.")} type="button">GLOBAL <span>12</span></button><button className="filter-tab" onClick={() => onAction("Episode notes selected.")} type="button">EPISODES <span>09</span></button></div>{isGM ? <button className="visibility-toggle" onClick={() => onAction("GM-only filter enabled.")} type="button"><LockKeyhole size={14} /> GM ONLY</button> : null}</div><div className="notes-list">{notes.map((note) => <article className="note-row" key={note.title}><AccentMark color={note.accent} /><div className="note-main"><div className="note-meta"><span>{note.scope}</span><span className={`note-visibility ${note.visibility === "GM ONLY" ? "note-private" : ""}`}>{note.visibility === "GM ONLY" ? <LockKeyhole size={12} /> : <BookOpen size={12} />} {note.visibility}</span></div><h3>{note.title}</h3><p>Added by <strong>{note.author}</strong> <span className="meta-divider" /> {note.age}</p></div><button className="icon-button" aria-label={`Open note ${note.title}`} onClick={() => onAction(`${note.title} opened.`)} title="Open note" type="button"><ChevronRight size={17} /></button></article>)}</div></PageLayout>; }

function MembersView({ members, campaignId, isPersistent, isGM, onMembersChange, onAction }: { members: ApiCampaignMember[]; campaignId: string | null; isPersistent: boolean; isGM: boolean; onMembersChange: Dispatch<SetStateAction<ApiCampaignMember[]>>; onAction: (message: string) => void }) {
  const [selectedMember, setSelectedMember] = useState<ApiCampaignMember | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createJoinLink = async () => {
    if (!campaignId) {
      onAction("Crew access becomes persistent when a campaign is selected.");
      return;
    }

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

  const demoMembers = [{ name: "Arlen Rook", role: "GAME MASTER", status: "OWNER", initials: "AR", color: "#f5b84b" }, ...crew.map((member) => ({ name: member.name, role: "PLAYER", status: "ACTIVE", initials: member.initials, color: member.color }))];

  return <PageLayout eyebrow="CAMPAIGN ADMIN // MEMBERS" title="Crew access" description="Manage who can see the campaign and who is trusted to shape it." action={isGM ? "CREATE JOIN LINK" : undefined} onAction={() => isGM ? void createJoinLink() : onAction("Only a GM can create join links.")}>
    <div className="member-summary"><div><p className="eyebrow">ACCESS MODEL</p><h2>One campaign. Two levels of clearance.</h2><p>Player-visible content is shared by default. GM notes, mission controls, and campaign administration stay behind the command lock.</p></div><div className="clearance-key"><span><i className="legend-dot dot-cyan" /> PLAYER VISIBLE</span><span><i className="legend-dot dot-pink" /> GM ONLY</span></div></div>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {isPersistent ? members.length ? <div className="member-list">{members.map((member, index) => <div className="member-row" key={member.userId}><div className="avatar" style={{ backgroundColor: ["#f5b84b", "#ff5c9a", "#62e8ff", "#b992ff"][index % 4] }}>{member.displayName.slice(0, 2).toUpperCase()}</div><div className="member-copy"><strong>{member.displayName}</strong><span>{member.role === "gm" ? "GAME MASTER" : "PLAYER"}</span></div><StatusPill color={member.role === "gm" ? "amber" : "cyan"}>{member.role === "gm" ? "OWNER" : "ACTIVE"}</StatusPill><span className="member-last">Joined {new Date(member.joinedAt).toLocaleDateString()}</span>{isGM ? <button className="icon-button" aria-label={`Open ${member.displayName} options`} onClick={() => { setSelectedMember(member); setError(null); }} title="Member options" type="button"><MoreHorizontal size={17} /></button> : null}</div>)}</div> : <div className="character-empty"><UsersRound size={22} /><h2>No campaign members yet.</h2><p>Invite a player to establish the crew manifest.</p></div> : <div className="member-list">{demoMembers.map((member) => <div className="member-row" key={member.name}><div className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</div><div className="member-copy"><strong>{member.name}</strong><span>{member.role}</span></div><StatusPill color={member.role === "GAME MASTER" ? "amber" : "cyan"}>{member.status}</StatusPill><span className="member-last">Last active 24m ago</span><button className="icon-button" aria-label={`Open ${member.name} options`} onClick={() => onAction(`${member.name} access options opened.`)} title="Member options" type="button"><MoreHorizontal size={17} /></button></div>)}</div>}
    {selectedMember ? <section className="record-detail"><div className="editor-heading"><div><p className="eyebrow">MEMBER ACCESS // {selectedMember.role.toUpperCase()}</p><h2>{selectedMember.displayName}</h2><p className="record-detail-meta">Joined {new Date(selectedMember.joinedAt).toLocaleDateString()}</p></div><button className="icon-button" aria-label="Close member details" onClick={() => setSelectedMember(null)} title="Close member details" type="button"><X size={17} /></button></div><div className="character-form-actions"><button className="button button-secondary" disabled={isSaving || selectedMember.role === "gm"} onClick={() => void updateMemberRole("gm")} type="button">MAKE GM</button><button className="button button-secondary" disabled={isSaving || selectedMember.role === "player"} onClick={() => void updateMemberRole("player")} type="button">MAKE PLAYER</button><button className="button button-danger" disabled={isSaving} onClick={() => void removeMember()} type="button">REMOVE</button></div></section> : null}
    {joinUrl ? <div className="join-link-card"><div className="join-link-icon"><Send size={18} /></div><div><p className="eyebrow">PLAYER JOIN LINK</p><h3>{joinUrl}</h3><p>One use · no expiration</p></div><button className="button button-secondary" disabled={isSaving} onClick={() => void copyJoinLink()} type="button">COPY LINK</button></div> : !isPersistent ? <div className="join-link-card"><div className="join-link-icon"><Send size={18} /></div><div><p className="eyebrow">PLAYER JOIN LINK</p><h3>signalnoise.starboard.app/join/8QF-29K</h3><p>Created 2 days ago · Expires in 5 days · 1 use remaining</p></div><button className="button button-secondary" onClick={() => onAction("Join link copied to clipboard.")} type="button">COPY LINK</button></div> : null}
  </PageLayout>;
}

function PageLayout({ eyebrow, title, description, action, onAction, children }: { eyebrow: string; title: string; description: string; action?: string; onAction: () => void; children: React.ReactNode }) { return <><CampaignArtEditorSlot /><div className="page-intro"><div><p className="eyebrow eyebrow-bright">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action ? <button className="button button-primary" onClick={onAction} type="button"><CirclePlus size={16} /> {action}</button> : null}</div>{children}</>; }

function FeedItem({ icon: Icon, accent, title, detail, age }: { icon: LucideIcon; accent: string; title: string; detail: string; age: string }) { return <article className="feed-item"><div className={`feed-icon feed-icon-${accent}`}><Icon size={16} /></div><div><h3>{title}</h3><p>{detail}</p></div><span>{age}</span></article>; }
