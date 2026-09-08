const maxReferenceCount = 3;
const maxReferenceBytes = 4 * 1024 * 1024;
const maxTotalReferenceBytes = 8 * 1024 * 1024;
const supportedReferenceTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

type VisualStyleReference = {
  dataUrl: string;
};

function hasImageSignature(bytes: Uint8Array, mediaType: string) {
  if (mediaType === "image/png") {
    return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  }

  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return bytes.length >= 12
    && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

export async function normalizeVisualStyleReferences(formData: FormData): Promise<{ references: VisualStyleReference[] } | { error: string }> {
  const files = formData.getAll("referenceImages").filter((value): value is File => value instanceof File);

  if (files.length > maxReferenceCount) {
    return { error: `Attach no more than ${maxReferenceCount} example images.` };
  }

  const references: VisualStyleReference[] = [];
  let totalBytes = 0;

  for (const file of files) {
    const mediaType = file.type.toLowerCase();
    if (!supportedReferenceTypes.has(mediaType)) {
      return { error: "Example images must be PNG, JPEG, or WebP files." };
    }

    if (file.size <= 0 || file.size > maxReferenceBytes) {
      return { error: "Each example image must be smaller than 4 MB." };
    }

    totalBytes += file.size;
    if (totalBytes > maxTotalReferenceBytes) {
      return { error: "Example images must total less than 8 MB." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasImageSignature(bytes, mediaType)) {
      return { error: "One of the example images could not be decoded." };
    }

    references.push({ dataUrl: `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}` });
  }

  return { references };
}
