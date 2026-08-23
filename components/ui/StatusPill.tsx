import type { ReactNode } from "react";

export type StatusPillProps = {
  children: ReactNode;
  color?: string;
  className?: string;
};

const statusClassNames: Record<string, string> = {
  cyan: "border-[var(--cyan)] bg-[rgba(98,232,255,.08)] text-[var(--cyan)]",
  pink: "border-[var(--pink)] bg-[rgba(255,92,154,.08)] text-[var(--pink)]",
  amber: "border-[var(--amber)] bg-[rgba(245,184,75,.08)] text-[var(--amber)]",
  purple: "border-[var(--purple)] bg-[rgba(185,146,255,.08)] text-[var(--purple)]",
  muted: "border-[rgba(124,135,150,.35)] bg-[rgba(124,135,150,.07)] text-[#7c8796]",
  open: "border-[rgba(98,232,255,.34)] bg-[rgba(98,232,255,.05)] text-[var(--cyan)] shadow-none",
};

export function StatusPill({ children, color = "cyan", className }: StatusPillProps) {
  return <span className={`inline-flex min-h-5 items-center whitespace-nowrap border px-[7px] py-0 font-mono text-[8px] tracking-[.1em] ${statusClassNames[color] ?? statusClassNames.cyan}${className ? ` ${className}` : ""}`}>{children}</span>;
}

export default StatusPill;