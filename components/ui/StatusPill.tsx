import type { ReactNode } from "react";

export type StatusPillProps = {
  children: ReactNode;
  color?: string;
};

export function StatusPill({ children, color = "cyan" }: StatusPillProps) {
  return <span className={`status-pill status-${color}`}>{children}</span>;
}

export default StatusPill;