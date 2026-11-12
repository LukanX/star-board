import { afterEach, describe, expect, it, vi } from "vitest";
import { getFoundryExportOptions, getDefaultFoundryScale, renderFoundryWebp } from "@/lib/art/foundry-export";

describe("Foundry battlemap export dimensions", () => {
  it("calculates proportional Original, 2x and 4x dimensions and defaults to 4x", () => {
    const options = getFoundryExportOptions({ width: 1024, height: 768 });
    expect(options).toEqual([
      { scale: 1, width: 1024, height: 768, allowed: true },
      { scale: 2, width: 2048, height: 1536, allowed: true },
      { scale: 4, width: 4096, height: 3072, allowed: true },
    ]);
    expect(getDefaultFoundryScale(options)).toBe(4);
  });

  describe("Foundry WebP encoding", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("encodes the selected dimensions as high-quality WebP without cropping", async () => {
      const drawImage = vi.fn();
      const context = { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
      const blob = new Blob(["webp"], { type: "image/webp" });
      const canvas = {
        width: 0, height: 0, getContext: vi.fn(() => context),
        toBlob: vi.fn((callback: BlobCallback) => callback(blob)),
      };
      vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
      const bitmap = { width: 640, height: 480 } as ImageBitmap;

      await expect(renderFoundryWebp(bitmap, 4)).resolves.toBe(blob);
      expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2560, 1920);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.95);
      expect(context.imageSmoothingQuality).toBe("high");
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    });

    it("refuses oversized output before creating a canvas", async () => {
      const createElement = vi.fn();
      vi.stubGlobal("document", { createElement });
      await expect(renderFoundryWebp({ width: 3840, height: 2160 } as ImageBitmap, 4)).rejects.toThrow(/limit/i);
      expect(createElement).not.toHaveBeenCalled();
    });

    it.each([null, new Blob(["png"], { type: "image/png" })])("reports an unavailable WebP encoder rather than downloading a different format", async (encoded) => {
      const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage: vi.fn() })), toBlob: vi.fn((callback: BlobCallback) => callback(encoded)) };
      vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
      await expect(renderFoundryWebp({ width: 10, height: 10 } as ImageBitmap, 1)).rejects.toThrow(/WebP/i);
      expect(canvas.width).toBe(0);
    });
  });

  it("enforces 8192 pixels per edge and 64 million pixels total", () => {
    expect(getFoundryExportOptions({ width: 8192, height: 7812 })[0].allowed).toBe(true);
    expect(getFoundryExportOptions({ width: 8193, height: 100 })[0].allowed).toBe(false);
    expect(getFoundryExportOptions({ width: 8000, height: 8000 })[0].allowed).toBe(true);
    expect(getFoundryExportOptions({ width: 8000, height: 8001 })[0].allowed).toBe(false);
    const fourK = getFoundryExportOptions({ width: 3840, height: 2160 });
    expect(fourK.map(({ allowed }) => allowed)).toEqual([true, true, false]);
    expect(getDefaultFoundryScale(fourK)).toBe(1);
  });

  it.each([
    { width: 0, height: 20 },
    { width: -1, height: 10 },
    { width: 1.5, height: 10 },
    { width: Number.NaN, height: 10 },
    { width: Number.POSITIVE_INFINITY, height: 10 },
  ])("rejects invalid source dimensions: %o", (dimensions) => {
    expect(() => getFoundryExportOptions(dimensions)).toThrow(/invalid/i);
  });
});
