"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type SignOutButtonProps = {
  className?: string;
  compact?: boolean;
  label?: string;
};

export default function SignOutButton({ className = "button button-secondary", compact = false, label = "SIGN OUT" }: SignOutButtonProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setIsSigningOut(true);
    setError(null);

    try {
      const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut();
      if (signOutError) throw signOutError;
      window.location.assign("/");
    } catch (signOutError: unknown) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out.");
      setIsSigningOut(false);
    }
  }

  return (
    <div className="signout-control">
      <button aria-label="Sign out" className={className} disabled={isSigningOut} onClick={() => void signOut()} title="Sign out" type="button">
        <LogOut size={compact ? 16 : 15} />
        {!compact ? (isSigningOut ? "SIGNING OUT..." : label) : null}
      </button>
      {error ? <span className="signout-error" role="alert">{error}</span> : null}
    </div>
  );
}
