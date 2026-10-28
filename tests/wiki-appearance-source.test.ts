import { describe, expect, it } from "vitest";
import {
  auditWikiReferences, inspectWikiArticle, parseWikiRobots, validateWikiArticleUrl, wikiArticleUrl, wikiCandidateUrls,
} from "@/scripts/wiki-appearance-source.mjs";
import catalog from "@/lib/references/catalog.generated.json";

function fixture(body: string, title = "Synthetic_ancestry", pageId = 1, revisionId = 2) {
  return `<script>RLCONF={"wgPageName":${JSON.stringify(title)},"wgArticleId":${pageId},"wgRevisionId":${revisionId},"wgNamespaceNumber":0};</script>
    <nav><h2>Appearance</h2><p>INTERFACE PANEL</p></nav>
    <div id="mw-content-text"><div class="mw-parser-output">${body}</div></div>`;
}
const article = fixture(`<div class="mw-heading mw-heading2"><h2 id="Appearance">Appearance</h2><span class="mw-editsection">edit</span></div>
  <p>FIRST SYNTHETIC PARAGRAPH.<sup class="reference"><a href="#cite_note-1">[1]</a></sup></p>
  <figure><p>IMAGE CAPTION</p></figure><table><tr><td><p>INFOBOX CONTENT</p></td></tr></table>
  <div class="mw-heading"><h3>A particular variant</h3></div>
  <p>SECOND SYNTHETIC PARAGRAPH.<script>UNSAFE SCRIPT</script></p>
  <h2>Ecology</h2><p>UNRELATED LORE</p>`);
const record = { id: "sf2e.ancestries.Item.1234567890abcdef", name: "Synthetic Ancestry", kind: "ancestry", publication: "Synthetic source" };
const source = { repository: "foundryvtt/pf2e", release: "test", commit: "pinned" };
const robots = "User-agent: *\nContent-Signal: ai-train=no, ai-input=yes\nDisallow: /w/\nDisallow: /api/\nDisallow: /wiki/Special:\nCrawl-delay: 1\n";

describe("wiki article source discovery", () => {
  it("accepts only article and numeric revision URLs on the exact HTTPS origin", () => {
    expect(validateWikiArticleUrl(wikiArticleUrl("G'folian", 123)).searchParams.get("oldid")).toBe("123");
    for (const url of [
      "https://starfinderwiki.com.evil.test/wiki/Vesk", "http://starfinderwiki.com/wiki/Vesk",
      "https://user@starfinderwiki.com/wiki/Vesk", "https://starfinderwiki.com/w/api.php",
      "https://starfinderwiki.com/wiki/Special:Export", "https://starfinderwiki.com/wiki/File:Vesk",
      "https://starfinderwiki.com/wiki/Vesk?action=edit", "https://starfinderwiki.com/wiki/Vesk?oldid=2&oldid=3",
      "https://starfinderwiki.com/wiki/Vesk?oldid=not-a-revision",
    ]) expect(() => validateWikiArticleUrl(url)).toThrow();
  });
  it("tries explicit name spelling and the normal sentence-case multiword title", () => {
    expect(wikiCandidateUrls("Living Hologram")).toEqual([
      "https://starfinderwiki.com/wiki/Living_Hologram", "https://starfinderwiki.com/wiki/Living_hologram",
    ]);
    expect(wikiCandidateUrls("SRO")).toHaveLength(1);
  });
  it("isolates the article Appearance section, preserving qualifiers and citation IDs", () => {
    const result = inspectWikiArticle(article, wikiArticleUrl("Synthetic_ancestry"));
    expect(result.status).toBe("found");
    expect(result.blocks).toEqual([
      { headings: [], text: "FIRST SYNTHETIC PARAGRAPH.", citationIds: ["cite_note-1"] },
      { headings: ["A particular variant"], text: "SECOND SYNTHETIC PARAGRAPH.", citationIds: [] },
    ]);
    expect(result.source.revisionUrl).toContain("oldid=2");
    expect(result.sectionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.blocks)).not.toMatch(/INTERFACE|CAPTION|INFOBOX|SCRIPT|LORE/);
  });
  it("supports older heading markup and Appearance below an h2", () => {
    const result = inspectWikiArticle(fixture('<h2>Description</h2><h3><span class="mw-headline">Appearance</span></h3><ul><li>A synthetic trait.</li></ul><h3>Other</h3><p>EXCLUDED</p>'), wikiArticleUrl("Synthetic"));
    expect(result.blocks.map((block: { text: string }) => block.text)).toEqual(["A synthetic trait."]);
  });
  it("does not mistake a skin setting for article appearance or merge duplicate sections", () => {
    expect(inspectWikiArticle(fixture("<h2>Ecology</h2>"), wikiArticleUrl("Synthetic")).status).toBe("missing-section");
    expect(inspectWikiArticle(fixture("<h2>Appearance</h2><p>One.</p><h2>Appearance</h2><p>Two.</p>"), wikiArticleUrl("Synthetic")).status).toBe("ambiguous-section");
    expect(inspectWikiArticle(fixture("<h2>Appearance</h2><figure>A caption.</figure>"), wikiArticleUrl("Synthetic")).status).toBe("empty-section");
  });
  it("rejects missing metadata and mismatched revision pins", () => {
    expect(() => inspectWikiArticle(article, wikiArticleUrl("Synthetic", 3))).toThrow("pinned revision");
    expect(() => inspectWikiArticle("<h2>Appearance</h2>", wikiArticleUrl("Synthetic"))).toThrow("metadata");
  });
  it("hashes extracted content rather than volatile scripts or skin settings", () => {
    const first = inspectWikiArticle(article, wikiArticleUrl("Synthetic"));
    const second = inspectWikiArticle(article.replace("INTERFACE PANEL", "DIFFERENT INTERFACE").replace('RLCONF={', 'RLCONF={"wgRequestId":"another-request",'), wikiArticleUrl("Synthetic"));
    expect(first.sectionHash).toBe(second.sectionHash);
  });
  it("obeys crawler denial and requires review when AI-input policy changes", () => {
    const policy = parseWikiRobots(robots);
    expect(policy.crawlDelayMs).toBe(1000);
    expect(policy.allows(wikiArticleUrl("Vesk"))).toBe(true);
    expect(parseWikiRobots(robots + "Disallow: /wiki/Vesk\n").allows(wikiArticleUrl("Vesk"))).toBe(false);
    expect(() => parseWikiRobots(robots.replace("ai-input=yes", "ai-input=no"))).toThrow("requires review");
    expect(() => parseWikiRobots("User-agent: *\nAllow: /\n")).toThrow("requires review");
  });
  it("honors application-specific crawler rules rather than wildcard permission", () => {
    expect(() => parseWikiRobots(robots + "\nUser-agent: StarBoardReferenceAudit\nDisallow: /\n")).toThrow();
  });
  it("records redirects and metrics without persisting source prose or asserting approval", async () => {
    const result = await auditWikiReferences({ source, records: [record] }, async () => ({ status: 200, html: article }));
    expect(result.records[0]).toMatchObject({ discoveryStatus: "found", identityReview: "pending", reusePermission: "unresolved", excerptStatus: "not-imported", source: { title: "Synthetic_ancestry", revisionId: 2 } });
    expect(result.records[0].appearance?.blockCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC PARAGRAPH");
    expect(JSON.stringify(result)).not.toContain("blocks");
  });
  it("retries title spelling only on a genuine missing page", async () => {
    const result = await auditWikiReferences({ source, records: [record] }, async (url: string) => ({
      status: url.endsWith("Synthetic_ancestry") ? 200 : 404, html: article,
    }));
    expect(result.records[0].attempts).toHaveLength(2);
    await expect(auditWikiReferences({ source, records: [record] }, async () => ({ status: 503, html: "" }))).rejects.toThrow("HTTP 503");
  });
  it("accounts for every one of the 60 catalog ancestries without inventing approval", async () => {
    let pageId = 0;
    const result = await auditWikiReferences(catalog, async () => ({ status: 200, html: fixture("<h2>Appearance</h2><p>Synthetic fixture only.</p>", `Synthetic_${++pageId}`, pageId, 2) }));
    expect(result.records).toHaveLength(60);
    expect(new Set(result.records.map((entry: { id: string }) => entry.id)).size).toBe(60);
    expect(result.records.every((entry: { reusePermission: string; identityReview: string }) => entry.reusePermission === "unresolved" && entry.identityReview === "pending")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Synthetic fixture only.");
  });
});
