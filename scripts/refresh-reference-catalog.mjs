import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "lib", "references");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export async function buildReferenceCatalog(readSource, files, source, profiles) {
  const records = [];
  const inputs = [];
  const journalText = await readSource("packs/sf2e/journals/ancestries.json");
  const journal = JSON.parse(journalText);
  inputs.push({ path: "packs/sf2e/journals/ancestries.json", hash: sha256(journalText) });
  for (const sourcePath of [...files].sort()) {
    if (!/^packs\/sf2e\/(ancestries|classes)\/[^/]+\.json$/.test(sourcePath)) continue;
    const text = await readSource(sourcePath);
    const entry = JSON.parse(text);
    if (entry.type !== "ancestry" && entry.type !== "class") continue;
    if (!/^[a-zA-Z0-9]{16}$/.test(entry._id) || typeof entry.name !== "string" || entry.name.length > 160) {
      throw new Error(`Invalid reference identity: ${sourcePath}`);
    }
    const relativePath = sourcePath.replace("packs/sf2e/", "");
    if ((relativePath.startsWith("ancestries/") ? "ancestry" : "class") !== entry.type) throw new Error(`Reference kind does not match pack: ${sourcePath}`);
    const id = `sf2e.${relativePath.split("/")[0]}.Item.${entry._id}`;
    if (records.some((record) => record.id === id)) throw new Error(`Duplicate reference identity: ${sourcePath}`);
    const profile = profiles[relativePath];
    if (profile && profile.name !== entry.name) throw new Error(`Profile name changed: ${sourcePath}`);
    if (profile?.pageId) {
      const page = journal.pages.find((candidate) => candidate._id === profile.pageId);
      if (!page || !entry.system.description.value.includes(`JournalEntryPage.${profile.pageId}`)) {
        throw new Error(`Unresolved profile journal link: ${sourcePath}`);
      }
    }
    inputs.push({ path: sourcePath, hash: sha256(text) });
    records.push({
      id,
      kind: entry.type,
      name: entry.name,
      aliases: [],
      publication: entry.system.publication?.title ?? "",
      declaredLicense: entry.system.publication?.license ?? "",
      sourcePath,
      sourceHash: sha256(text),
      sourceUrl: `https://github.com/${source.repository}/blob/${source.commit}/${sourcePath}`,
      ...(profile?.pageId ? { pageId: profile.pageId, journalId: journal._id } : {}),
      facts: profile?.facts ?? [],
      summary: profile?.summary ?? "",
      anatomy: profile?.facts?.length ? "available" : "not-reviewed",
      naming: "not-approved",
    });
  }
  for (const key of Object.keys(profiles)) {
    if (!records.some((record) => record.sourcePath === `packs/sf2e/${key}`)) throw new Error(`Missing profiled record: ${key}`);
  }
  const identity = sha256(JSON.stringify({ source, profiles, inputs }));
  return { catalogVersion: `${source.release}-${identity.slice(0, 16)}`, source, inputs, records };
}

export async function openReferenceSource(source, args = process.argv) {
  const sourceIndex = args.indexOf("--source");
  const checkout = sourceIndex >= 0 ? args[sourceIndex + 1] : null;
  let files;
  let readSource;
  if (checkout) {
    const { execFileSync } = await import("node:child_process");
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim();
    if (commit !== source.commit) throw new Error("Source checkout does not match the pinned commit.");
    const trackedChanges = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "packs/sf2e"], { cwd: checkout, encoding: "utf8" });
    if (trackedChanges.trim()) throw new Error("Source packs contain uncommitted changes.");
    files = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", ...source.packs.map((pack) => `packs/sf2e/${pack}`)], { cwd: checkout, encoding: "utf8" }).trim().split("\n");
    readSource = (name) => execFileSync("git", ["show", `${source.commit}:${name}`], { cwd: checkout, encoding: "utf8" });
  } else if (args.includes("--download")) {
    const fetchText = async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Reference source HTTP ${response.status}: ${url}`);
      return response.text();
    };
    const tree = JSON.parse(await fetchText(`https://api.github.com/repos/${source.repository}/git/trees/${source.commit}?recursive=1`));
    if (tree.truncated) throw new Error("Upstream source tree is truncated.");
    const entries = new Map(tree.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]));
    files = [...entries.keys()].filter((name) => /^packs\/sf2e\/(ancestries|classes)\/[^/]+\.json$/.test(name));
    readSource = async (name) => {
      const text = await fetchText(`https://raw.githubusercontent.com/${source.repository}/${source.commit}/${name}`);
      const actual = createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
      if (actual !== entries.get(name)) throw new Error(`Source hash mismatch: ${name}`);
      return text;
    };
  } else {
    throw new Error("Choose --source <pinned checkout> or --download. Normal builds do not refresh reference data.");
  }
  return { readSource, files };
}

async function main() {
  const source = JSON.parse(await readFile(path.join(directory, "source.json"), "utf8"));
  const profiles = JSON.parse(await readFile(path.join(directory, "profiles.json"), "utf8"));
  const { readSource, files } = await openReferenceSource(source);
  const catalog = await buildReferenceCatalog(readSource, files, source, profiles);
  await writeFile(path.join(directory, "catalog.generated.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  console.info(`Built ${catalog.records.length} references (${catalog.catalogVersion}). Anatomy: ${catalog.records.filter((record) => record.anatomy === "available").length}; naming excluded.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
