import type { ReactNode } from "react";

export type AppStatusProps = {
  title: string;
  message: string;
  action?: ReactNode;
};

export function AppStatus({ title, message, action }: AppStatusProps) {
  return <main className="app-status-shell"><section className="app-status-panel"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> STAR BOARD</p><h1>{title}</h1><p>{message}</p>{action}</section></main>;
}

export default AppStatus;