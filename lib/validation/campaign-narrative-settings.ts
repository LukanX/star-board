import { z } from "zod";
import {
  canonicalizeNarrativeStyleTag,
  maxCampaignSettingLength,
  maxNarrativeStyleTagLength,
  maxNarrativeStyleTags,
} from "@/lib/campaign/narrative-style-tags";

export const narrativeStyleTagsSchema = z.array(
  z.string()
    .trim()
    .min(1, "Narrative style tags cannot be blank.")
    .max(maxNarrativeStyleTagLength, `Each narrative style tag must be ${maxNarrativeStyleTagLength} characters or fewer.`)
    .refine((tag) => !/[\u0000-\u001f\u007f-\u009f]/u.test(tag), "Tags cannot contain control characters."),
).max(maxNarrativeStyleTags, `Choose no more than ${maxNarrativeStyleTags} narrative style tags.`).superRefine((tags, context) => {
  const seen = new Set<string>();
  tags.forEach((tag, index) => {
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "Narrative style tags must be unique, ignoring case.",
      });
    }
    seen.add(normalized);
  });
}).transform((tags) => tags.map(canonicalizeNarrativeStyleTag));

export const campaignNarrativeSettingsSchema = z.object({
  setting: z.string()
    .trim()
    .max(maxCampaignSettingLength, `Campaign setting must be ${maxCampaignSettingLength} characters or fewer.`)
    .refine((setting) => !setting.includes("\0"), "Campaign setting cannot contain a NUL character."),
  styleTags: narrativeStyleTagsSchema,
}).strict();

export type CampaignNarrativeSettingsInput = z.infer<typeof campaignNarrativeSettingsSchema>;