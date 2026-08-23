"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

export type ArtDownloadButtonProps = {
  className?: string;
  name: string;
  src: string;
};

const extensionByMimeType: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sanitizeDownloadName(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "campaign-art"
  );
}

export async function downloadArtAsset(src: string, name: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error();

    const blob = await response.blob();
    const extension = extensionByMimeType[blob.type.toLowerCase()] ?? "img";
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${sanitizeDownloadName(name)}.${extension}`;
    document.body.appendChild(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    throw new Error("Artwork could not be downloaded.");
  }
}

export default function ArtDownloadButton({
  className = "absolute right-2 top-2",
  name,
  src,
}: ArtDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = `Download ${name} artwork`;

  const handleDownload = async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setError(null);
    try {
      await downloadArtAsset(src, name);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Artwork could not be downloaded.",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <button
        aria-busy={isDownloading}
        aria-label={label}
        className={`${className} z-[2] inline-grid h-8 w-8 place-items-center border bg-[rgba(8,11,17,.88)] p-0 shadow-[0_4px_14px_rgba(0,0,0,.28)] transition-[transform,background,border-color] duration-200 hover:-translate-y-px hover:bg-[#111b25] focus-visible:outline-2 focus-visible:outline-[var(--cyan)] focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70 ${error ? "border-[rgba(255,92,154,.65)] text-[var(--pink)]" : "border-[rgba(98,232,255,.42)] text-[var(--cyan)] hover:border-[var(--cyan)]"}`}
        disabled={isDownloading}
        onClick={() => void handleDownload()}
        title={error ?? label}
        type="button"
      >
        {isDownloading ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" size={15} />
        ) : (
          <Download aria-hidden="true" size={15} />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {error}
      </span>
    </>
  );
}