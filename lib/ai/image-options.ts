export const imageAspectRatioValues = ["1:1", "3:4", "4:3", "16:9"] as const;
export type ImageAspectRatio = (typeof imageAspectRatioValues)[number];

export const imageSizeValues = [
  "1024x1024",
  "2048x2048",
  "1080x1440",
  "2160x2880",
  "1440x1080",
  "2880x2160",
  "1920x1080",
  "3840x2160",
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
    { value: "1080x1440", label: "1080 x 1440 (1K)", tier: "1K" },
    { value: "2160x2880", label: "2160 x 2880 (2K)", tier: "2K" },
  ],
  "4:3": [
    { value: "1440x1080", label: "1440 x 1080 (1K)", tier: "1K" },
    { value: "2880x2160", label: "2880 x 2160 (2K)", tier: "2K" },
  ],
  "16:9": [
    { value: "1920x1080", label: "1920 x 1080 (1K)", tier: "1K" },
    { value: "3840x2160", label: "3840 x 2160 (2K)", tier: "2K" },
  ],
};

export const defaultImageAspectRatio: ImageAspectRatio = "1:1";
export const defaultImageSize: ImageSize = "1024x1024";