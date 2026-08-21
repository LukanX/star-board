"use client";

import { Radio, X } from "lucide-react";

export type CampaignToastHostProps = { message: string | null; onDismiss: () => void };

export function CampaignToastHost({ message, onDismiss }: CampaignToastHostProps) {
  return message ? <div className="toast"><span className="toast-icon"><Radio size={14} /></span><span>{message}</span><button aria-label="Dismiss notification" onClick={onDismiss} title="Dismiss notification" type="button"><X size={14} /></button></div> : null;
}

export default CampaignToastHost;