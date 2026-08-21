import type { ReactNode } from "react";

export type CampaignShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
  toast?: ReactNode;
};

export function CampaignShell({ sidebar, children, toast }: CampaignShellProps) {
  return <main className="app-shell">{sidebar}<div className="app-content">{children}</div>{toast}</main>;
}

export default CampaignShell;