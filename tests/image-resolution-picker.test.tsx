import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ImageResolutionPicker from "@/components/archive/ImageResolutionPicker";
import type { AiModelOptions } from "@/components/archive/AiModelPicker";

describe("image resolution picker", () => {
  it("shows only model-supported tiers", () => {
    const markup = renderToStaticMarkup(<ImageResolutionPicker
      value="2K" options={{ supportedParameters: ["resolution"], parameterValues: { resolution: ["2K", "4K"] } }}
      onChange={() => undefined}
    />);
    expect(markup).toContain('aria-label="Image resolution"');
    expect(markup).toContain('value="2K"');
    expect(markup).toContain('value="4K"');
    expect(markup).not.toContain('value="1K"');
  });
  it("does not invent tiers when resolution support is absent or unknown", () => {
    const models: (AiModelOptions | null)[] = [{ supportedParameters: [], parameterValues: { resolution: ["1K"] } }, { supportedParameters: ["resolution"], parameterValues: {} }];
    for (const options of models) {
      const markup = renderToStaticMarkup(<ImageResolutionPicker value={undefined} options={options} onChange={() => undefined} />);
      expect(markup).not.toContain("<select");
      expect(markup).toContain("No selectable 1K, 2K or 4K resolutions are advertised");
    }
    expect(renderToStaticMarkup(<ImageResolutionPicker value={undefined} options={null} onChange={() => undefined} />)).toBe("");
  });
  it("disables changes while a request is pending", () => {
    expect(renderToStaticMarkup(<ImageResolutionPicker value="1K"
      options={{ supportedParameters: ["resolution"], parameterValues: { resolution: ["1K", "2K"] } }}
      disabled onChange={() => undefined}
    />)).toContain('disabled=""');
  });
});
