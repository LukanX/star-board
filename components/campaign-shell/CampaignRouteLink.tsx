"use client";

import { useRef, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";

export default function CampaignRouteLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  const { confirmNavigation, hasLeaveGuards, prepareNavigation } = useDirtyForm();
  const router = useRouter();
  const anchor = useRef<HTMLAnchorElement>(null);
  const navigating = useRef(false);

  return <Link {...props} ref={anchor} onNavigate={(event) => {
    if (hasLeaveGuards()) {
      event.preventDefault();
      if (navigating.current) return;
      const href = anchor.current?.getAttribute("href");
      if (!href) throw new Error("Campaign navigation is missing its destination.");
      navigating.current = true;
      void prepareNavigation().then((accepted) => {
        if (accepted) {
          onNavigate?.(event);
          router.push(href, { scroll: props.scroll ?? true });
        }
      }).finally(() => { navigating.current = false; });
      return;
    }
    if (!confirmNavigation()) {
      event.preventDefault();
      return;
    }

    onNavigate?.(event);
  }} />;
}