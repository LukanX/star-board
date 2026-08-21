"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import { markCampaignArtPersisted, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import type { ApiFaction, ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree } from "@/lib/places";

type FactionDraft = {
  name: string;
  description: string;
  status: string;
  placeId: string | null;
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyFactionDraft: FactionDraft = { name: "", description: "", status: "active", placeId: null, artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function toDraft(faction?: ApiFaction): FactionDraft {
  return faction ? { name: faction.name, description: faction.description, status: faction.status, placeId: faction.place_id, artSubject: faction.art_subject ?? "", artPath: faction.art_path, artUrl: faction.art_url ?? null, artPrompt: faction.art_prompt, artProvider: faction.art_provider ?? null } : emptyFactionDraft;
}

export default function FactionEditor({ campaignId, places, faction, onSaved, onCancel }: { campaignId: string; places: ApiPlace[]; faction?: ApiFaction; onSaved?: (faction: ApiFaction) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<FactionDraft>(() => toDraft(faction));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const update = (field: keyof FactionDraft, value: string | null) => setDraft((current) => ({ ...current, [field]: value }));

  useCampaignArtEditor({ campaignId, kind: "faction", value: draft.artPath, trackUnsavedUploads: true, url: draft.artUrl, subject: draft.artSubject, currentPrompt: draft.artPrompt, onSubjectChange: (value) => update("artSubject", value), onChange: (value) => update("artPath", value), onUrlChange: (value) => update("artUrl", value), onPromptChange: (value) => update("artPrompt", value), onProviderChange: (value) => update("artProvider", value) });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/factions${faction ? `/${encodeURIComponent(faction.id)}` : ""}`, { method: faction ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = (await response.json()) as { error?: string; faction?: ApiFaction };
      if (!response.ok || !result.faction) throw new Error(result.error ?? "Faction could not be saved.");
      markCampaignArtPersisted(campaignId, result.faction.art_path);
      onSaved?.(result.faction);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Faction could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM FACTION RECORD</p><h2>{faction ? `Edit ${faction.name}` : "Add a faction"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE FACTION"}</button><button aria-label="Close faction editor" className="icon-button" onClick={onCancel} title="Close faction editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/faction" entityLabel="faction" mode={faction ? "refine" : "create"} requestFields={{ name: draft.name, status: draft.status }} currentDraft={{ name: draft.name, status: draft.status, description: draft.description, visualPrompt: draft.artSubject }} fields={[{ key: "name", label: "Name", maxLength: 160 }, { key: "status", label: "Status", maxLength: 80 }, { key: "description", label: "Public description", maxLength: 4000, multiline: true }, { key: "visualPrompt", label: "Emblem or logo description", maxLength: 1600, multiline: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, name: candidate.name ?? current.name, status: candidate.status ?? current.status, description: candidate.description ?? current.description, artSubject: candidate.visualPrompt ?? current.artSubject }))} /> : null}<form className="character-form" onSubmit={save}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>Status<input required maxLength={80} value={draft.status} onChange={(event) => update("status", event.target.value)} /></label></div><label>Public description<textarea maxLength={4000} value={draft.description} onChange={(event) => update("description", event.target.value)} /></label><label className="place-quick-field">Primary place<select value={draft.placeId ?? ""} onChange={(event) => update("placeId", event.target.value || null)}><option value="">NO PRIMARY PLACE</option>{flattenPlaceTree(places).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}</select></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit">{isSaving ? "SAVING..." : faction ? "SAVE CHANGES" : "ADD FACTION"}</button><button className="text-action" disabled={isSaving} onClick={onCancel} type="button">CANCEL</button></div></form></section>;
}