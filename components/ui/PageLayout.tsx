import type { ReactNode } from "react";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";

export type PageLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  children: ReactNode;
};

const defaultActionIcon = <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /></svg>;

export function PageLayout({ eyebrow, title, description, action, onAction, actionIcon = defaultActionIcon, children }: PageLayoutProps) {
  return <><CampaignArtEditorSlot /><div className="page-intro"><div><p className="eyebrow eyebrow-bright">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{action && onAction ? <button className="button button-primary" onClick={onAction} type="button">{actionIcon} {action}</button> : null}</div>{children}</>;
}

export default PageLayout;