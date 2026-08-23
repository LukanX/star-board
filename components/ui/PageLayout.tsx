import type { ReactNode } from "react";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import { eyebrowBrightClassName } from "@/components/ui/terminalStyles";

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
  return <><CampaignArtEditorSlot /><div className="page-intro flex items-end justify-between gap-6 mb-[29px] max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[19px] max-[760px]:mb-[25px]"><div><p className={eyebrowBrightClassName}>{eyebrow}</p><h1>{title}</h1><p className="m-0 max-w-[510px] text-[var(--muted)] text-[13px] leading-[1.6]">{description}</p></div>{action && onAction ? <button className="h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px !border-[var(--cyan)] bg-[var(--cyan)] !text-[#061017] shadow-[0_0_20px_rgba(98,232,255,.16)] hover:bg-[#8ceeff]" onClick={onAction} type="button">{actionIcon} {action}</button> : null}</div>{children}</>;
}

export default PageLayout;