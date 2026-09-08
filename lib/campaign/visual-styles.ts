import type { SupabaseClient } from "@supabase/supabase-js";
import { createCampaignArtSignedUrl } from "@/lib/storage/campaign-art";
import { visualStyleWizardInputSchema, type VisualStyleWizardInput, type VisualStyleStatus } from "@/lib/validation/visual-style";

type VisualStyleRow = {
  id: string;
  campaign_id: string;
  name: string;
  visual_style: string;
  status: VisualStyleStatus;
  wizard_inputs: unknown;
  revision: number;
  preview_generation_run_id: string | null;
  preview_path: string | null;
  preview_media_type: "image/png" | "image/jpeg" | "image/webp" | null;
  preview_prompt: string | null;
  preview_provider: string | null;
  preview_model: string | null;
  preview_subject: string | null;
  preview_aspect_ratio: string | null;
  preview_size: string | null;
  preview_style_hash: string | null;
  preview_created_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignVisualStyle = {
  id: string;
  name: string;
  visualStyle: string;
  status: VisualStyleStatus;
  wizardInputs: VisualStyleWizardInput;
  revision: number;
  isApplied: boolean;
  preview: {
    signedUrl: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp" | null;
    prompt: string | null;
    provider: string | null;
    model: string | null;
    subject: string | null;
    aspectRatio: string | null;
    size: string | null;
    styleHash: string | null;
    createdAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignVisualStylesResult = {
  visualStyle: string;
  styles: CampaignVisualStyle[];
};

export async function loadCampaignVisualStyles(supabase: SupabaseClient, campaignId: string): Promise<{ result: CampaignVisualStylesResult } | { error: string }> {
  const [campaignResult, stylesResult] = await Promise.all([
    supabase
      .from("campaigns")
      .select("visual_style")
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("campaign_visual_styles")
      .select("id, campaign_id, name, visual_style, status, wizard_inputs, revision, preview_generation_run_id, preview_path, preview_media_type, preview_prompt, preview_provider, preview_model, preview_subject, preview_aspect_ratio, preview_size, preview_style_hash, preview_created_at, created_at, updated_at")
      .eq("campaign_id", campaignId)
      .order("updated_at", { ascending: false }),
  ]);

  if (campaignResult.error || stylesResult.error || !campaignResult.data) {
    return { error: "Campaign visual styles could not be loaded." };
  }

  const campaignVisualStyle = campaignResult.data.visual_style;
  const rows = (stylesResult.data ?? []) as VisualStyleRow[];
  const styles = await Promise.all(rows.map(async (row) => {
    const wizardInputs = visualStyleWizardInputSchema.safeParse(row.wizard_inputs);
    let signedUrl: string | null = null;

    if (row.preview_path) {
      try {
        signedUrl = await createCampaignArtSignedUrl(supabase, row.preview_path, 600);
      } catch {
        signedUrl = null;
      }
    }

    return {
      id: row.id,
      name: row.name,
      visualStyle: row.visual_style,
      status: row.status,
      wizardInputs: wizardInputs.success ? wizardInputs.data : visualStyleWizardInputSchema.parse({}),
      revision: row.revision,
      isApplied: row.visual_style === campaignVisualStyle,
      preview: signedUrl ? {
        signedUrl,
        mediaType: row.preview_media_type,
        prompt: row.preview_prompt,
        provider: row.preview_provider,
        model: row.preview_model,
        subject: row.preview_subject,
        aspectRatio: row.preview_aspect_ratio,
        size: row.preview_size,
        styleHash: row.preview_style_hash,
        createdAt: row.preview_created_at,
      } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies CampaignVisualStyle;
  }));

  return { result: { visualStyle: campaignVisualStyle, styles } };
}

export function visualStyleRpcStatus(error: { code?: string | null }) {
  switch (error.code) {
    case "42501": return 403;
    case "P0002": return 404;
    case "40001": return 409;
    case "23505": return 409;
    case "22023": return 400;
    default: return 503;
  }
}

export function visualStyleRpcMessage(error: { code?: string | null; message?: string | null }, fallback: string) {
  if (error.code === "42501") return "Campaign GM access is required to manage visual styles.";
  if (error.code === "P0002") return "The visual style was not found.";
  if (error.code === "40001") return "This visual style changed in another request. Reload it and try again.";
  if (error.code === "23505") return "A visual style with this name already exists in the campaign.";
  if (error.code === "22023") return error.message ?? fallback;
  return fallback;
}