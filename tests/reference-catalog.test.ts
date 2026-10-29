import { describe, expect, it } from "vitest";
import { buildReferenceContext, referenceCatalogVersion, resolveReference, searchReferences } from "@/lib/references/catalog";
import { prepareReferenceSelection } from "@/lib/references/records";
import { referenceBindingSchema } from "@/lib/validation/reference";

const android = searchReferences("ancestry", "Android")[0];
const kasatha = searchReferences("ancestry", "Kasatha")[0];
const soldier = searchReferences("class", "Soldier")[0];

describe("pinned reference catalog", () => {
  it("returns bounded, exact-first typed metadata without source prose", () => {
    expect(android.name).toBe("Android");
    expect(android.binding.catalogVersion).toBe(referenceCatalogVersion);
    expect(searchReferences("ancestry", "", 100)).toHaveLength(20);
    expect(searchReferences("class", "").every((entry) => entry.kind === "class")).toBe(true);
    expect(Object.keys(android)).not.toContain("rules");
    expect(android.sourceUrl).toContain("28d9d156f252d084371d994dc359509b49eadf18");
  });

  it("checks kind, identity, display text, and catalog revision", () => {
    expect(() => resolveReference(android.binding, "class")).toThrow("wrong kind");
    expect(() => resolveReference(android.binding, "ancestry", "Vesk")).toThrow("does not match");
    expect(() => resolveReference({ ...android.binding, catalogVersion: "old" }, "ancestry")).toThrow("version is unavailable");
    expect(referenceBindingSchema.safeParse({ ...android.binding, facts: "forged" }).success).toBe(false);
    expect(referenceBindingSchema.safeParse({ id: "arbitrary", catalogVersion: "v1" }).success).toBe(false);
  });

  it("retires ancestry profiles without changing selected class context or identity", () => {
    const context = buildReferenceContext([
      { kind: "ancestry", text: "Kasatha", binding: kasatha.binding },
      { kind: "class", text: "Soldier", binding: soldier.binding },
    ]);
    expect(context.text).not.toContain("Four arms");
    expect(context.text).toContain("Class identity context");
    expect(context.text).toContain("Explicit subject details");
    expect(context.text).toContain("Naming lore is not included");
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(context.text.length).toBeLessThanOrEqual(4000);
    expect(buildReferenceContext([{ kind: "ancestry", text: "Android" }])).toEqual({ text: "", sources: [] });
  });

  it("distinguishes unreviewed anatomy from a broken binding", () => {
    const unreviewed = searchReferences("ancestry", "Ysoki")[0];
    const context = buildReferenceContext([{ kind: "ancestry", text: "Ysoki", binding: unreviewed.binding }]);
    expect(context.text).toBe("");
    expect(context.sources[0].coverage).toBe("not-reviewed");
  });

  it("preserves, clears, and validates bindings according to patch semantics", () => {
    const previous = { text: "Android", binding: android.binding };
    expect(prepareReferenceSelection("ancestry", "Android", undefined, previous)).toBeUndefined();
    expect(prepareReferenceSelection("ancestry", "Custom", undefined, previous)).toBeNull();
    expect(prepareReferenceSelection("ancestry", "Android", null, previous)).toBeNull();
    expect(() => prepareReferenceSelection("ancestry", "Custom", android.binding, previous)).toThrow("does not match");
    const stale = { ...android.binding, catalogVersion: "old" };
    expect(prepareReferenceSelection("ancestry", "Android", stale, { text: "Android", binding: stale })).toEqual(stale);
    expect(() => prepareReferenceSelection("ancestry", "Android", stale)).toThrow("version is unavailable");
  });
});
