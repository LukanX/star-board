"use client";
export default function SystemError({ reset }: { reset: () => void }) {
  return <section role="alert" className="border border-[var(--pink)] p-5"><h1 className="text-lg">System library unavailable</h1><p className="text-sm">Reference data could not be loaded. Check that the System library migrations are applied, then retry.</p><button className="border border-[var(--cyan)] p-2 text-[var(--cyan)]" onClick={reset}>Retry</button></section>;
}
