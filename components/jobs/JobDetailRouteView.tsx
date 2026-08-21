"use client";

import { useState } from "react";
import { Pencil, Sparkles, Trash2, Vote } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignArtEditorSlot } from "@/components/archive/CampaignArtField";
import JobEditor from "@/components/jobs/JobEditor";
import JobPublicRecord from "@/components/jobs/JobPublicRecord";
import { fetchCampaignJobs } from "@/lib/campaign/client/jobs";
import { mapApiJob } from "@/lib/campaign/mappers";
import { campaignSectionPath } from "@/lib/campaign/routes";
import type { ApiFaction, ApiNpc, ApiPlace, Mission } from "@/lib/campaign/types";
import type { CampaignJobResult } from "@/lib/campaign/jobs-server";

export default function JobDetailRouteView({ campaignId, initialResult, initialNpcs, initialFactions, initialPlaces }: { campaignId: string; initialResult: CampaignJobResult; initialNpcs: ApiNpc[]; initialFactions: ApiFaction[]; initialPlaces: ApiPlace[] }) {
  const router = useRouter();
  const [job, setJob] = useState<Mission>(() => mapApiJob(initialResult.job, 0));
  const [editorOpen, setEditorOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isGM = initialResult.role === "gm";

  const refreshJob = async () => {
    const result = await fetchCampaignJobs(campaignId);
    const refreshedJob = result.jobs.find((candidate) => candidate.id === job.id);
    if (!refreshedJob) {
      router.push(campaignSectionPath(campaignId, "jobs"));
      return;
    }
    setJob(mapApiJob(refreshedJob, 0));
  };

  const handleVote = async () => {
    if (isBusy || job.status !== "open") return;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(job.id)}/vote`, { method: job.voted ? "DELETE" : "POST" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Vote could not be synchronized.");
      await refreshJob();
      setStatusMessage(job.voted ? "Vote removed from this job." : "Vote locked on this job.");
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Vote could not be synchronized.");
    } finally {
      setIsBusy(false);
    }
  };

  const handlePromote = async () => {
    if (isBusy || !window.confirm(`Promote ${job.title} into the campaign episode log?`)) return;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(job.id)}/promote`, { method: "POST" });
      const result = (await response.json()) as { error?: string; episode?: { title?: string } };
      if (!response.ok) throw new Error(result.error ?? "Job could not be promoted.");
      await refreshJob();
      setStatusMessage(`${result.episode?.title ?? job.title} added to the episode log.`);
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : "Job could not be promoted.");
    } finally {
      setIsBusy(false);
    }
  };

  const deleteJob = async () => {
    if (isBusy || !window.confirm(`Delete ${job.title} from this campaign?`)) return;
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs?jobId=${encodeURIComponent(job.id)}`, { method: "DELETE" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Job could not be deleted.");
      router.push(campaignSectionPath(campaignId, "jobs"));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Job could not be deleted.");
      setIsBusy(false);
    }
  };

  return <><CampaignArtEditorSlot /><JobPublicRecord campaignId={campaignId} job={job} places={initialPlaces} isGM={isGM} actions={<>{job.status === "open" ? <button className={`button ${job.voted ? "button-primary" : "button-secondary"}`} disabled={isBusy} onClick={() => void handleVote()} type="button"><Vote size={14} /> {job.voted ? "VOTED" : "VOTE"}</button> : null}{isGM ? <button aria-label={`Edit ${job.title}`} className="icon-button" disabled={isBusy} onClick={() => { setError(null); setEditorOpen(true); }} title={`Edit ${job.title}`} type="button"><Pencil size={15} /></button> : null}{isGM && job.status === "open" ? <button aria-label={`Promote ${job.title} to an episode`} className="icon-button" disabled={isBusy} onClick={() => void handlePromote()} title="Promote to episode" type="button"><Sparkles size={15} /></button> : null}</>} />{isGM ? <div className="character-form-actions"><button className="button button-danger" disabled={isBusy} onClick={() => void deleteJob()} type="button"><Trash2 size={14} /> {isBusy ? "WORKING..." : "DELETE JOB"}</button></div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{statusMessage ? <p className="record-detail-meta" role="status">{statusMessage}</p> : null}{editorOpen ? <JobEditor campaignId={campaignId} npcs={initialNpcs} factions={initialFactions} places={initialPlaces} job={job} onCancel={() => setEditorOpen(false)} onSaved={() => { void refreshJob().then(() => setEditorOpen(false)).catch((saveError: unknown) => setError(saveError instanceof Error ? saveError.message : "Job saved, but the record could not be refreshed.")); }} onDeleted={() => router.push(campaignSectionPath(campaignId, "jobs"))} /> : null}</>;
}