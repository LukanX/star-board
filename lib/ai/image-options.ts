export const imageAspectRatioValues = ["1:1", "3:4", "4:3", "16:9"] as const;
export type ImageAspectRatio = (typeof imageAspectRatioValues)[number];

export const imageSizeValues = [
  "1024x1024",
  "2048x2048",
  "768x1024",
  "1536x2048",
  "1024x768",
  "2048x1536",
  "1024x576",
  "2048x1152",
] as const;
export type ImageSize = (typeof imageSizeValues)[number];
export type ImageSizeTier = "1K" | "2K";

export type ImageSizeOption = {
  value: ImageSize;
  label: string;
  tier: ImageSizeTier;
};

export const imageSizeOptions: Record<ImageAspectRatio, readonly ImageSizeOption[]> = {
  "1:1": [
    { value: "1024x1024", label: "1024 x 1024 (1K)", tier: "1K" },
    { value: "2048x2048", label: "2048 x 2048 (2K)", tier: "2K" },
  ],
  "3:4": [
    { value: "768x1024", label: "768 x 1024 (1K)", tier: "1K" },
    { value: "1536x2048", label: "1536 x 2048 (2K)", tier: "2K" },
  ],
  "4:3": [
    { value: "1024x768", label: "1024 x 768 (1K)", tier: "1K" },
    { value: "2048x1536", label: "2048 x 1536 (2K)", tier: "2K" },
  ],
  "16:9": [
    { value: "1024x576", label: "1024 x 576 (1K)", tier: "1K" },
    { value: "2048x1152", label: "2048 x 1152 (2K)", tier: "2K" },
  ],
};

export const defaultImageAspectRatio: ImageAspectRatio = "1:1";
export const defaultImageSize: ImageSize = "1024x1024";