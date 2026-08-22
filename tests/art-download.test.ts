import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadArtAsset } from "@/components/ui/ArtDownloadButton";

describe("downloadArtAsset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads a fetched image with an entity-based filename", async () => {
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = { click, download: "", href: "", remove };
    const appendChild = vi.fn();
    const createElement = vi.fn().mockReturnValue(anchor);
    const fetchImage = vi.fn().mockResolvedValue(
      new Response(new Blob(["image bytes"], { type: "image/png" }), {
        status: 200,
      }),
    );
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:download-art");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    vi.stubGlobal("document", {
      body: { appendChild },
      createElement,
    });
    vi.stubGlobal("fetch", fetchImage);

    await downloadArtAsset(
      "https://storage.example/signed-art",
      "Ghost Signal",
    );

    expect(fetchImage).toHaveBeenCalledWith(
      "https://storage.example/signed-art",
    );
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchor.href).toBe("blob:download-art");
    expect(anchor.download).toBe("ghost-signal.png");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download-art");
  });

  it("reports a bounded error when the image cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Provider diagnostics")),
    );

    await expect(
      downloadArtAsset(
        "https://storage.example/expired-art",
        "Ghost Signal",
      ),
    ).rejects.toThrow("Artwork could not be downloaded.");
  });
});