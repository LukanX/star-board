import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.resolve(process.cwd(), "app/globals.css"), "utf8");

const migratedSelectors = [
  ".micro-label",
  ".last-sync",
  ".muted-icon",
  ".live-dot",
  ".eyebrow",
  ".eyebrow-bright",
  ".intro-copy",
  ".intro-actions",
  ".avatar",
  ".avatar-user",
  ".accent-icon-cyan",
  ".legend-dot",
  ".dot-cyan",
  ".dot-pink",
  ".faction-pink",
  ".faction-cyan",
  ".faction-amber",
  ".meta-divider",
  ".markdown-content",
  ".visual-asset.no-asset",
  ".status-pink",
  ".status-amber",
  ".status-purple",
  ".status-muted",
  ".status-open",
  ".toast",
  ".toast-icon",
  ".character-body",
];

describe("global stylesheet cleanup", () => {
  it("keeps migrated component selectors out of the global stylesheet", () => {
    for (const selector of migratedSelectors) {
      const escapedSelector = selector.replace(".", "\\.");
      expect(globalsCss).not.toMatch(new RegExp(`^${escapedSelector}(?:\\s|\\{|\\.)`, "m"));
    }
  });
});
