"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LockKeyhole, Sparkles, X } from "lucide-react";
import AiDraftAssistant from "@/components/archive/AiDraftAssistant";
import { markCampaignArtPersisted, useCampaignArtEditor } from "@/components/archive/CampaignArtField";
import type { ApiNpc, ApiPlace } from "@/lib/campaign/types";
import { flattenPlaceTree } from "@/lib/places";

type NpcDraft = {
  name: string;
  species: string;
  role: string;
  description: string;
  playerNotesMarkdown: string;
  gmNotesMarkdown: string;
  placeId: string | null;
  artSubject: string;
  artPath: string | null;
  artUrl: string | null;
  artPrompt: string | null;
  artProvider: string | null;
};

const emptyNpcDraft: NpcDraft = { name: "", species: "", role: "", description: "", playerNotesMarkdown: "", gmNotesMarkdown: "", placeId: null, artSubject: "", artPath: null, artUrl: null, artPrompt: null, artProvider: null };

function toDraft(npc?: ApiNpc): NpcDraft {
  return npc ? { name: npc.name, species: npc.species, role: npc.role, description: npc.description, playerNotesMarkdown: npc.player_notes_markdown, gmNotesMarkdown: npc.gm_notes_markdown ?? "", placeId: npc.place_id, artSubject: npc.art_subject ?? "", artPath: npc.art_path, artUrl: npc.art_url ?? null, artPrompt: npc.art_prompt, artProvider: npc.art_provider ?? null } : emptyNpcDraft;
}

export default function NpcEditor({ campaignId, places, npc, onSaved, onCancel }: { campaignId: string; places: ApiPlace[]; npc?: ApiNpc; onSaved?: (npc: ApiNpc) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<NpcDraft>(() => toDraft(npc));
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const update = (field: keyof NpcDraft, value: string | null) => setDraft((current) => ({ ...current, [field]: value }));

  useCampaignArtEditor(npc || draft ? { campaignId, kind: "npc", value: draft.artPath, trackUnsavedUploads: true, url: draft.artUrl, subject: draft.artSubject, currentPrompt: draft.artPrompt, onSubjectChange: (value) => update("artSubject", value), onChange: (value) => update("artPath", value), onUrlChange: (value) => update("artUrl", value), onPromptChange: (value) => update("artPrompt", value), onProviderChange: (value) => update("artProvider", value) } : null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/npcs${npc ? `/${encodeURIComponent(npc.id)}` : ""}`, { method: npc ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = (await response.json()) as { error?: string; npc?: ApiNpc };
      if (!response.ok || !result.npc) throw new Error(result.error ?? "NPC could not be saved.");
      markCampaignArtPersisted(campaignId, result.npc.art_path);
      onSaved?.(result.npc);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "NPC could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return <section className="character-editor"><div className="editor-heading"><div><p className="eyebrow">GM CONTACT RECORD</p><h2>{npc ? `Edit ${npc.name}` : "Add an NPC"}</h2></div><div className="editor-heading-actions"><button className="button button-secondary" disabled={isSaving} onClick={() => setAssistantOpen((current) => !current)} type="button"><Sparkles size={14} /> {assistantOpen ? "CLOSE ASSISTANT" : "GENERATE NPC"}</button><button aria-label="Close NPC editor" className="icon-button" onClick={onCancel} title="Close NPC editor" type="button"><X size={17} /></button></div></div>{assistantOpen ? <AiDraftAssistant campaignId={campaignId} endpoint="/api/ai/npc" entityLabel="NPC" mode={npc ? "refine" : "create"} requestFields={{ name: draft.name, species: draft.species, role: draft.role }} currentDraft={{ name: draft.name, species: draft.species, role: draft.role, shortDescription: draft.description, playerNotes: draft.playerNotesMarkdown, gmNotes: draft.gmNotesMarkdown, visualPrompt: draft.artSubject }} fields={[{ key: "name", label: "Name", maxLength: 160 }, { key: "species", label: "Species", maxLength: 120 }, { key: "role", label: "Role", maxLength: 160 }, { key: "shortDescription", label: "Description", maxLength: 4000, multiline: true }, { key: "playerNotes", label: "Player notes", maxLength: 20000, multiline: true }, { key: "gmNotes", label: "GM notes", maxLength: 20000, multiline: true }, { key: "visualPrompt", label: "Portrait description", maxLength: 1600, multiline: true }]} onApply={(candidate) => setDraft((current) => ({ ...current, name: candidate.name ?? current.name, species: candidate.species ?? current.species, role: candidate.role ?? current.role, description: candidate.shortDescription ?? current.description, playerNotesMarkdown: candidate.playerNotes ?? current.playerNotesMarkdown, gmNotesMarkdown: candidate.gmNotes ?? current.gmNotesMarkdown, artSubject: candidate.visualPrompt ?? current.artSubject }))} /> : null}<form className="character-form" onSubmit={save}><div className="character-form-grid"><label>Name<input required maxLength={160} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label><label>Species<input maxLength={120} value={draft.species} onChange={(event) => update("species", event.target.value)} /></label><label>Role<input maxLength={160} value={draft.role} onChange={(event) => update("role", event.target.value)} /></label></div><label>Description<textarea maxLength={4000} value={draft.description} onChange={(event) => update("description", event.target.value)} /></label><label>Player notes<textarea maxLength={20000} value={draft.playerNotesMarkdown} onChange={(event) => update("playerNotesMarkdown", event.target.value)} /></label><label>GM notes <span className="field-lock"><LockKeyhole size={11} /> PRIVATE</span><textarea maxLength={20000} value={draft.gmNotesMarkdown} onChange={(event) => update("gmNotesMarkdown", event.target.value)} /></label><label className="place-quick-field">Primary place<select value={draft.placeId ?? ""} onChange={(event) => update("placeId", event.target.value || null)}><option value="">NO PRIMARY PLACE</option>{flattenPlaceTree(places).map(({ place, depth }) => <option key={place.id} value={place.id}>{`${"  ".repeat(depth)}${depth ? "|- " : ""}${place.name} [${place.kind}]`}</option>)}</select></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="character-form-actions"><button className="button button-primary" disabled={isSaving} type="submit">{isSaving ? "SAVING..." : npc ? "SAVE CHANGES" : "ADD NPC"}</button><button className="text-action" disabled={isSaving} onClick={onCancel} type="button">CANCEL</button></div></form></section>;
}