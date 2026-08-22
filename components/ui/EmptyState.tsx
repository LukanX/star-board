import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type EmptyStateProps = {
  title: string;
  message: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

export function EmptyState({ title, message, icon: Icon, action }: EmptyStateProps) {
  return <div className="character-empty grid justify-items-center gap-[9px] border border-dashed border-[rgba(139,151,169,.28)] px-5 py-12 text-center text-[var(--cyan)]">{Icon ? <Icon size={22} /> : null}<h2 className="m-0 text-[18px] text-[var(--ink)]">{title}</h2><p className="m-0 text-[11px] text-[var(--muted)]">{message}</p>{action}</div>;
}

export default EmptyState;