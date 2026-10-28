import { readFile, open, rename, unlink } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditWikiReferences, parseWikiRobots, validateWikiArticleUrl, wikiAuditAgent, wikiOrigin } from "./wiki-appearance-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "lib", "references", "wiki-coverage.generated.json");
const catalog = JSON.parse(await readFile(path.join(root, "lib", "references", "catalog.generated.json"), "utf8"));
const headers = { "User-Agent": `${wikiAuditAgent}/0.1 (user-requested appearance-source discovery; https://github.com/LukanX/star-board)` };

async function main() {
  const robotsResponse = await fetch(`${wikiOrigin}/robots.txt`, { headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!robotsResponse.ok) throw new Error(`Cannot check the wiki crawler policy: HTTP ${robotsResponse.status}.`);
  const policy = parseWikiRobots(await robotsResponse.text());
  console.info("Wiki crawler policy checked. Discovering ancestry links serially; no excerpt text will be saved.");
  let lastRequestAt = Date.now();
  async function readArticle(input) {
    let url = validateWikiArticleUrl(input).href;
    let redirects = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await sleep(Math.max(0, policy.crawlDelayMs - (Date.now() - lastRequestAt)));
      if (!policy.allows(url)) throw new Error(`The wiki crawler policy does not allow ${url}.`);
      lastRequestAt = Date.now();
      const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || ++redirects > 3) throw new Error(`Invalid or excessive wiki redirects: ${url}.`);
        url = validateWikiArticleUrl(new URL(location, url)).href;
        attempt -= 1;
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get("retry-after");
        await response.body?.cancel();
        if (attempt === 2) throw new Error(`Wiki discovery failed after retries: HTTP ${response.status}: ${url}.`);
        const retryMs = retryAfter ? /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now() : policy.crawlDelayMs * (attempt + 1);
        if (!Number.isFinite(retryMs) || retryMs > 60_000) throw new Error(`Wiki retry requires deferring this audit: ${url}.`);
        await sleep(Math.max(policy.crawlDelayMs, retryMs));
        continue;
      }
      if (response.status === 404) { await response.body?.cancel(); return { status: 404, html: "" }; }
      if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
        await response.body?.cancel();
        throw new Error(`Unexpected wiki response: HTTP ${response.status}: ${url}.`);
      }
      const html = await response.text();
      if (Buffer.byteLength(html) > 2_000_000) throw new Error(`Wiki page exceeds the audit response limit: ${url}.`);
      return { status: response.status, html };
    }
    throw new Error(`Wiki discovery failed: ${url}.`);
  }
  const result = await auditWikiReferences(catalog, readArticle);
  const temporaryPath = `${output}.${process.pid}.tmp`;
  let created = false;
  try {
    const file = await open(temporaryPath, "wx");
    created = true;
    try {
      await file.writeFile(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      await file.close();
    }
    await rename(temporaryPath, output);
  } catch (error) {
    if (created) await unlink(temporaryPath).catch((cleanupError) => {
      if (cleanupError.code !== "ENOENT") console.error(`Unable to clean audit temporary file: ${cleanupError.message}`);
    });
    throw error;
  }
  const counts = result.records.reduce((summary, record) => ({ ...summary, [record.discoveryStatus]: (summary[record.discoveryStatus] ?? 0) + 1 }), {});
  console.info(`Audited ${result.records.length} ancestries: ${JSON.stringify(counts)}.`);
  console.info("Saved metadata only. All identities require review; excerpt-reuse permission is unresolved. Runtime catalog and prompts are unchanged.");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
