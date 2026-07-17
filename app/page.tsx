"use client";

import { useEffect, useRef, useState } from "react";
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
};

type ApiJob = {
  id: string;
  title: string;
  summary: string;
  status: string;
  art_path: string | null;
  giver: { type: "NPC" | "FACTION"; name: string };
  votes: number;
  voted: boolean;
};

const persistentMissionImages = [
  "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1000&q=85",
  "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1000&q=85",
];

function mapApiJob(job: ApiJob, index: number): Mission {
  const accent = (["cyan", "pink", "amber"] as const)[index % 3];
  const image = job.art_path?.startsWith("http") ? job.art_path : persistentMissionImages[index % persistentMissionImages.length];

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
  };
}

async function fetchCampaignJobs(campaignId: string) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs`);

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(`/?campaignId=${campaignId}`)}`;
    throw new Error("Authentication is required.");
  }

  const result = (await response.json()) as { error?: string; role?: "gm" | "player"; jobs?: ApiJob[] };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to load campaign jobs.");
  }

  return { role: result.role ?? "player", jobs: result.jobs ?? [] };
}

type NavItem = { id: NavId; label: string; icon: LucideIcon; count?: string };

const navItems: { label: string; items: NavItem[] }[] = [
  { label: "Command", items: [{ id: "overview", label: "Overview", icon: Gauge }, { id: "jobs", label: "Job board", icon: BriefcaseBusiness, count: "03" }, { id: "episodes", label: "Episodes", icon: FolderKanban, count: "08" }] },
  { label: "Archive", items: [{ id: "characters", label: "Characters", icon: UsersRound, count: "06" }, { id: "npcs", label: "NPCs", icon: UserRound, count: "14" }, { id: "factions", label: "Factions", icon: Network, count: "05" }, { id: "notes", label: "Campaign notes", icon: FileText, count: "21" }] },
];

const missionsSeed: Mission[] = [
  { id: "nightglass", title: "The Nightglass Relay", category: "SALVAGE / HIGH RISK", summary: "A dead comms relay just woke up beyond the Drift lane. Its signal is repeating a distress call in a language no archive can place.", giver: "Sera Vonn", giverType: "NPC", votes: 5, eta: "2–3 sessions", region: "Gallowglass Reach", accent: "cyan", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=85", voted: true },
  { id: "velvet", title: "A Favor in Velvet", category: "DIPLOMACY / SOCIAL", summary: "The Red Ledger wants one quiet evening at the embassy. Quiet is not usually how the crew leaves a room.", giver: "The Red Ledger", giverType: "FACTION", votes: 3, eta: "1 session", region: "Absalom Station", accent: "pink", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1000&q=85", voted: false },
  { id: "hollow", title: "Hollow Moon Protocol", category: "EXPLORATION / UNKNOWN", summary: "A survey drone has mapped a second interior to a moon that should be solid all the way through.", giver: "Dr. Ilyra Quell", giverType: "NPC", votes: 1, eta: "3+ sessions", region: "Veskarium Fringe", accent: "amber", image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1000&q=85", voted: false },
];

const crew = [
  { name: "Kaia Vex", role: "Operative", initials: "KV", color: "#ff5c9a", online: true },
  { name: "Rook-7", role: "Mechanic", initials: "R7", color: "#62e8ff", online: true },
  { name: "Mira Sol", role: "Mystic", initials: "MS", color: "#b992ff", online: false },
  { name: "Jax Tallow", role: "Envoy", initials: "JT", color: "#f5b84b", online: true },
];

const characters = [
  { name: "Kaia Vex", subtitle: "Human Operative", detail: "Ghost // Level 4", color: "pink", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80", status: "ACTIVE" },
  { name: "Rook-7", subtitle: "Android Mechanic", detail: "Exocortex // Level 4", color: "cyan", image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=600&q=80", status: "ACTIVE" },
  { name: "Mira Sol", subtitle: "Lashunta Mystic", detail: "Xenodruid // Level 4", color: "purple", image: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=600&q=80", status: "RESTING" },
  { name: "Jax Tallow", subtitle: "Ysoki Envoy", detail: "Celebrity // Level 4", color: "amber", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80", status: "ACTIVE" },
];

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
  const [isGM, setIsGM] = useState(true);
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
      setIsPersistent(true);
    }).catch((error: unknown) => {
      notify(error instanceof Error ? error.message : "Unable to load campaign jobs.");
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
  const selectView = (id: NavId) => { setActiveView(id); setMobileNavOpen(false); };
  const activeLabel = navItems.flatMap((group) => group.items).find((item) => item.id === activeView)?.label ?? "Overview";

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup"><div className="brand-symbol"><Orbit size={21} strokeWidth={1.8} /></div><div><p className="brand-name">STAR BOARD</p><p className="brand-subtitle">CAMPAIGN OPERATIONS</p></div><button aria-label="Close navigation" className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} title="Close navigation" type="button"><X size={18} /></button></div>
        <div className="campaign-switcher"><div className="campaign-orb"><Hexagon size={18} /></div><div className="campaign-switcher-copy"><span className="micro-label">ACTIVE CAMPAIGN</span><strong>Signal / Noise</strong></div><ChevronDown size={15} className="muted-icon" /></div>
        <nav className="side-nav" aria-label="Campaign navigation">{navItems.map((group) => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map((item) => { const Icon = item.icon; return <button className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`} key={item.id} onClick={() => selectView(item.id)} type="button"><Icon size={17} strokeWidth={activeView === item.id ? 2.1 : 1.7} /><span>{item.label}</span>{item.count ? <span className="nav-count">{item.count}</span> : null}</button>; })}</div>)}</nav>
        <div className="side-footer"><div className="sync-status"><span className="live-dot" /> {isPersistent ? "SUPABASE SYNC ACTIVE" : "ALL SYSTEMS NOMINAL"}</div><button className="nav-item" onClick={() => notify("Campaign settings are queued for the next build.")} type="button"><Settings2 size={17} /><span>Campaign settings</span></button><div className="profile-row"><div className="avatar avatar-user">AR</div><div><strong>Arlen Rook</strong><span>{isGM ? "GAME MASTER" : "PLAYER"}</span></div><MoreHorizontal size={17} className="muted-icon" /></div></div>
      </aside>

      <div className="app-content">
        <header className="topbar"><div className="topbar-left"><button aria-label="Open navigation" className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} title="Open navigation" type="button"><Menu size={20} /></button><div className="crumb-mark"><Command size={14} /></div><span className="crumb-muted">SIGNAL / NOISE</span><ChevronRight size={14} className="muted-icon" /><span className="crumb-current">{activeLabel.toUpperCase()}</span></div><div className="topbar-right"><button className="search-trigger" onClick={() => notify("Search will scan campaign records.")} type="button"><Search size={16} /><span>Search records</span><kbd>⌘ K</kbd></button><button aria-label="Notifications" className="icon-button notification-button" onClick={() => notify("No new priority signals.")} title="Notifications" type="button"><Bell size={17} /><span className="notification-dot" /></button><button className={`role-switch ${isGM ? "role-gm" : "role-player"}`} onClick={() => { setIsGM((current) => !current); notify(isGM ? "Player view enabled" : "GM view enabled"); }} type="button"><ShieldCheck size={15} /> {isGM ? "GM MODE" : "PLAYER MODE"}</button></div></header>
        <div className="content-frame">{activeView === "overview" ? <OverviewView missions={missions} isGM={isGM} onVote={handleVote} onAction={notify} /> : activeView === "jobs" ? <JobsView missions={missions} isGM={isGM} onVote={handleVote} onAction={notify} /> : activeView === "characters" ? <CharactersView onAction={notify} /> : activeView === "npcs" ? <NpcsView isGM={isGM} onAction={notify} /> : activeView === "factions" ? <FactionsView onAction={notify} /> : activeView === "episodes" ? <EpisodesView onAction={notify} /> : activeView === "notes" ? <NotesView isGM={isGM} onAction={notify} /> : <MembersView onAction={notify} />}</div>
      </div>
      {toast ? <div className="toast"><span className="toast-icon"><Radio size={14} /></span><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)} title="Dismiss notification" type="button"><X size={14} /></button></div> : null}
    </main>
  );
}

function OverviewView({ missions, isGM, onVote, onAction }: { missions: Mission[]; isGM: boolean; onVote: (id: string) => void; onAction: (message: string) => void }) {
  return <><div className="page-intro overview-intro"><div><p className="eyebrow eyebrow-bright"><span className="live-dot" /> LIVE CAMPAIGN // SEASON 02</p><h1>Good evening, Arlen.</h1><p className="intro-copy">The crew is between jumps. Three signals are waiting for a decision.</p></div><div className="intro-actions"><div className="last-sync"><span>LAST SYNC</span><strong>18:42:07 UTC</strong></div><button className="button button-primary" onClick={() => onAction(isGM ? "New mission draft opened." : "Only a GM can create a mission.")} type="button"><Plus size={16} /> NEW SIGNAL</button></div></div>
    <div className="signal-strip"><div className="signal-strip-pattern" /><div className="signal-copy"><span className="micro-label">CURRENT OBJECTIVE</span><strong>Decide what gets the crew off-station next.</strong></div><div className="signal-stats"><span><strong>03</strong> OPEN JOBS</span><span><strong>01</strong> ACTIVE VOTE</span><span><strong>08</strong> EPISODES LOGGED</span></div><Zap size={18} className="signal-zap" /></div>
    <div className="metric-grid"><MetricCard label="Crew roster" value="06" detail="4 active / 2 resting" icon={UsersRound} accent="cyan" /><MetricCard label="Campaign notes" value="21" detail="3 added this week" icon={FileText} accent="pink" /><MetricCard label="Next episode" value="08" detail="Last safe harbor" icon={FolderKanban} accent="amber" /><MetricCard label="GM signals" value="04" detail="2 need your review" icon={Bot} accent="purple" /></div>
    <div className="dashboard-grid"><section className="panel panel-jobboard"><div className="panel-topline"><div><p className="eyebrow">MISSION CONTROL</p><h2>Job board</h2></div><button className="icon-button" aria-label="Job board options" onClick={() => onAction("Job board filters are ready for the next build.")} title="Job board options" type="button"><MoreHorizontal size={18} /></button></div><div className="job-list">{missions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} onAction={onAction} compact />)}</div><button className="panel-footer-action" onClick={() => onAction("Full job board selected.")} type="button">VIEW ALL JOBS <ArrowUpRight size={14} /></button></section>
      <aside className="right-rail"><section className="panel crew-panel"><SectionHeading eyebrow="CREW MANIFEST" title="On the roster" action="Manage" onAction={() => onAction("Crew management selected.")} /><div className="crew-list">{crew.map((member) => <div className="crew-row" key={member.name}><div className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</div><div className="crew-copy"><strong>{member.name}</strong><span>{member.role}</span></div><span className={`online-indicator ${member.online ? "is-online" : ""}`} title={member.online ? "Online" : "Away"} /></div>)}</div><button className="invite-row" onClick={() => onAction("Invite link copied to clipboard.")} type="button"><Mail size={15} /> INVITE PLAYER <Plus size={14} /></button></section><section className="panel pulse-panel"><div className="panel-topline"><div><p className="eyebrow">CAMPAIGN PULSE</p><h2>Signal strength</h2></div><Activity size={17} className="accent-icon-cyan" /></div><div className="pulse-visual"><div className="pulse-grid" /><div className="pulse-wave pulse-wave-one" /><div className="pulse-wave pulse-wave-two" /><span className="pulse-label pulse-label-left">EP. 01</span><span className="pulse-label pulse-label-right">NOW</span></div><div className="pulse-legend"><span><i className="legend-dot dot-cyan" /> Momentum</span><strong>78%</strong></div></section></aside></div>
    <section className="feed-section"><SectionHeading eyebrow="RECENT TRANSMISSIONS" title="Signal feed" action="Open archive" onAction={() => onAction("Signal archive selected.")} /><div className="feed-grid"><FeedItem icon={Sparkles} accent="pink" title="Mission promoted to episode 08" detail="The Last Safe Harbor is now part of the campaign record." age="2h ago" /><FeedItem icon={BookOpen} accent="cyan" title="Mira added a campaign note" detail="The station has a second sun // player visible" age="4h ago" /><FeedItem icon={ImagePlus} accent="amber" title="New art asset generated" detail="The Glass Cardinal // visual profile v2" age="Yesterday" /></div></section></>;
}

function MetricCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: string }) { return <div className={`metric-card metric-${accent}`}><div className="metric-head"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{detail}</small><div className="metric-bar"><span /></div></div>; }

function MissionCard({ mission, isGM, index, onVote, onAction, compact = false }: { mission: Mission; isGM: boolean; index: number; onVote: (id: string) => void; onAction: (message: string) => void; compact?: boolean }) {
  return <article className={`mission-card mission-${mission.accent} ${compact ? "mission-compact" : ""}`}><VisualAsset src={mission.image} label={`${mission.title} artwork`} className="mission-art" /><div className="mission-art-overlay" /><div className="mission-index">0{index + 1}</div><div className="mission-content"><div className="mission-meta"><StatusPill color={mission.accent}>{mission.category}</StatusPill><span>{mission.region}</span></div><h3>{mission.title}</h3><p>{mission.summary}</p><div className="mission-footer"><span className="giver"><span className="giver-glyph">{mission.giverType === "NPC" ? "N" : "F"}</span><span><small>{mission.giverType === "NPC" ? "MISSION GIVER" : "FACTION"}</small><strong>{mission.giver}</strong></span></span><span className="mission-eta"><Clock3 size={13} /> {mission.eta}</span></div></div><div className="mission-vote"><span><strong>{mission.votes.toString().padStart(2, "0")}</strong> votes</span><button className={`vote-button ${mission.voted ? "vote-active" : ""}`} onClick={() => onVote(mission.id)} type="button"><Vote size={15} /> {mission.voted ? "VOTED" : "VOTE"}</button>{isGM ? <button className="mission-more icon-button" aria-label={`More options for ${mission.title}`} onClick={() => onAction(`${mission.title} options opened.`)} title="Mission options" type="button"><MoreHorizontal size={16} /></button> : null}</div></article>;
}

function JobsView({ missions, isGM, onVote, onAction }: { missions: Mission[]; isGM: boolean; onVote: (id: string) => void; onAction: (message: string) => void }) { return <PageLayout eyebrow="MISSION CONTROL // 03 OPEN" title="Job board" description="Potential missions, ranked by the crew. Choose the signal that pulls hardest." action={isGM ? "NEW MISSION" : undefined} onAction={() => onAction(isGM ? "Mission draft opened." : "Only a GM can create a mission.")}><div className="view-toolbar"><div className="filter-tabs"><button className="filter-tab filter-tab-active" type="button">OPEN <span>03</span></button><button className="filter-tab" onClick={() => onAction("Archived jobs selected.")} type="button">ARCHIVED <span>12</span></button><button className="filter-tab" onClick={() => onAction("Draft jobs selected.")} type="button">DRAFTS <span>02</span></button></div><button className="button button-ai" onClick={() => onAction("AI mission studio opened.")} type="button"><Sparkles size={15} /> AI MISSION STUDIO</button></div><div className="jobs-grid">{missions.map((mission, index) => <MissionCard key={mission.id} mission={mission} isGM={isGM} index={index} onVote={onVote} onAction={onAction} />)}</div></PageLayout>; }

function CharactersView({ onAction }: { onAction: (message: string) => void }) { return <PageLayout eyebrow="ARCHIVE // CREW ROSTER" title="Characters" description="The people, androids, and mysteries currently flying under the Signal / Noise flag." action="ADD CHARACTER" onAction={() => onAction("Character editor opened.")}><div className="character-grid">{characters.map((character) => <article className="character-card" key={character.name}><VisualAsset src={character.image} label={`${character.name} portrait`} className={`character-art character-${character.color}`} /><div className="character-body"><div className="card-status-row"><StatusPill color={character.status === "ACTIVE" ? "cyan" : "muted"}>{character.status}</StatusPill><button className="icon-button" aria-label={`Open ${character.name} options`} onClick={() => onAction(`${character.name} options opened.`)} title="Character options" type="button"><MoreHorizontal size={16} /></button></div><h3>{character.name}</h3><p>{character.subtitle}</p><span className="mono-detail">{character.detail}</span><button className="card-link" onClick={() => onAction(`${character.name} character sheet opened.`)} type="button">OPEN RECORD <ArrowUpRight size={13} /></button></div></article>)}</div><section className="lower-band"><div className="lower-copy"><p className="eyebrow">PLAYER VIEW</p><h2>Everyone has a story in the archive.</h2><p>Characters can carry a portrait, a Markdown backstory, and the notes their players want the crew to know.</p></div><div className="markdown-preview"><div className="preview-toolbar"><FileText size={14} /> BACKSTORY.MD <span>PLAYER VISIBLE</span></div><p><strong>Kaia keeps a list</strong> of every station where the lights flickered before someone disappeared.</p></div></section></PageLayout>; }

function NpcsView({ isGM, onAction }: { isGM: boolean; onAction: (message: string) => void }) { return <PageLayout eyebrow="ARCHIVE // CONTACTS" title="NPCs" description="People worth knowing, watching, or avoiding. Their private context stays behind the GM lock." action={isGM ? "ADD NPC" : undefined} onAction={() => onAction(isGM ? "NPC editor opened." : "Only a GM can create NPCs.")}><div className="record-list">{npcs.map((npc) => <article className="record-row" key={npc.name}><div className={`record-icon record-icon-${npc.color}`}><UserRound size={19} /></div><div className="record-main"><div className="record-title-row"><h3>{npc.name}</h3><StatusPill color={npc.color}>{npc.status}</StatusPill></div><p>{npc.subtitle}</p><span className="record-meta"><Map size={13} /> {npc.location}</span></div><div className="record-visibility"><span><BookOpen size={14} /> PLAYER NOTES</span>{isGM ? <span className="private-note"><LockKeyhole size={13} /> GM NOTES</span> : null}</div><button className="icon-button" aria-label={`Open ${npc.name}`} onClick={() => onAction(`${npc.name} record opened.`)} title={`Open ${npc.name}`} type="button"><ChevronRight size={17} /></button></article>)}</div><div className="ai-callout"><div className="ai-callout-icon"><Bot size={20} /></div><div><p className="eyebrow">GM TOOL // AI ASSIST</p><h3>Build a contact from a single signal.</h3><p>Generate a whole NPC or refine one detail while you are in the editor. Every suggestion stays a draft until you approve it.</p></div><button className="button button-ai" onClick={() => onAction("AI NPC studio opened.")} type="button"><Sparkles size={15} /> OPEN STUDIO</button></div></PageLayout>; }

function FactionsView({ onAction }: { onAction: (message: string) => void }) { return <PageLayout eyebrow="ARCHIVE // POWER MAP" title="Factions" description="The groups shaping the lanes around Signal / Noise. Use them as mission givers and campaign context." action="ADD FACTION" onAction={() => onAction("Faction editor opened.")}><div className="faction-grid">{factions.map((faction) => <article className={`faction-card faction-${faction.color}`} key={faction.name}><div className="faction-top"><div className="faction-emblem"><Network size={20} /></div><StatusPill color={faction.color}>{faction.status}</StatusPill></div><h3>{faction.name}</h3><p>{faction.type}</p><div className="faction-footer"><span><strong>{faction.members}</strong><small>KNOWN MEMBERS</small></span><button className="icon-button" aria-label={`Open ${faction.name}`} onClick={() => onAction(`${faction.name} record opened.`)} title={`Open ${faction.name}`} type="button"><ArrowUpRight size={16} /></button></div></article>)}</div><div className="map-panel"><div className="map-copy"><p className="eyebrow">RELATIONSHIP MAP</p><h2>The board has a gravity well.</h2><p>Every favor, debt, and cold shoulder can become the next mission. Faction relationships are campaign context, not a spreadsheet.</p><button className="text-action" onClick={() => onAction("Faction relationship map selected.")} type="button">OPEN MAP <ArrowUpRight size={14} /></button></div><div className="map-visual"><div className="map-lines" /><div className="map-node map-node-one">RL</div><div className="map-node map-node-two">HC</div><div className="map-node map-node-three">VA</div><span className="map-label map-label-one">RED LEDGER</span><span className="map-label map-label-two">HELIX</span></div></div></PageLayout>; }

function EpisodesView({ onAction }: { onAction: (message: string) => void }) { return <PageLayout eyebrow="CAMPAIGN LOG // 08 EPISODES" title="Episodes" description="The campaign record, one transmission at a time." action="NEW EPISODE" onAction={() => onAction("Episode editor opened.")}><div className="episode-list">{episodes.map((episode, index) => <article className={`episode-row ${index === 0 ? "episode-current" : ""}`} key={episode.number}><div className="episode-number"><span>EP.</span><strong>{episode.number}</strong></div><div className="episode-info"><div className="record-title-row"><h3>{episode.title}</h3><StatusPill color={index === 0 ? "cyan" : "muted"}>{episode.status}</StatusPill></div><p>{episode.summary}</p><span className="record-meta"><Clock3 size={13} /> {episode.date} <span className="meta-divider" /> <FileText size={13} /> {index === 0 ? "3 notes" : "6 notes"}</span></div><button className="episode-open" onClick={() => onAction(`Episode ${episode.number} opened.`)} type="button">OPEN <ArrowUpRight size={14} /></button></article>)}</div><div className="promotion-card"><div className="promotion-icon"><Sparkles size={18} /></div><div><p className="eyebrow">PROMOTE A SIGNAL</p><h3>The job board is where episodes begin.</h3><p>When the crew is ready, a GM can promote an open mission into the campaign log with its public context preserved.</p></div><button className="button button-secondary" onClick={() => onAction("Open missions ready to promote: 3.")} type="button">REVIEW JOBS <ArrowUpRight size={14} /></button></div></PageLayout>; }

function NotesView({ isGM, onAction }: { isGM: boolean; onAction: (message: string) => void }) { return <PageLayout eyebrow="CAMPAIGN LOG // SHARED MEMORY" title="Campaign notes" description="Global context and episode notes, with authorship and visibility kept visible." action="ADD NOTE" onAction={() => onAction("Note editor opened.")}><div className="notes-toolbar"><div className="filter-tabs"><button className="filter-tab filter-tab-active" type="button">ALL NOTES <span>21</span></button><button className="filter-tab" onClick={() => onAction("Global notes selected.")} type="button">GLOBAL <span>12</span></button><button className="filter-tab" onClick={() => onAction("Episode notes selected.")} type="button">EPISODES <span>09</span></button></div>{isGM ? <button className="visibility-toggle" onClick={() => onAction("GM-only filter enabled.")} type="button"><LockKeyhole size={14} /> GM ONLY</button> : null}</div><div className="notes-list">{notes.map((note) => <article className="note-row" key={note.title}><AccentMark color={note.accent} /><div className="note-main"><div className="note-meta"><span>{note.scope}</span><span className={`note-visibility ${note.visibility === "GM ONLY" ? "note-private" : ""}`}>{note.visibility === "GM ONLY" ? <LockKeyhole size={12} /> : <BookOpen size={12} />} {note.visibility}</span></div><h3>{note.title}</h3><p>Added by <strong>{note.author}</strong> <span className="meta-divider" /> {note.age}</p></div><button className="icon-button" aria-label={`Open note ${note.title}`} onClick={() => onAction(`${note.title} opened.`)} title="Open note" type="button"><ChevronRight size={17} /></button></article>)}</div></PageLayout>; }

function MembersView({ onAction }: { onAction: (message: string) => void }) { return <PageLayout eyebrow="CAMPAIGN ADMIN // MEMBERS" title="Crew access" description="Manage who can see the campaign and who is trusted to shape it." action="CREATE JOIN LINK" onAction={() => onAction("Shareable player join link created.")}><div className="member-summary"><div><p className="eyebrow">ACCESS MODEL</p><h2>One campaign. Two levels of clearance.</h2><p>Player-visible content is shared by default. GM notes, mission controls, and campaign administration stay behind the command lock.</p></div><div className="clearance-key"><span><i className="legend-dot dot-cyan" /> PLAYER VISIBLE</span><span><i className="legend-dot dot-pink" /> GM ONLY</span></div></div><div className="member-list">{[{ name: "Arlen Rook", role: "GAME MASTER", status: "OWNER", initials: "AR", color: "#f5b84b" }, ...crew.map((member) => ({ name: member.name, role: "PLAYER", status: "ACTIVE", initials: member.initials, color: member.color }))].map((member) => <div className="member-row" key={member.name}><div className="avatar" style={{ backgroundColor: member.color }}>{member.initials}</div><div className="member-copy"><strong>{member.name}</strong><span>{member.role}</span></div><StatusPill color={member.role === "GAME MASTER" ? "amber" : "cyan"}>{member.status}</StatusPill><span className="member-last">Last active 24m ago</span><button className="icon-button" aria-label={`Open ${member.name} options`} onClick={() => onAction(`${member.name} access options opened.`)} title="Member options" type="button"><MoreHorizontal size={17} /></button></div>)}</div><div className="join-link-card"><div className="join-link-icon"><Send size={18} /></div><div><p className="eyebrow">PLAYER JOIN LINK</p><h3>signalnoise.starboard.app/join/8QF-29K</h3><p>Created 2 days ago · Expires in 5 days · 1 use remaining</p></div><button className="button button-secondary" onClick={() => onAction("Join link copied to clipboard.")} type="button">COPY LINK</button></div></PageLayout>; }

function PageLayout({ eyebrow, title, description, action, onAction, children }: { eyebrow: string; title: string; description: string; action?: string; onAction: () => void; children: React.ReactNode }) { return <><div className="page-intro"><div><p className="eyebrow eyebrow-bright">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action ? <button className="button button-primary" onClick={onAction} type="button"><CirclePlus size={16} /> {action}</button> : null}</div>{children}</>; }

function FeedItem({ icon: Icon, accent, title, detail, age }: { icon: LucideIcon; accent: string; title: string; detail: string; age: string }) { return <article className="feed-item"><div className={`feed-icon feed-icon-${accent}`}><Icon size={16} /></div><div><h3>{title}</h3><p>{detail}</p></div><span>{age}</span></article>; }
