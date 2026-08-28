import { z } from "zod";

export const campaignArtKindSchema = z.enum(["character", "npc", "faction", "job", "place", "enemy"]);

export const campaignArtPathSchema = z.string().trim().min(1).max(500).refine(
  (value) => value.split("/").length === 3 && !value.includes("..") && !value.includes("\\"),
  "Campaign art path is invalid.",
);

export const campaignArtMimeTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export const campaignArtMaxBytes = 5 * 1024 * 1024;
