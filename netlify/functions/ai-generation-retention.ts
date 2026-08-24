import { getSupabaseServiceRoleClient } from "../../lib/supabase/service";
import { removeCampaignArtIfUnreferenced } from "../../lib/storage/campaign-art";

const retentionWindowMs = 90 * 24 * 60 * 60 * 1000;

export default async function handler(request: Request) {
  if (request.method !== "POST") throw new Error("AI audit retention must be invoked with POST.");

  const cutoff = new Date(Date.now() - retentionWindowMs).toISOString();
  const supabase = getSupabaseServiceRoleClient();
  const { data: expiredRuns, error: readError } = await supabase
    .from("ai_generation_runs")
    .select("campaign_id, image_path")
    .lt("created_at", cutoff);

  if (readError) {
    console.error("AI audit retention cleanup failed while reading expired image references.", { message: readError.message });
    throw new Error(`AI audit retention cleanup failed: ${readError.message}`);
  }

  let removedImageCount = 0;
  for (const run of expiredRuns ?? []) {
    if (!run.image_path) continue;
    if (await removeCampaignArtIfUnreferenced(supabase, run.campaign_id, run.image_path)) removedImageCount += 1;
  }

  const { count, error } = await supabase
    .from("ai_generation_runs")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);

  if (error) {
    console.error("AI audit retention cleanup failed.", { message: error.message });
    throw new Error(`AI audit retention cleanup failed: ${error.message}`);
  }

  console.info("AI audit retention cleanup complete.", { cutoff, deletedCount: count ?? 0, removedImageCount });
}

export const config = {
  schedule: "0 3 * * *",
};