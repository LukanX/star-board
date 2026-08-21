"use client";

import AppStatus from "@/components/ui/AppStatus";

export default function CampaignError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppStatus title="Campaign signal unavailable." message={error.message} action={<button className="button button-secondary" onClick={reset} type="button">RETRY LOAD</button>} />;
}