import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership, getCampaignRole } from "@/lib/auth/permissions";
import { addCampaignArtUrls, removeCampaignArtIfUnreferenced } from "@/lib/storage/campaign-art";
import { validateCampaignPlace } from "@/lib/places";
import { createJobSchema } from "@/lib/validation/job";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const [jobsResult, votesResult, npcsResult, factionsResult] = await Promise.all([
      context.supabase
        .from("jobs")
        .select("id, title, summary, player_notes_markdown, giver_npc_id, giver_faction_id, place_id, status, hook, art_subject, art_path, art_prompt, art_provider, created_at, updated_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      context.supabase.from("job_votes").select("job_id, user_id").eq("campaign_id", campaignId),
      context.supabase.from("npcs").select("id, name").eq("campaign_id", campaignId),
      context.supabase.from("factions").select("id, name").eq("campaign_id", campaignId),
    ]);

    if (jobsResult.error || votesResult.error || npcsResult.error || factionsResult.error) {
      return NextResponse.json({ error: "Unable to load campaign jobs." }, { status: 503 });
    }

    const npcs = new Map((npcsResult.data ?? []).map((npc) => [npc.id, npc.name]));
    const factions = new Map((factionsResult.data ?? []).map((faction) => [faction.id, faction.name]));
    const votesByJob = new Map<string, { count: number; voted: boolean }>();

    for (const vote of votesResult.data ?? []) {
      const current = votesByJob.get(vote.job_id) ?? { count: 0, voted: false };
      current.count += 1;
      current.voted ||= vote.user_id === context.user.id;
      votesByJob.set(vote.job_id, current);
    }

    const jobsWithArt = await addCampaignArtUrls(context.supabase, jobsResult.data ?? []);
    const jobIds = (jobsResult.data ?? []).map((job) => job.id);
    const { data: jobNotes, error: jobNotesError } = membership.role === "gm" && jobIds.length
      ? await context.supabase.from("job_gm_notes").select("job_id, body_markdown").in("job_id", jobIds)
      : { data: [], error: null };

    if (jobNotesError) {
      return NextResponse.json({ error: "Unable to load job private notes." }, { status: 503 });
    }

    const notesByJob = new Map((jobNotes ?? []).map((note) => [note.job_id, note.body_markdown]));
    const jobs = jobsWithArt.map((job) => {
      const votes = votesByJob.get(job.id) ?? { count: 0, voted: false };
      const giver = job.giver_npc_id
        ? { type: "NPC", id: job.giver_npc_id, name: npcs.get(job.giver_npc_id) ?? "Unknown contact" }
        : { type: "FACTION", id: job.giver_faction_id, name: factions.get(job.giver_faction_id ?? "") ?? "Unknown faction" };

      const { hook, ...publicJob } = job;
      return { ...publicJob, giver, votes: votes.count, voted: votes.voted, ...(membership.role === "gm" ? { hook, gm_notes_markdown: notesByJob.get(job.id) ?? "" } : {}) };
    });

    return NextResponse.json({ role: membership.role, displayName: membership.displayName, jobs });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = createJobSchema.safeParse(body);

  if (!input.success) {
    return NextResponse.json({ error: "Job details are invalid.", issues: input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const placeResult = await validateCampaignPlace(context.supabase, campaignId, input.data.placeId);

    if (placeResult.unavailable) {
      return NextResponse.json({ error: "Unable to validate job place." }, { status: 503 });
    }

    if (!placeResult.valid) {
      return NextResponse.json({ error: "Job place must belong to this campaign." }, { status: 400 });
    }

    const payload = {
      campaign_id: campaignId,
      author_id: context.user.id,
      title: input.data.title,
      summary: input.data.summary,
      player_notes_markdown: input.data.playerNotesMarkdown,
      place_id: input.data.placeId ?? null,
      hook: input.data.hook,
      art_subject: input.data.artSubject ?? null,
      status: input.data.status,
      giver_npc_id: input.data.giverType === "npc" ? input.data.giverId : null,
      giver_faction_id: input.data.giverType === "faction" ? input.data.giverId : null,
      art_path: input.data.artPath ?? null,
      art_prompt: input.data.artPrompt ?? null,
      art_provider: input.data.artProvider ?? null,
      updated_by: context.user.id,
    };
    const { data, error } = await context.supabase.from("jobs").insert(payload).select().single();

    if (error) {
      return NextResponse.json({ error: "Unable to create job." }, { status: 400 });
    }

    if (input.data.gmNotesMarkdown) {
      const { error: notesError } = await context.supabase.from("job_gm_notes").insert({
        job_id: data.id,
        body_markdown: input.data.gmNotesMarkdown,
        updated_by: context.user.id,
      });

      if (notesError) {
        return NextResponse.json({ error: "Job created, but private notes could not be saved." }, { status: 400 });
      }
    }

    const [job] = await addCampaignArtUrls(context.supabase, [{ ...data, gm_notes_markdown: input.data.gmNotesMarkdown }]);
    return NextResponse.json({ job }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = createJobSchema.safeParse(body);
  const jobId = typeof body === "object" && body !== null && "jobId" in body && typeof body.jobId === "string" ? body.jobId : null;

  if (!jobId || !input.success) {
    return NextResponse.json({ error: "Job details are invalid.", issues: input.success ? undefined : input.error.flatten() }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const placeResult = await validateCampaignPlace(context.supabase, campaignId, input.data.placeId);

    if (placeResult.unavailable) {
      return NextResponse.json({ error: "Unable to validate job place." }, { status: 503 });
    }

    if (!placeResult.valid) {
      return NextResponse.json({ error: "Job place must belong to this campaign." }, { status: 400 });
    }

    const { data: previousJob, error: previousJobError } = await context.supabase
      .from("jobs")
      .select("art_path")
      .eq("id", jobId)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (previousJobError) {
      return NextResponse.json({ error: "Unable to load job art." }, { status: 503 });
    }

    const { data, error } = await context.supabase
      .from("jobs")
      .update({
        title: input.data.title,
        summary: input.data.summary,
        player_notes_markdown: input.data.playerNotesMarkdown,
        ...(input.data.placeId === undefined ? {} : { place_id: input.data.placeId }),
        hook: input.data.hook,
        art_subject: input.data.artSubject ?? null,
        status: input.data.status,
        giver_npc_id: input.data.giverType === "npc" ? input.data.giverId : null,
        giver_faction_id: input.data.giverType === "faction" ? input.data.giverId : null,
        art_path: input.data.artPath ?? null,
        art_prompt: input.data.artPrompt ?? null,
        art_provider: input.data.artProvider ?? null,
        updated_by: context.user.id,
      })
      .eq("id", jobId)
      .eq("campaign_id", campaignId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Unable to update job." }, { status: 400 });
    }

    if (previousJob?.art_path !== data.art_path) {
      await removeCampaignArtIfUnreferenced(context.supabase, campaignId, previousJob?.art_path);
    }

    const { error: notesError } = await context.supabase.from("job_gm_notes").upsert({
      job_id: jobId,
      body_markdown: input.data.gmNotesMarkdown,
      updated_by: context.user.id,
    }, { onConflict: "job_id" });

    if (notesError) {
      return NextResponse.json({ error: "Job updated, but private notes could not be saved." }, { status: 400 });
    }

    const [job] = await addCampaignArtUrls(context.supabase, [{ ...data, gm_notes_markdown: input.data.gmNotesMarkdown }]);
    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const jobId = new URL(request.url).searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required." }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (role !== "gm") {
      return NextResponse.json({ error: "GM access is required." }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from("jobs")
      .delete()
      .eq("id", jobId)
      .eq("campaign_id", campaignId)
      .select("id, art_path")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Unable to delete job." }, { status: 400 });
    }

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, data.art_path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
