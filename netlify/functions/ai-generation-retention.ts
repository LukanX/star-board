import { getSupabaseServiceRoleClient } from "../../lib/supabase/service";

const retentionWindowMs = 90 * 24 * 60 * 60 * 1000;

export default async function handler(request: Request) {
  if (request.method !== "POST") throw new Error("AI audit retention must be invoked with POST.");

  const cutoff = new Date(Date.now() - retentionWindowMs).toISOString();
  const { count, error } = await getSupabaseServiceRoleClient()
    .from("ai_generation_runs")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);

  if (error) {
    console.error("AI audit retention cleanup failed.", { message: error.message });
    throw new Error(`AI audit retention cleanup failed: ${error.message}`);
  }

  console.info("AI audit retention cleanup complete.", { cutoff, deletedCount: count ?? 0 });
}

export const config = {
  schedule: "0 3 * * *",
};