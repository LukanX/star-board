import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignNarrativeSettingsInput } from "@/lib/validation/campaign-narrative-settings";
import { campaignNarrativeSettingsSchema } from "@/lib/validation/campaign-narrative-settings";

export type CampaignNarrativeSettings = CampaignNarrativeSettingsInput;
export type CampaignNarrativeSettingsResult = { settings: CampaignNarrativeSettings } | { error: string };

const emptySettings: CampaignNarrativeSettings = { setting: "", styleTags: [] };

function parseSettingsRow(row: { setting: unknown; style_tags: unknown }): CampaignNarrativeSettingsResult {
  const result = campaignNarrativeSettingsSchema.safeParse({ setting: row.setting, styleTags: row.style_tags });
  return result.success
    ? { settings: result.data }
    : { error: "Campaign narrative settings are invalid." };
}

export async function loadCampaignNarrativeSettings(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CampaignNarrativeSettingsResult> {
  const { data, error } = await supabase
    .from("campaign_narrative_settings")
    .select("setting, style_tags")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) return { error: "Campaign narrative settings could not be loaded." };
  if (!data) return { settings: emptySettings };
  return parseSettingsRow(data);
}

export async function saveCampaignNarrativeSettings(
  supabase: SupabaseClient,
  campaignId: string,
  settings: CampaignNarrativeSettings,
): Promise<CampaignNarrativeSettingsResult> {
  const { data, error } = await supabase
    .from("campaign_narrative_settings")
    .upsert({
      campaign_id: campaignId,
      setting: settings.setting,
      style_tags: settings.styleTags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "campaign_id" })
    .select("setting, style_tags")
    .maybeSingle();

  if (error || !data) return { error: "Campaign narrative settings could not be saved." };
  return parseSettingsRow(data);
}