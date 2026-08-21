import type { ReactNode } from "react";
import CampaignRouteLink from "@/components/campaign-shell/CampaignRouteLink";

export type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
  actionHref?: string;
  actionIcon?: ReactNode;
};

const defaultActionIcon = <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14"><path d="M7 17 17 7M8 7h9v9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;

export function SectionHeading({ eyebrow, title, action, onAction, actionHref, actionIcon = defaultActionIcon }: SectionHeadingProps) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && actionHref ? <CampaignRouteLink className="text-action" href={actionHref}>{action} {actionIcon}</CampaignRouteLink> : action && onAction ? <button className="text-action" onClick={onAction} type="button">{action} {actionIcon}</button> : null}</div>;
}

export default SectionHeading;