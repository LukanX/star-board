export type FoundryExportScale = 1 | 2 | 4;
export type FoundryExportOption = {
  scale: FoundryExportScale;
  width: number;
  height: number;
  allowed: boolean;
};

export function getFoundryExportOptions({ width, height }: { width: number; height: number }): FoundryExportOption[] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("The battlemap has invalid image dimensions.");
  }
  return ([1, 2, 4] as const).map((scale) => {
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    return {
      scale,
      width: scaledWidth,
      height: scaledHeight,
      allowed: scaledWidth <= 8192 && scaledHeight <= 8192 && scaledWidth * scaledHeight <= 64_000_000,
    };
  });
}

export function getDefaultFoundryScale(options: readonly FoundryExportOption[]): FoundryExportScale {
  return options.some((option) => option.scale === 4 && option.allowed) ? 4 : 1;
}

export async function renderFoundryWebp(image: ImageBitmap, scale: FoundryExportScale): Promise<Blob> {
  const option = getFoundryExportOptions(image).find((candidate) => candidate.scale === scale);
  if (!option?.allowed) throw new Error("The selected export exceeds the battlemap size limits.");

  const canvas = document.createElement("canvas");
  canvas.width = option.width;
  canvas.height = option.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not create an image for export.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, option.width, option.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.95));
    if (!blob || blob.type !== "image/webp" || blob.size === 0) {
      throw new Error("Your browser could not encode this battlemap as WebP.");
    }
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
