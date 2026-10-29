import { referenceSearchResponseSchema } from "@/lib/validation/reference";

export async function searchCampaignReferences(campaignId: string, params: URLSearchParams, signal: AbortSignal) {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/references?${params}`, { signal, cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Reference lookup failed.";
    throw new Error(message);
  }
  const parsed = referenceSearchResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error("The reference lookup response was invalid.");
  return parsed.data;
}
