import { getAuthenticatedUser, getCampaignMembership, type CampaignMembership } from "@/lib/auth/permissions";
import type { ApiJob } from "@/lib/campaign/types";
import { addCampaignArtUrls } from "@/lib/storage/campaign-art";

export type CampaignJob = Omit<ApiJob, "giver"> & {
  giver: ApiJob["giver"] & { id: string | null };
};

export type CampaignJobsResult = {
  role: CampaignMembership["role"];
  displayName: string;
  jobs: CampaignJob[];
};

export type CampaignJobResult = {
  role: CampaignMembership["role"];
  displayName: string;
  job: CampaignJob;
};

type JobRow = Omit<ApiJob, "giver" | "votes" | "voted"> & {
  campaign_id: string;
  created_at: string;
  updated_at: string;
  hook: string;
};

const jobColumns = "id, campaign_id, title, summary, player_notes_markdown, giver_npc_id, giver_faction_id, place_id, status, hook, art_subject, art_path, art_prompt, art_provider, created_at, updated_at";

async function getCampaignContext(campaignId: string) {
  const context = await getAuthenticatedUser();
  if (!context) return null;

  const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
  if (!membership) return null;

  return { ...context, membership };
}

async function enrichJobs(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>> extends infer Context
    ? Context extends { supabase: infer Client }
      ? Client
      : never
    : never,
  campaignId: string,
  userId: string,
  membership: CampaignMembership,
  jobs: JobRow[],
  detailJobId?: string,
): Promise<CampaignJob[]> {
  const [votesResult, npcsResult, factionsResult] = await Promise.all([
    detailJobId
      ? supabase.from("job_votes").select("job_id, user_id").eq("campaign_id", campaignId).eq("job_id", detailJobId)
      : supabase.from("job_votes").select("job_id, user_id").eq("campaign_id", campaignId),
    supabase.from("npcs").select("id, name").eq("campaign_id", campaignId),
    supabase.from("factions").select("id, name").eq("campaign_id", campaignId),
  ]);

  if (votesResult.error || npcsResult.error || factionsResult.error) {
    throw new Error("Unable to read campaign job references.");
  }

  const jobsWithArt = await addCampaignArtUrls(supabase, jobs);
  const jobIds = jobs.map((job) => job.id);
  const notesResult = membership.role === "gm" && jobIds.length
    ? detailJobId
      ? await supabase.from("job_gm_notes").select("job_id, body_markdown").eq("job_id", detailJobId).maybeSingle()
      : await supabase.from("job_gm_notes").select("job_id, body_markdown").in("job_id", jobIds)
    : { data: [], error: null };

  if (notesResult.error) {
    throw new Error("Unable to read job private notes.");
  }

  const npcs = new Map((npcsResult.data ?? []).map((npc) => [npc.id, npc.name]));
  const factions = new Map((factionsResult.data ?? []).map((faction) => [faction.id, faction.name]));
  const votesByJob = new Map<string, { count: number; voted: boolean }>();

  for (const vote of votesResult.data ?? []) {
    const current = votesByJob.get(vote.job_id) ?? { count: 0, voted: false };
    current.count += 1;
    current.voted ||= vote.user_id === userId;
    votesByJob.set(vote.job_id, current);
  }

  const notes = Array.isArray(notesResult.data) ? notesResult.data : notesResult.data ? [notesResult.data] : [];
  const notesByJob = new Map(notes.map((note) => [note.job_id, note.body_markdown]));

  return jobsWithArt.map((job) => {
    const votes = votesByJob.get(job.id) ?? { count: 0, voted: false };
    const giverId = job.giver_npc_id ?? job.giver_faction_id;
    const giver = job.giver_npc_id
      ? { type: "NPC" as const, id: giverId, name: npcs.get(job.giver_npc_id) ?? "Unknown contact" }
      : { type: "FACTION" as const, id: giverId, name: factions.get(job.giver_faction_id ?? "") ?? "Unknown faction" };
    const { hook, ...publicJob } = job;

    return {
      ...publicJob,
      giver,
      votes: votes.count,
      voted: votes.voted,
      ...(membership.role === "gm" ? { hook, gm_notes_markdown: notesByJob.get(job.id) ?? "" } : {}),
    };
  });
}

export async function getCampaignJobs(campaignId: string): Promise<CampaignJobsResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("jobs")
    .select(jobColumns)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to read campaign jobs: ${error.message}`);

  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    jobs: await enrichJobs(context.supabase, campaignId, context.user.id, context.membership, data ?? []),
  };
}

export async function getCampaignJob(campaignId: string, jobId: string): Promise<CampaignJobResult | null> {
  const context = await getCampaignContext(campaignId);
  if (!context) return null;

  const { data, error } = await context.supabase
    .from("jobs")
    .select(jobColumns)
    .eq("id", jobId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new Error(`Unable to read campaign job: ${error.message}`);
  if (!data) return null;

  const [job] = await enrichJobs(context.supabase, campaignId, context.user.id, context.membership, [data], jobId);
  if (!job) return null;

  return {
    role: context.membership.role,
    displayName: context.membership.displayName,
    job,
  };
}