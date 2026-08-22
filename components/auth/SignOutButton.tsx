"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type SignOutButtonProps = {
  className?: string;
  compact?: boolean;
  label?: string;
};

export default function SignOutButton({
  className = "h-[37px] inline-flex items-center justify-center gap-2 px-[14px] border border-[var(--line)] text-[var(--ink)] font-mono text-[9px] tracking-[.12em] cursor-pointer transition-[transform,background,border] duration-[200ms] whitespace-nowrap hover:-translate-y-px bg-[rgba(255,255,255,.035)] text-[var(--muted)] hover:border-[rgba(98,232,255,.45)] hover:text-[var(--ink)]",
  compact = false,
  label = "SIGN OUT",
}: SignOutButtonProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setIsSigningOut(true);
    setError(null);

    try {
      const { error: signOutError } =
        await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      window.location.assign("/");
    } catch (signOutError: unknown) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out.",
      );
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Sign out"
        className={className}
        disabled={isSigningOut}
        onClick={() => void signOut()}
        title="Sign out"
        type="button"
      >
        <LogOut size={compact ? 16 : 15} />
        {!compact ? (isSigningOut ? "SIGNING OUT..." : label) : null}
      </button>
      {error ? (
        <span className="max-w-[220px] text-[var(--pink)] text-[9px] leading-[1.4]" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
