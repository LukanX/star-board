import type { ReactNode } from "react";

export type AppStatusProps = {
  title: string;
  message: string;
  action?: ReactNode;
};

export function AppStatus({ title, message, action }: AppStatusProps) {
  return <main className="app-status-shell grid min-h-screen place-items-center bg-[radial-gradient(circle_at_50%_0%,rgba(98,232,255,.1),transparent_34%),var(--background)] p-6"><section className="app-status-panel w-full max-w-[520px] border border-[rgba(98,232,255,.24)] bg-[rgba(12,17,25,.92)] p-8 shadow-[0_24px_80px_rgba(0,0,0,.32)]"><p className="eyebrow eyebrow-bright"><span className="live-dot" /> STAR BOARD</p><h1 className="mb-3 text-[31px]">{title}</h1><p className="mb-[22px] text-[12px] leading-[1.6] text-[var(--muted)]">{message}</p>{action}</section></main>;
}

export default AppStatus;