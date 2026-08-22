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
  return <div className="section-heading flex items-start justify-between gap-[15px]"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && actionHref ? <CampaignRouteLink className="text-action inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer hover:text-[#a1f3ff]" href={actionHref}>{action} {actionIcon}</CampaignRouteLink> : action && onAction ? <button className="text-action inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 font-mono text-[8px] tracking-[.1em] text-[var(--cyan)] cursor-pointer hover:text-[#a1f3ff]" onClick={onAction} type="button">{action} {actionIcon}</button> : null}</div>;
}

export default SectionHeading;