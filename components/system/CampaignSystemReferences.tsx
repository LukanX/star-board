"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Save, Sparkles } from "lucide-react";
import { useDirtyForm } from "@/components/campaign-shell/DirtyFormProvider";
import { panelClassName, recordActionButtonClassName } from "@/components/ui/recordStyles";
import { eyebrowClassName } from "@/components/ui/terminalStyles";
import { systemReferenceSettingsSchema, type SystemReferenceSettings } from "@/lib/validation/system-reference";

export default function CampaignSystemReferences({ campaignId }: { campaignId: string }) {
  const [settings, setSettings] = useState<SystemReferenceSettings | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const { setDirty, clearDirty } = useDirtyForm();
  const clearDirtyOnUnmount = useRef(clearDirty);
  useEffect(() => () => clearDirtyOnUnmount.current("system-settings"), []);
  const url = `/api/campaigns/${encodeURIComponent(campaignId)}/system-references`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "System reference settings could not be loaded.");
      return systemReferenceSettingsSchema.parse(result.settings);
    }).then((value) => { if (!controller.signal.aborted) { setSettings(value); setError(""); } })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "System reference settings could not be loaded."); });
    return () => controller.abort();
  }, [url, retry]);
  async function save(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setSaved(false);
    try {
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "System reference settings could not be saved.");
      setSettings(systemReferenceSettingsSchema.parse(result.settings)); clearDirty("system-settings"); setSaved(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "System reference settings could not be saved."); }
    finally { setPending(false); }
  }
  const choices: Array<{ key: keyof SystemReferenceSettings; label: string }> = [{ key: "appearance", label: "Use ancestry appearance" }, { key: "lore", label: "Use ancestry lore" }, { key: "creatureTraits", label: "Use creature-trait context" }];
  return <form onSubmit={save} className={`${panelClassName} grid min-w-0 gap-4 p-[18px_21px_21px] max-[760px]:px-4`}>
    <div className="panel-topline flex items-start justify-between gap-4 border-b border-[var(--line)] pb-4">
      <div><p className={eyebrowClassName}>GM CONTROL // LIBRARY CONTEXT</p><h2 className="m-0 text-[16px]">System reference context</h2></div>
      <Sparkles className="shrink-0 text-[var(--cyan)]" size={17} />
    </div>
    <p className="m-0 max-w-3xl text-[11px] leading-relaxed text-[var(--muted)]">All switches start off. Only explicitly selected references contribute the latest user-entered library text. Artwork uses appearance only. Text goes to this campaign&apos;s AI provider; these are not verified official rules.</p>
    {settings ? choices.map(({ key, label }) => <label key={key} className="flex min-w-0 items-center gap-3 border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-[11px] text-[var(--ink)]"><input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--cyan)] focus-visible:outline focus-visible:outline-[var(--cyan)]" checked={settings[key]} disabled={pending} onChange={(event) => { setSettings({ ...settings, [key]: event.target.checked }); setDirty("system-settings"); setSaved(false); }} />{label}</label>) : !error ? <p role="status" className="text-[11px] text-[var(--muted)]">Loading settings...</p> : <button className={`${recordActionButtonClassName} justify-self-start`} type="button" onClick={() => setRetry((value) => value + 1)}>Retry loading settings</button>}
    {error ? <p role="alert" className="text-sm text-[var(--pink)]">{error}</p> : null}
    {saved ? <p role="status" className="text-sm text-[var(--green)]">System reference settings saved.</p> : null}
    <div className="flex justify-end border-t border-[var(--line)] pt-4"><button type="submit" disabled={!settings || pending} className={`${recordActionButtonClassName} !border-[var(--cyan)] !bg-[var(--cyan)] !text-[#061017] focus-visible:outline focus-visible:outline-[var(--cyan)]`}><Save size={14} />{pending ? "SAVING..." : "SAVE SYSTEM SETTINGS"}</button></div>
  </form>;
}
