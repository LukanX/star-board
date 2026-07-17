import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignRole } from "@/lib/auth/permissions";
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

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);

    if (!role) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const [jobsResult, votesResult, npcsResult, factionsResult] = await Promise.all([
      context.supabase
        .from("jobs")
        .select("id, title, summary, player_notes_markdown, giver_npc_id, giver_faction_id, status, art_path, art_prompt, art_provider, created_at, updated_at")
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

    const jobs = (jobsResult.data ?? []).map((job) => {
      const votes = votesByJob.get(job.id) ?? { count: 0, voted: false };
      const giver = job.giver_npc_id
        ? { type: "NPC", id: job.giver_npc_id, name: npcs.get(job.giver_npc_id) ?? "Unknown contact" }
        : { type: "FACTION", id: job.giver_faction_id, name: factions.get(job.giver_faction_id ?? "") ?? "Unknown faction" };

      return { ...job, giver, votes: votes.count, voted: votes.voted };
    });

    return NextResponse.json({ role, jobs });
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

    const payload = {
      campaign_id: campaignId,
      author_id: context.user.id,
      title: input.data.title,
      summary: input.data.summary,
      player_notes_markdown: input.data.playerNotesMarkdown,
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

    return NextResponse.json({ job: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}
