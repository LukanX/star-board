import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiImagePricing } from "@/lib/ai/image-pricing";
import { getAiModelCatalog } from "@/lib/ai/model-discovery";
import { requireCampaignGM } from "@/lib/auth/permissions";
import { campaignCredentialErrorResponse, resolveCampaignCredential } from "@/lib/ai/route-support";

export const runtime = "nodejs";

const modelIdSchema = z.string().max(324).regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i);

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const campaignId = z.string().uuid().safeParse(searchParams.get("campaignId"));
  const modelId = modelIdSchema.safeParse(searchParams.get("modelId"));

  if (!campaignId.success || !modelId.success) {
    return NextResponse.json({ error: "A campaign ID and valid image model ID are required." }, { status: 400 });
  }

  try {
    const gmContext = await requireCampaignGM(campaignId.data);
    if (!gmContext) return NextResponse.json({ error: "GM access is required to view image pricing." }, { status: 403 });

    let campaignCredential;
    try {
      campaignCredential = await resolveCampaignCredential(campaignId.data);
    } catch (error) {
      return campaignCredentialErrorResponse(error, "Image pricing is temporarily unavailable.");
    }

    const catalog = await getAiModelCatalog(campaignCredential.apiKey, "image");
    const catalogModel = catalog.models.find((model) => model.id === modelId.data && model.capability === "image" && model.compatible);
    if (!catalogModel) return NextResponse.json({ error: "The image model is not in this campaign's OpenRouter catalog." }, { status: 404 });

    const pricing = await getAiImagePricing(campaignCredential.apiKey, modelId.data);
    return NextResponse.json({ modelId: modelId.data, ...pricing }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Image pricing is temporarily unavailable." }, { status: 503 });
  }
}