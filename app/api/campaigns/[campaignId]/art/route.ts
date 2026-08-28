import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUser, getCampaignMembership } from "@/lib/auth/permissions";
import { campaignArtBucket, createCampaignArtSignedUrl, createCampaignArtSignedUrlForCampaign, removeCampaignArtIfUnreferenced, validateCampaignArtPath } from "@/lib/storage/campaign-art";
import { campaignArtKindSchema, campaignArtMaxBytes, campaignArtMimeTypes } from "@/lib/validation/art";

type RouteContext = { params: Promise<{ campaignId: string }> };

export const runtime = "nodejs";

export async function GET(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const path = new URL(request.url).searchParams.get("path");

  if (!path || !validateCampaignArtPath(campaignId, path)) {
    return NextResponse.json({ error: "Campaign art path is invalid." }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const signed = await createCampaignArtSignedUrlForCampaign(context.supabase, campaignId, path);
    return NextResponse.json({ path, signedUrl: signed.signedUrl, expiresIn: signed.expiresIn });
  } catch {
    return NextResponse.json({ error: "Campaign art could not be signed." }, { status: 404 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (contentLength > campaignArtMaxBytes + 64 * 1024) {
      return NextResponse.json({ error: "Campaign art upload is too large." }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const kind = campaignArtKindSchema.safeParse(formData.get("kind"));

    if (!(file instanceof File) || !kind.success) {
      return NextResponse.json({ error: "An image file and art kind are required." }, { status: 400 });
    }

    if (kind.data === "enemy" && membership.role !== "gm") {
      return NextResponse.json({ error: "GM access is required for enemy artwork." }, { status: 403 });
    }

    const extension = campaignArtMimeTypes[file.type as keyof typeof campaignArtMimeTypes];

    if (!extension) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, and GIF images are supported." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > campaignArtMaxBytes) {
      return NextResponse.json({ error: "Campaign art must be between 1 byte and 5 MB." }, { status: 400 });
    }

    const path = `${campaignId}/${context.user.id}/${kind.data}-${randomUUID()}.${extension}`;
    const { error } = await context.supabase.storage.from(campaignArtBucket).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return NextResponse.json({ error: "Unable to upload campaign art." }, { status: 400 });
    }

    const signedUrl = await createCampaignArtSignedUrl(context.supabase, path);
    return NextResponse.json({ asset: { path, signedUrl, contentType: file.type, size: file.size, kind: kind.data } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Campaign art upload is unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { campaignId } = await params;
  const path = new URL(request.url).searchParams.get("path");

  if (!path || !validateCampaignArtPath(campaignId, path)) {
    return NextResponse.json({ error: "Campaign art path is invalid." }, { status: 400 });
  }

  try {
    const context = await getAuthenticatedUser();

    if (!context) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const membership = await getCampaignMembership(context.supabase, campaignId, context.user.id);

    if (!membership) {
      return NextResponse.json({ error: "Campaign membership is required." }, { status: 403 });
    }

    await removeCampaignArtIfUnreferenced(context.supabase, campaignId, path);

    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Campaign art deletion is unavailable." }, { status: 503 });
  }
}
