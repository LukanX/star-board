import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignRole } from "@/lib/auth/permissions";
import { readCampaignEnemyForRole } from "@/lib/campaign/enemies-server";
import { buildFoundryNpcActor } from "@/lib/enemies/foundry/export";

type RouteContext = { params: Promise<{ campaignId: string; enemyId: string }> };

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function downloadName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "enemy"}-foundry-actor.json`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { campaignId, enemyId } = await params;

  try {
    const context = await getAuthenticatedUser();
    if (!context) return noStoreJson({ error: "Authentication is required." }, 401);

    const role = await getCampaignRole(context.supabase, campaignId, context.user.id);
    if (role !== "gm") return noStoreJson({ error: "GM access is required." }, 403);

    const enemy = await readCampaignEnemyForRole(context.supabase, campaignId, enemyId, "gm");
    if (!enemy) return noStoreJson({ error: "Enemy not found." }, 404);

    const result = buildFoundryNpcActor(enemy);
    if (!result.actor) return noStoreJson({ error: "Enemy cannot be exported.", errors: result.errors }, 422);

    return noStoreJson({
      actor: result.actor,
      warnings: result.warnings,
      fileName: downloadName(enemy.name),
    });
  } catch {
    return noStoreJson({ error: "Campaign service is not configured." }, 503);
  }
}