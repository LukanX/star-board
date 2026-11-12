import { z } from "zod";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { studioSubjectKinds } from "@/lib/validation/studio";
import { studioTables, StudioError } from "@/lib/ai/studio-context";
import { studioJson, studioFailure } from "@/lib/ai/studio-response";
import { createCampaignArtSignedUrl, validateCampaignArtPath } from "@/lib/storage/campaign-art";

const querySchema = z.object({
  kind: z.enum(studioSubjectKinds), search: z.string().max(100).default(""),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  id: z.string().uuid().optional(),
});
export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const input = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return studioJson({ error: "Subject search is invalid." }, 400);
  try {
    const { campaignId } = await params;
    const context = await requireCampaignGM(campaignId);
    if (!context) throw new StudioError("GM access is required.", 403);
    let query = context.supabase.from(studioTables[input.data.kind]).select("id,name,art_path,updated_at").eq("campaign_id", campaignId);
    if (input.data.id) query = query.eq("id", input.data.id);
    if (input.data.search) query = query.ilike("name", `%${input.data.search.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query.order("name").order("id").range(input.data.offset, input.data.offset + 19);
    if (error) throw new StudioError("Subject search could not be loaded.", 503);
    const subjects = await Promise.all((data ?? []).map(async (row) => {
      let thumbnailUrl: string | null = null;
      if (row.art_path) {
        try { thumbnailUrl = await createCampaignArtSignedUrl(context.supabase, row.art_path, 600); } catch { thumbnailUrl = null; }
      }
      return { ...row, kind: input.data.kind, thumbnailUrl, hasReferenceImage: typeof row.art_path === "string" && validateCampaignArtPath(campaignId, row.art_path) };
    }));
    return studioJson({ subjects });
  } catch (error) { return studioFailure(error); }
}
