"use client";

import { FormEvent, useState } from "react";
import { Check } from "lucide-react";

export default function MemberProfileForm({ campaignId, initialDisplayName, onSaved }: { campaignId: string; initialDisplayName: string; onSaved: (displayName: string) => void }) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDisplayName = displayName.trim();

    if (!nextDisplayName) {
      setError("Display name cannot be empty.");
      setStatus(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/membership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nextDisplayName }),
      });
      const result = (await response.json().catch(() => ({}))) as { displayName?: string; error?: string };

      if (!response.ok) throw new Error(result.error ?? "Unable to update display name.");

      const savedDisplayName = result.displayName ?? nextDisplayName;
      setDisplayName(savedDisplayName);
      setStatus("Display name updated.");
      onSaved(savedDisplayName);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update display name.");
    } finally {
      setIsSaving(false);
    }
  }

  return <form className="character-form" onSubmit={saveDisplayName}>
    <label>YOUR DISPLAY NAME<input maxLength={120} onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {status ? <p className="record-detail-meta" role="status">{status}</p> : null}
    <div className="character-form-actions"><button className="button button-secondary" disabled={isSaving} type="submit"><Check size={14} /> {isSaving ? "SAVING..." : "SAVE NAME"}</button></div>
  </form>;
}