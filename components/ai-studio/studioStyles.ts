import { MapPin, Skull, User, UserRound, type LucideIcon } from "lucide-react";
import type { StudioSubjectKind } from "@/lib/validation/studio";

export const studioPanel = "min-w-0 border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5";
export const studioInput = "mt-1 w-full min-w-0 border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--dim)] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] disabled:opacity-50";
export const studioButton = "inline-flex min-h-9 items-center justify-center gap-2 border border-[var(--cyan)] px-3 py-2 !font-mono !text-xs text-[var(--cyan)] hover:bg-[var(--cyan)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-40";
export const studioPrimaryButton = "inline-flex min-h-10 items-center justify-center gap-2 border border-[var(--cyan)] bg-[var(--cyan)] px-4 py-2 !font-mono !text-xs !font-semibold tracking-[.08em] text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:bg-transparent disabled:text-[var(--dim)] disabled:shadow-none";
export const studioGhostButton = "inline-flex min-h-8 items-center justify-center gap-1.5 border border-[var(--line)] px-2.5 py-1.5 !font-mono !text-[11px] text-[var(--muted)] hover:border-[var(--cyan)] hover:text-[var(--cyan)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-40";
export const studioToggle = "inline-flex min-h-9 items-center justify-center gap-2 border px-3 py-2 !font-mono !text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-[var(--cyan)] aria-pressed:bg-[var(--cyan)]/10 aria-pressed:text-[var(--cyan)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]";
export const studioLabel = "block min-w-0 text-xs text-[var(--muted)]";
export const studioMicro = "font-mono text-[10px] tracking-[.11em] text-[var(--dim)]";
export const studioBadge = "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] tracking-[.1em]";

export const studioKindIcons: Record<StudioSubjectKind, LucideIcon> = { character: User, npc: UserRound, enemy: Skull, place: MapPin };
export const studioKindLabels: Record<StudioSubjectKind, string> = { character: "Character", npc: "NPC", enemy: "Enemy / monster", place: "Place" };
export const studioKindTones: Record<StudioSubjectKind, string> = {
  character: "border-[var(--cyan)]/50 text-[var(--cyan)]",
  npc: "border-[var(--green)]/50 text-[var(--green)]",
  enemy: "border-[var(--pink)]/50 text-[var(--pink)]",
  place: "border-[var(--amber)]/50 text-[var(--amber)]",
};
