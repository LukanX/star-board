import { getPublicEnv } from "@/lib/env";

export function getPublicAppOrigin(fallbackOrigin: string) {
  const configuredUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  return new URL(configuredUrl ?? fallbackOrigin).origin;
}

export function getPasswordResetRedirect(fallbackOrigin: string) {
  return `${getPublicAppOrigin(fallbackOrigin)}/auth/callback?next=/login/reset-password`;
}