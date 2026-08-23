"use client";

import { Radio, X } from "lucide-react";

export type CampaignToastHostProps = { message: string | null; onDismiss: () => void };

export function CampaignToastHost({ message, onDismiss }: CampaignToastHostProps) {
  return message ? <div className="fixed right-[25px] bottom-6 z-50 flex min-h-[47px] max-w-[min(370px,calc(100vw-30px))] items-center gap-[10px] border border-[rgba(98,232,255,.42)] bg-[#101923] pl-[7px] pr-[10px] text-[11px] text-[var(--ink)] shadow-[0_12px_35px_rgba(0,0,0,.35)] animate-[toast-in_.22s_ease-out] max-[760px]:right-[15px] max-[760px]:bottom-[15px]"><span className="grid h-[31px] w-[31px] flex-[0_0_31px] place-items-center bg-[rgba(98,232,255,.1)] text-[var(--cyan)]"><Radio size={14} /></span><span>{message}</span><button aria-label="Dismiss notification" className="ml-[6px] grid place-items-center border-0 bg-transparent p-0 text-[var(--dim)] cursor-pointer hover:text-[var(--ink)]" onClick={onDismiss} title="Dismiss notification" type="button"><X size={14} /></button></div> : null;
}

export default CampaignToastHost;