import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { openReferenceSource } from "./refresh-reference-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "lib", "references");

export function extractCreatureTraits(text) {
  const file = ts.createSourceFile("traits.ts", text, ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) declarations.set(declaration.name.text, declaration.initializer);
    }
  }
  const resolve = (node, seen = new Set()) => {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return resolve(node.expression, seen);
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text) || !declarations.has(node.text)) throw new Error(`Unresolved trait map: ${node.text}`);
      return resolve(declarations.get(node.text), new Set([...seen, node.text]));
    }
    if (!ts.isObjectLiteralExpression(node)) throw new Error("Unsupported trait map expression.");
    const result = {};
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) Object.assign(result, resolve(property.expression, seen));
      else if (ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        && ts.isStringLiteral(property.initializer)) {
        const key = property.name.text;
        if (Object.hasOwn(result, key) && result[key] !== property.initializer.text) throw new Error(`Conflicting creature trait: ${key}`);
        result[key] = property.initializer.text;
      } else throw new Error("Unsupported trait map property.");
    }
    return result;
  };
  const node = declarations.get("creatureTraits");
  if (!node) throw new Error("Creature-trait namespace not found.");
  return resolve(node);
}

export async function buildCreatureTraitCatalog(readSource, source) {
  const paths = ["src/scripts/config/traits.ts", "src/scripts/config/index.ts", "static/lang/en.json", "static/lang/sf2e-overrides-en.json"];
  const texts = await Promise.all(paths.map(readSource));
  const labels = texts.slice(2).map((text) => JSON.parse(text));
  const lookup = (object, key) => key.split(".").reduce((value, part) => value?.[part], object);
  const traits = extractCreatureTraits(texts[0]);
  if (!/\bcreatureTraits\b/.test(texts[1])) throw new Error("Configured creature-trait namespace is missing.");
  const inputs = paths.map((name, index) => ({ path: name, hash: createHash("sha256").update(texts[index]).digest("hex") }));
  const catalogVersion = `${source.release}-traits-${createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16)}`;
  const records = Object.entries(traits).sort(([a], [b]) => a.localeCompare(b, "en")).map(([slug, key]) => {
    const name = lookup(labels[1], key) ?? lookup(labels[0], key);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || typeof name !== "string" || !name.trim() || name.length > 48) throw new Error(`Invalid creature-trait metadata: ${slug}`);
    return { id: `sf2e.creature-traits.${slug}`, kind: "creature_trait", slug, name, sourceUrl: `https://github.com/${source.repository}/blob/${source.commit}/${paths[0]}` };
  });
  if (!records.length) throw new Error("Empty creature-trait namespace.");
  const ambiguous = records.filter((record, index) => records.findIndex((other) => other.name.toLowerCase() === record.name.toLowerCase()) !== index);
  if (ambiguous.length) console.info(`Shared display labels (distinct slugs): ${ambiguous.map((record) => record.slug).join(", ")}.`);
  return { catalogVersion, source, inputs, records };
}

async function main() {
  const source = JSON.parse(await readFile(path.join(directory, "source.json"), "utf8"));
  const { readSource } = await openReferenceSource(source);
  const artifact = await buildCreatureTraitCatalog(readSource, source);
  await writeFile(path.join(directory, "creature-traits.generated.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  console.info(`Built ${artifact.records.length} creature traits (${artifact.catalogVersion}). No descriptions imported.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
