import { NextResponse } from "next/server";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { createCampaignArtSignedUrl } from "@/lib/storage/campaign-art";
import { campaignEntityPath, type EntitySection } from "@/lib/campaign/routes";

type RouteContext = { params: Promise<{ campaignId: string }> };
type PreviewSection = "characters" | "npcs" | "places" | "factions" | "jobs" | "enemies" | "episodes";
type PreviewRecord = {
  id: string;
  name: string;
  description: string;
  artPath: string | null;
  isEnemy?: boolean;
};

export const runtime = "nodejs";

const markdownProcessor = unified().use(remarkParse).use(remarkGfm);
const sections: readonly PreviewSection[] = ["characters", "npcs", "places", "factions", "jobs", "enemies", "episodes"];

function markdownText(markdown: string): string {
  const tree = markdownProcessor.parse(markdown);
  const collect = (value: unknown): string => {
    if (Array.isArray(value)) return value.map(collect).join(" ");
    if (!value || typeof value !== "object") return "";
    const node = value as { type?: unknown; value?: unknown; alt?: unknown; children?: unknown[] };
    if (node.type === "html") return "";
    if ((node.type === "text" || node.type === "inlineCode" || node.type === "code") && typeof node.value === "string") return node.value;
    if (node.type === "image") return typeof node.alt === "string" ? node.alt : "";
    return Array.isArray(node.children) ? node.children.map(collect).join(" ") : "";
  };
  return collect(tree).replace(/\s+/g, " ").trim();
}

function briefDescription(value: string | null | undefined, fallback: string): string {
  const normalized = markdownText(value?.trim() || fallback).slice(0, 280).trim();
  if (normalized.length < markdownText(value?.trim() || fallback).length) return `${normalized}...`;
  return normalized;
}

async function readPreviewRecord(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>["supabase"],
  campaignId: string,
  section: PreviewSection,
  id: string,
): Promise<{ record: PreviewRecord | null; unavailable: boolean }> {
  if (section === "characters") {
    const { data, error } = await supabase.from("characters")
      .select("id, name, species, class_name, level, physical_description, art_path")
      .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
    if (error) return { record: null, unavailable: true };
    if (!data) return { record: null, unavailable: false };
    return { record: { id: data.id, name: data.name, description: briefDescription(data.physical_description, [data.species, data.class_name ? `Level ${data.level} ${data.class_name}` : ""].filter(Boolean).join(" // ")), artPath: data.art_path }, unavailable: false };
  }
  if (section === "npcs") {
    const { data, error } = await supabase.from("npcs")
      .select("id, name, species, role, description, art_path")
      .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
    if (error) return { record: null, unavailable: true };
    if (!data) return { record: null, unavailable: false };
    return { record: { id: data.id, name: data.name, description: briefDescription(data.description, [data.species, data.role].filter(Boolean).join(" // ")), artPath: data.art_path }, unavailable: false };
  }
  if (section === "places") {
    const { data, error } = await supabase.from("places")
      .select("id, name, kind, description, art_path")
      .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
    if (error) return { record: null, unavailable: true };
    if (!data) return { record: null, unavailable: false };
    return { record: { id: data.id, name: data.name, description: briefDescription(data.description, data.kind), artPath: data.art_path }, unavailable: false };
  }
  if (section === "factions") {
    const { data, error } = await supabase.from("factions")
      .select("id, name, status, description, art_path")
      .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
    if (error) return { record: null, unavailable: true };
    if (!data) return { record: null, unavailable: false };
    return { record: { id: data.id, name: data.name, description: briefDescription(data.description, data.status), artPath: data.art_path }, unavailable: false };
  }
  if (section === "jobs") {
    const { data, error } = await supabase.from("jobs")
      .select("id, title, status, summary, art_path")
      .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
    if (error) return { record: null, unavailable: true };
    if (!data) return { record: null, unavailable: false };
    return { record: { id: data.id, name: data.title, description: briefDescription(data.summary, `${data.status} job`), artPath: data.art_path }, unavailable: false };
  }
  if (section === "enemies") {
    const { data, error } = await supabase.from("enemies")
      .select("id, name, player_description, art_path")
      .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
    if (error) return { record: null, unavailable: true };
    if (!data) return { record: null, unavailable: false };
    return { record: { id: data.id, name: data.name, description: briefDescription(data.player_description, "Enemy record"), artPath: data.art_path, isEnemy: true }, unavailable: false };
  }

  const { data, error } = await supabase.from("episodes")
    .select("id, title, summary, player_context_markdown")
    .eq("campaign_id", campaignId).eq("id", id).maybeSingle();
  if (error) return { record: null, unavailable: true };
  if (!data) return { record: null, unavailable: false };
  return { record: { id: data.id, name: data.title, description: briefDescription(data.summary || data.player_context_markdown, "Episode record"), artPath: null }, unavailable: false };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const query = new URL(request.url).searchParams;
  const section = query.get("section");
  const id = query.get("id");

  if (!section || !sections.includes(section as PreviewSection) || !id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Entity preview reference is invalid." }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();
    if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);
    if (!membership) return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });

    const { record, unavailable } = await readPreviewRecord(context.supabase, campaignId, section as PreviewSection, id);
    if (unavailable) return NextResponse.json({ error: "Unable to load entity preview." }, { status: 503 });
    if (!record) return NextResponse.json({ error: "Campaign entity not found." }, { status: 404 });

    let imageUrl: string | null = null;
    if (record.artPath) {
      try {
        imageUrl = await createCampaignArtSignedUrl(context.supabase, record.artPath, 600, record.isEnemy ?? false);
      } catch {
        imageUrl = null;
      }
    }

    return NextResponse.json({
      entity: {
        id: record.id,
        name: record.name,
        description: record.description,
        imageUrl,
        href: campaignEntityPath(campaignId, section as EntitySection, id),
      },
    });
  } catch {
    return NextResponse.json({ error: "Campaign service is not configured." }, { status: 503 });
  }
}