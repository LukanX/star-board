"use client";

import { useState } from "react";
import { BriefcaseBusiness, CirclePlus } from "lucide-react";
import JobCard from "@/components/jobs/JobCard";
import JobEditor from "@/components/jobs/JobEditor";
import PageLayout from "@/components/ui/PageLayout";
import { fetchCampaignJobs } from "@/lib/campaign/client/jobs";
import { mapApiJob } from "@/lib/campaign/mappers";
import type { ApiFaction, ApiNpc, ApiPlace, Mission } from "@/lib/campaign/types";
import type { CampaignJob } from "@/lib/campaign/jobs-server";

type JobFilter = "open" | "archived" | "drafts";

export default function JobsRouteView({ campaignId, role, initialJobs, initialNpcs, initialFactions, initialPlaces }: { campaignId: string; role: "gm" | "player"; initialJobs: CampaignJob[]; initialNpcs: ApiNpc[]; initialFactions: ApiFaction[]; initialPlaces: ApiPlace[] }) {
  const [jobs, setJobs] = useState<Mission[]>(() => initialJobs.map(mapApiJob));
  const [filter, setFilter] = useState<JobFilter>("open");
  const [editingJob, setEditingJob] = useState<Mission | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const isGM = role === "gm";

  const refreshJobs = async () => {
    const result = await fetchCampaignJobs(campaignId);
    setJobs(result.jobs.map(mapApiJob));
  };

  const openEditor = (job?: Mission) => {
    if (!isGM) return;
    setEditingJob(job ?? null);
    setError(null);
    setStatusMessage(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingJob(null);
  };

  const handleSaved = (job: { title: string }) => {
    void refreshJobs().then(() => {
      closeEditor();
      setStatusMessage(`${job.title} saved to the job board.`);
    }).catch((refreshError: unknown) => {
      setError(refreshError instanceof Error ? refreshError.message : "Job saved, but the board could not be refreshed.");
    });
  };

  const handleDeleted = (jobId: string) => {
    const deletedJob = jobs.find((job) => job.id === jobId);
    setJobs((current) => current.filter((job) => job.id !== jobId));
    closeEditor();
    setStatusMessage(deletedJob ? `${deletedJob.title} removed from the job board.` : "Job removed from the job board.");
  };

  const handleVote = async (jobId: string) => {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status !== "open") return;
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(jobId)}/vote`, { method: job.voted ? "DELETE" : "POST" });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Vote could not be synchronized.");
      await refreshJobs();
      setStatusMessage(job.voted ? `Vote removed from ${job.title}.` : `Vote locked on ${job.title}.`);
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Vote could not be synchronized.");
    }
  };

  const handlePromote = async (jobId: string) => {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job || !window.confirm(`Promote ${job.title} into the campaign episode log?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/jobs/${encodeURIComponent(jobId)}/promote`, { method: "POST" });
      const result = (await response.json()) as { error?: string; episode?: { title?: string } };
      if (!response.ok) throw new Error(result.error ?? "Job could not be promoted.");
      await refreshJobs();
      setStatusMessage(`${result.episode?.title ?? job.title} added to the episode log.`);
    } catch (promoteError) {
      setError(promoteError instanceof Error ? promoteError.message : "Job could not be promoted.");
    }
  };

  const filteredJobs = jobs.filter((job) => filter === "drafts" ? job.status === "draft" : job.status === filter);
  const count = (status: "open" | "archived" | "draft") => jobs.filter((job) => job.status === status).length.toString().padStart(2, "0");

  return <PageLayout eyebrow={`MISSION CONTROL // ${count("open")} OPEN`} title="Job board" description="Potential missions, ranked by the crew. Choose the signal that pulls hardest." action={isGM ? "NEW MISSION" : undefined} actionIcon={<CirclePlus size={16} />} onAction={() => openEditor()}>
    {editorOpen ? <JobEditor campaignId={campaignId} npcs={initialNpcs} factions={initialFactions} places={initialPlaces} job={editingJob ?? undefined} onCancel={closeEditor} onSaved={handleSaved} onDeleted={handleDeleted} /> : null}
    {error ? <p className="form-error mb-3" role="alert">{error}</p> : null}
    {statusMessage ? <p className="record-detail-meta mb-3" role="status">{statusMessage}</p> : null}
    <div className="view-toolbar"><div className="filter-tabs"><button className={`filter-tab ${filter === "open" ? "filter-tab-active" : ""}`} onClick={() => setFilter("open")} type="button">OPEN <span>{count("open")}</span></button><button className={`filter-tab ${filter === "archived" ? "filter-tab-active" : ""}`} onClick={() => setFilter("archived")} type="button">ARCHIVED <span>{count("archived")}</span></button>{isGM ? <button className={`filter-tab ${filter === "drafts" ? "filter-tab-active" : ""}`} onClick={() => setFilter("drafts")} type="button">DRAFTS <span>{count("draft")}</span></button> : null}</div></div>
    {filteredJobs.length ? <div className="jobs-grid">{filteredJobs.map((job, index) => <JobCard campaignId={campaignId} job={job} isGM={isGM} index={index} key={job.id} onVote={(jobId) => void handleVote(jobId)} onEdit={isGM ? openEditor : undefined} onPromote={isGM ? (jobId) => void handlePromote(jobId) : undefined} />)}</div> : <div className="character-empty"><BriefcaseBusiness size={22} /><h2>No missions in this view.</h2><p>{filter === "drafts" ? "Draft the next signal when the GM is ready." : "The campaign board has no missions here yet."}</p></div>}
  </PageLayout>;
}