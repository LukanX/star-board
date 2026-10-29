import { describe, expect, it } from "vitest";
import catalog from "@/lib/references/catalog.generated.json";
import report from "@/lib/references/wiki-coverage.generated.json";
import { validateWikiArticleUrl } from "@/scripts/wiki-appearance-source.mjs";

describe("recorded wiki metadata audit", () => {
  it("accounts for all current ancestry identities exactly once", () => {
    const expected = catalog.records.filter((record) => record.kind === "ancestry").map((record) => record.id).sort();
    const actual = report.records.map((record) => record.id).sort();
    expect(expected).toHaveLength(60);
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
    expect(report.foundrySource.commit).toBe(catalog.source.commit);
  });
  it("does not treat discovered pages as verified or approved excerpts", () => {
    for (const record of report.records) {
      expect(record.identityReview).toBe("pending");
      expect(record.reusePermission).toBe("unresolved");
      expect(record.excerptStatus).toBe("not-imported");
      expect(record.attempts.length).toBeGreaterThan(0);
      expect(["found", "missing-page", "missing-section", "ambiguous-section", "empty-section"]).toContain(record.discoveryStatus);
    }
  });
  it("stores metadata only, not paragraphs or quotation text", () => {
    for (const record of report.records) {
      expect(Object.keys(record).sort()).toEqual([
        "appearance", "attempts", "discoveryStatus", "excerptStatus", "foundryPublication",
        "id", "identityReview", "name", "reusePermission", "source",
      ]);
      if (record.source) {
        expect(Object.keys(record.source).sort()).toEqual(["pageId", "pageUrl", "revisionId", "revisionUrl", "sectionUrl", "title"]);
      }
      if (record.appearance) {
        expect(Object.keys(record.appearance).sort()).toEqual(["blockCount", "characterCount", "citationCount", "sectionHash"]);
      }
      for (const attempt of record.attempts) expect(Object.keys(attempt).sort()).toEqual(["status", "url"]);
    }
  });
  it("retains allowed revision links and real section metrics for discovered pages", () => {
    for (const record of report.records) {
      for (const attempt of record.attempts) expect(validateWikiArticleUrl(attempt.url).origin).toBe("https://starfinderwiki.com");
      if (record.source) {
        expect(record.source.pageId).toBeGreaterThan(0);
        expect(record.source.revisionId).toBeGreaterThan(0);
        expect(validateWikiArticleUrl(record.source.revisionUrl).searchParams.get("oldid")).toBe(String(record.source.revisionId));
      }
      if (record.discoveryStatus === "found") {
        expect(record.appearance?.blockCount).toBeGreaterThan(0);
        expect(record.appearance?.sectionHash).toMatch(/^[a-f0-9]{64}$/);
      }
      if (record.discoveryStatus === "missing-page") expect(record.source).toBeNull();
    }
  });
});
