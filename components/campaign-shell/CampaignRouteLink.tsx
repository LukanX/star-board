"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";

export default function CampaignRouteLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  const { confirmNavigation } = useDirtyForm();

  return <Link {...props} onNavigate={(event) => {
    if (!confirmNavigation()) {
      event.preventDefault();
      return;
    }

    onNavigate?.(event);
  }} />;
}