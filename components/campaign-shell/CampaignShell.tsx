import type { ReactNode } from "react";

export type CampaignShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  toast?: ReactNode;
};

export function CampaignShell({
  sidebar,
  children,
  toast,
}: CampaignShellProps) {
  return (
    <main data-campaign-shell className="relative flex min-h-screen overflow-hidden bg-[var(--background)] before:pointer-events-none before:fixed before:inset-0 before:z-10 before:opacity-25 before:bg-[linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.012)_1px,transparent_1px)] before:bg-[length:4px_4px,4px_4px] before:mix-blend-screen before:content-['']">
      {sidebar}
      <div className="min-w-0 flex-1 bg-[radial-gradient(circle_at_80%_0%,rgba(97,46,116,.11),transparent_30%),#080b11]">
        {children}
      </div>
      {toast}
    </main>
  );
}

export default CampaignShell;
