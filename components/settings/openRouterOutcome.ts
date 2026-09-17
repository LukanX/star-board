export const openRouterCallbackReasons = [
  "invalid_state",
  "authentication",
  "configuration",
  "forbidden",
  "storage",
  "missing_code",
  "provider",
  "provider_unavailable",
  "connection",
] as const;

export type OpenRouterCallbackReason = (typeof openRouterCallbackReasons)[number];

export type OpenRouterCallbackOutcome =
  | { status: "connected" }
  | { status: "cancelled" }
  | { status: "error"; reason: OpenRouterCallbackReason };

type SettingsSearchParams = Readonly<Record<string, string | string[] | undefined>>;

function singleSearchParam(searchParams: SettingsSearchParams, key: string) {
  const value = searchParams[key];
  return typeof value === "string" ? value : null;
}

export function normalizeOpenRouterCallbackOutcome(searchParams: SettingsSearchParams): OpenRouterCallbackOutcome | null {
  const status = singleSearchParam(searchParams, "openrouter");

  if (status === "connected") return { status: "connected" };
  if (status === "cancelled") return { status: "cancelled" };
  if (status !== "error") return null;

  const reason = singleSearchParam(searchParams, "reason");
  return {
    status: "error",
    reason: openRouterCallbackReasons.includes(reason as OpenRouterCallbackReason) ? reason as OpenRouterCallbackReason : "connection",
  };
}