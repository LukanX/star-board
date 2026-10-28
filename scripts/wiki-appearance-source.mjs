import { createHash } from "node:crypto";
import { load } from "cheerio";

export const wikiOrigin = "https://starfinderwiki.com";
export const wikiAuditAgent = "StarBoardReferenceAudit";
const excludedContent = "script, style, nav, aside, table, figure, .thumb, .thumbcaption, .hatnote, .navbox, .mw-editsection";
const normalizeText = (text) => text.replace(/[\u200b\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();

export function validateWikiArticleUrl(input) {
  const url = new URL(input);
  if (url.origin !== wikiOrigin || url.username || url.password || !url.pathname.startsWith("/wiki/")) {
    throw new Error("Only HTTPS StarfinderWiki article URLs are allowed.");
  }
  const title = decodeURIComponent(url.pathname.slice("/wiki/".length));
  if (!title || /[:/\\]/.test(title) || [...url.searchParams].some(([key, value]) => key !== "oldid" || !/^[1-9]\d*$/.test(value))) {
    throw new Error("Special pages, non-article paths, and action queries are not allowed.");
  }
  if (url.searchParams.getAll("oldid").length > 1) throw new Error("A wiki article can have only one revision selector.");
  return url;
}

export function wikiArticleUrl(title, revisionId) {
  const url = new URL(`/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`, wikiOrigin);
  if (revisionId !== undefined) url.searchParams.set("oldid", String(revisionId));
  return validateWikiArticleUrl(url).href;
}

export function wikiCandidateUrls(name) {
  const title = name.trim().replace(/\s+/g, "_");
  const separator = title.indexOf("_");
  return [...new Set([
    wikiArticleUrl(title),
    ...(separator >= 0 ? [wikiArticleUrl(title.slice(0, separator + 1) + title.slice(separator + 1).toLowerCase())] : []),
  ])];
}

export function parseWikiRobots(text) {
  const groups = [];
  let group = { agents: [], rules: [], signals: {}, crawlDelayMs: 1000 };
  let hasDirectives = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (hasDirectives) {
        groups.push(group);
        group = { agents: [], rules: [], signals: {}, crawlDelayMs: 1000 };
        hasDirectives = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length) {
      hasDirectives = true;
      if ((key === "allow" || key === "disallow") && value) group.rules.push({ allow: key === "allow", path: value });
      if (key === "content-signal") {
        for (const signal of value.split(",")) {
          const [name, setting] = signal.trim().split("=");
          group.signals[name] = setting;
        }
      }
      if (key === "crawl-delay") {
        const delay = Number(value);
        if (!Number.isFinite(delay) || delay < 0) throw new Error("The wiki crawl delay is invalid.");
        group.crawlDelayMs = Math.max(1000, delay * 1000);
      }
    }
  }
  if (group.agents.length) groups.push(group);
  const specificity = (agent) => agent === "*" ? 0 : wikiAuditAgent.toLowerCase().startsWith(agent.replace(/\*$/, "")) ? agent.length : -1;
  const matching = groups.map((entry) => ({ entry, score: Math.max(...entry.agents.map(specificity)) })).filter(({ score }) => score >= 0);
  const score = Math.max(...matching.map((entry) => entry.score));
  const applicable = matching.filter((entry) => entry.score === score).map(({ entry }) => entry);
  if (!applicable.length) throw new Error("No applicable wiki crawler policy was found.");
  if (!applicable.some((entry) => entry.signals["ai-input"] === "yes") || applicable.some((entry) => entry.signals["ai-input"] === "no")) {
    throw new Error("The current wiki policy requires review before AI-input source discovery.");
  }
  const rules = applicable.flatMap((entry) => entry.rules);
  return {
    crawlDelayMs: Math.max(...applicable.map((entry) => entry.crawlDelayMs)),
    allows(input) {
      const url = validateWikiArticleUrl(input);
      const path = url.pathname + url.search;
      const matches = rules.filter((rule) => {
        const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        return new RegExp(`^${pattern}`).test(path);
      }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
      return matches[0]?.allow ?? true;
    },
  };
}

export function inspectWikiArticle(html, requestedUrl) {
  const request = validateWikiArticleUrl(requestedUrl);
  const readString = (name) => {
    const match = html.match(new RegExp(`"${name}":("(?:[^"\\\\]|\\\\.)*")`));
    if (!match) throw new Error(`Wiki article metadata is missing ${name}.`);
    return JSON.parse(match[1]);
  };
  const readNumber = (name) => {
    const match = html.match(new RegExp(`"${name}":(\\d+)`));
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error(`Wiki article metadata is missing or invalid: ${name}.`);
    return Number(match[1]);
  };
  const title = readString("wgPageName");
  const pageId = readNumber("wgArticleId");
  const revisionId = readNumber("wgRevisionId");
  if (!pageId || !revisionId || readNumber("wgNamespaceNumber") !== 0) throw new Error("The response is not a published main-namespace wiki article.");
  if (request.searchParams.has("oldid") && Number(request.searchParams.get("oldid")) !== revisionId) throw new Error("The wiki response does not match the pinned revision.");
  const pageUrl = wikiArticleUrl(title);
  const revisionUrl = wikiArticleUrl(title, revisionId);
  const $ = load(html);
  const article = $("#mw-content-text .mw-parser-output").first();
  if (!article.length) throw new Error("The wiki article content container is missing.");
  const headingText = (element) => normalizeText($(element).clone().find(".mw-editsection").remove().end().text());
  const headings = article.find("h1, h2, h3, h4, h5, h6").toArray().filter((element) =>
    !$(element).closest(excludedContent).length && headingText(element).toLowerCase() === "appearance",
  );
  const source = { title, pageId, revisionId, pageUrl, revisionUrl, sectionUrl: `${revisionUrl}#Appearance` };
  if (headings.length !== 1) return { source, status: headings.length ? "ambiguous-section" : "missing-section", blocks: [], sectionHash: null };
  const start = headings[0];
  const level = Number(start.tagName.slice(1));
  const blocks = [];
  const qualifiers = [];
  let active = false;
  for (const element of article.find("h1, h2, h3, h4, h5, h6, p, li").toArray()) {
    const node = $(element);
    if (node.closest(excludedContent).length) continue;
    if (element === start) { active = true; continue; }
    if (!active) continue;
    if (/^h[1-6]$/.test(element.tagName)) {
      const nextLevel = Number(element.tagName.slice(1));
      if (nextLevel <= level) break;
      while (qualifiers.length && qualifiers.at(-1).level >= nextLevel) qualifiers.pop();
      qualifiers.push({ level: nextLevel, text: headingText(element) });
      continue;
    }
    if (element.tagName === "li" && node.find("p, li").length) continue;
    const citationIds = [...new Set(node.find(".reference a[href]").toArray().map((anchor) => {
      const href = $(anchor).attr("href");
      const hash = new URL(href, pageUrl).hash;
      return hash ? decodeURIComponent(hash.slice(1)) : "";
    }).filter(Boolean))];
    const text = normalizeText(node.clone().find(`${excludedContent}, .reference`).remove().end().text());
    if (text) blocks.push({ headings: qualifiers.map((entry) => entry.text), text, citationIds });
  }
  return {
    source,
    status: blocks.length ? "found" : "empty-section",
    blocks,
    sectionHash: blocks.length ? createHash("sha256").update(JSON.stringify(blocks)).digest("hex") : null,
  };
}

export async function auditWikiReferences(catalog, readArticle) {
  const ancestries = catalog.records.filter((record) => record.kind === "ancestry");
  if (!ancestries.length || new Set(ancestries.map((record) => record.id)).size !== ancestries.length) throw new Error("The ancestry catalog is empty or has duplicate identities.");
  const records = [];
  for (const record of ancestries) {
    const attempts = [];
    let inspection;
    for (const url of wikiCandidateUrls(record.name)) {
      const response = await readArticle(url);
      attempts.push({ url, status: response.status });
      if (response.status === 404) continue;
      if (response.status !== 200) throw new Error(`Wiki discovery failed with HTTP ${response.status}: ${url}`);
      inspection = inspectWikiArticle(response.html, url);
      break;
    }
    records.push({
      id: record.id,
      name: record.name,
      foundryPublication: record.publication,
      attempts,
      source: inspection?.source ?? null,
      discoveryStatus: inspection?.status ?? "missing-page",
      appearance: inspection ? {
        blockCount: inspection.blocks.length,
        characterCount: inspection.blocks.reduce((sum, block) => sum + block.text.length, 0),
        citationCount: new Set(inspection.blocks.flatMap((block) => block.citationIds)).size,
        sectionHash: inspection.sectionHash,
      } : null,
      identityReview: "pending",
      reusePermission: "unresolved",
      excerptStatus: "not-imported",
    });
  }
  return {
    schemaVersion: 1,
    purpose: "Metadata discovery only; not identity verification, permission, or excerpt approval.",
    foundrySource: { repository: catalog.source.repository, release: catalog.source.release, commit: catalog.source.commit },
    records,
  };
}
