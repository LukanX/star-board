import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { ReferenceError, referenceCatalogVersion, resolveReference, searchReferences } from "@/lib/references/catalog";
import { referenceBindingSchema } from "@/lib/validation/reference";
import { creatureTraitBindingSchema } from "@/lib/validation/reference";
import { creatureTraitRecords, creatureTraitVersion, readSystemLibrary, resolveCreatureTrait } from "@/lib/references/system-library";
import type { ReferenceCandidate } from "@/lib/references/types";

export const runtime = "nodejs";
const querySchema = z.object({
  kind: z.enum(["ancestry", "class", "creature_trait"]),
  q: z.string().trim().max(160).default(""),
  limit: z.coerce.number().int().min(1).max(20).default(20),
  id: z.union([referenceBindingSchema.shape.id, creatureTraitBindingSchema.shape.id]).optional(),
  catalogVersion: referenceBindingSchema.shape.catalogVersion.optional(),
}).strict().refine((value) => Boolean(value.id) === Boolean(value.catalogVersion), { message: "Exact lookup requires both ID and catalog version." });

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const input = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return json({ error: "Reference query is invalid.", issues: input.error.flatten() }, 400);
  try {
    const context = await getAuthenticatedUser();
    if (!context) return json({ error: "Authentication is required." }, 401);
    if (!await getCampaignMembership(context.supabase, campaignId, context.user.id)) return json({ error: "Campaign membership is required." }, 403);
    const { kind, q, limit, id, catalogVersion } = input.data;
    if (kind !== "class") {
      let results: ReferenceCandidate[];
      if (kind === "creature_trait") {
        if (id && catalogVersion) resolveCreatureTrait({ id, catalogVersion });
        results = creatureTraitRecords.filter((record) => id ? record.id === id : record.name.toLowerCase().includes(q.toLowerCase()) || record.slug.includes(q.toLowerCase()))
          .slice(0, limit).map((record) => ({ binding: { id: record.id, catalogVersion: creatureTraitVersion }, kind, name: record.name, publication: `Creature trait · ${record.slug}`, sourceUrl: record.sourceUrl, preview: "", coverage: "not-reviewed" }));
      } else {
        const record = id && catalogVersion ? resolveReference({ id, catalogVersion }, kind) : null;
        results = searchReferences(kind, record?.name ?? q, limit).filter((candidate) => !id || candidate.binding.id === id);
      }
      if (results.length) {
        const content = await readSystemLibrary(context.supabase, results.map((candidate) => candidate.binding.id), campaignId);
        results = results.map((candidate) => {
          const entry = content.find((entry) => entry.reference_id === candidate.binding.id);
          if (!entry) throw new ReferenceError("The System library metadata is incomplete.", 503);
          return { ...candidate, coverage: (entry.appearance || entry.lore || entry.trait_context).trim() ? "available" : "not-reviewed" };
        });
      }
      return json({ catalogVersion: kind === "ancestry" ? referenceCatalogVersion : creatureTraitVersion, results });
    }
    if (id && catalogVersion) {
      const record = resolveReference({ id, catalogVersion }, kind);
      const candidate = searchReferences(kind, record.name).find((entry) => entry.binding.id === id);
      if (!candidate) throw new ReferenceError("The reference search index is inconsistent.", 503);
      return json({ catalogVersion: referenceCatalogVersion, results: [candidate] });
    }
    return json({ catalogVersion: referenceCatalogVersion, results: searchReferences(kind, q, limit) });
  } catch (error) {
    if (error instanceof ReferenceError) return json({ error: error.message }, error.status);
    console.error("reference_lookup_failed", { errorName: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Reference lookup is temporarily unavailable." }, 503);
  }
}
