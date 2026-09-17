import type { SupabaseClient } from "@supabase/supabase-js";
import { CredentialCryptoError, decryptCredential, encryptCredential, parseCredentialEncryptionKeyring, type CredentialEncryptionKey, type EncryptedCredential } from "@/lib/ai/credential-crypto";
import { getServerEnv } from "@/lib/env";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getOpenRouterKeySettingsUrlFromHash } from "@/lib/ai/openrouter-oauth";

const provider = "openrouter";

type StoredCredential = {
  campaign_id: string;
  ciphertext: string;
  initialization_vector: string;
  authentication_tag: string;
  encryption_key_id: string;
  key_hash: string;
  key_label: string;
  key_limit_usd: number | string | null;
  key_remaining_usd: number | string | null;
  key_usage_usd: number | string;
  is_unlimited: boolean;
  verification_status: "verified" | "invalid" | "error";
  verification_error: string | null;
  connected_by: string | null;
  connected_at: string;
  last_verified_at: string | null;
  allow_player_ai: boolean;
  updated_at: string;
};

export type CampaignCredentialStatus = {
  connected: boolean;
  verificationStatus: StoredCredential["verification_status"] | "disconnected";
  label: string | null;
  limitUsd: number | null;
  remainingUsd: number | null;
  usageUsd: number;
  unlimited: boolean;
  connectedBy: string | null;
  connectedByName: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  verificationError: string | null;
  allowPlayerAi: boolean;
  canManage: boolean;
  canUse: boolean;
  ownerSettingsUrl: string | null;
};

export type CampaignCredential = {
  apiKey: string;
  status: CampaignCredentialStatus;
};

export type CampaignCredentialMetadata = {
  label: string;
  limitUsd: number | null;
  remainingUsd: number | null;
  usageUsd: number;
  unlimited: boolean;
  verificationStatus: StoredCredential["verification_status"];
  verificationError?: string | null;
  lastVerifiedAt?: string | null;
};

export class CampaignCredentialError extends Error {
  readonly code: "missing" | "invalid" | "forbidden" | "misconfigured" | "unavailable";

  constructor(code: CampaignCredentialError["code"], message: string) {
    super(message);
    this.name = "CampaignCredentialError";
    this.code = code;
  }
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: number | string | null | undefined) {
  return numberOrNull(value) ?? 0;
}

function configuration() {
  const env = getServerEnv();
  if (!env.CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS || !env.CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID) {
    throw new CampaignCredentialError("misconfigured", "Campaign AI credential encryption is not configured.");
  }

  try {
    return parseCredentialEncryptionKeyring(env.CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS, env.CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID);
  } catch {
    throw new CampaignCredentialError("misconfigured", "Campaign AI credential encryption is not configured correctly.");
  }
}

function storedCredentialProjection() {
  return "campaign_id, ciphertext, initialization_vector, authentication_tag, encryption_key_id, key_hash, key_label, key_limit_usd, key_remaining_usd, key_usage_usd, is_unlimited, verification_status, verification_error, connected_by, connected_at, last_verified_at, allow_player_ai, updated_at";
}

function toEncryptedCredential(row: StoredCredential): EncryptedCredential {
  return {
    ciphertext: row.ciphertext,
    iv: row.initialization_vector,
    authTag: row.authentication_tag,
    keyId: row.encryption_key_id,
    keyHash: row.key_hash,
  };
}

async function readStoredCredential(campaignId: string, service = getSupabaseServiceRoleClient()) {
  const { data, error } = await service
    .from("campaign_openrouter_credentials")
    .select(storedCredentialProjection())
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (error) throw new CampaignCredentialError("unavailable", "Campaign AI credentials could not be loaded.");
  return data as StoredCredential | null;
}

async function readCampaignManagerContext(supabase: SupabaseClient, campaignId: string, userId: string) {
  const [{ data: campaign, error: campaignError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("campaigns").select("created_by").eq("id", campaignId).maybeSingle(),
    supabase.from("campaign_members").select("role, display_name").eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle(),
  ]);

  if (campaignError || membershipError) throw new CampaignCredentialError("unavailable", "Campaign AI credential access could not be checked.");
  if (membership?.role !== "gm") throw new CampaignCredentialError("forbidden", "GM access is required to manage the campaign OpenRouter connection.");

  return {
    isCreator: campaign?.created_by === userId,
    displayName: membership.display_name ?? "Crew member",
  };
}

function managerCanManage(row: StoredCredential | null, userId: string, isCreator: boolean) {
  return !row || isCreator || row.connected_by === userId;
}

function toStatus(row: StoredCredential | null, options: { userId?: string; isCreator?: boolean; isManager?: boolean; isMember?: boolean; connectedByName?: string | null; ownerSettingsUrl?: string | null } = {}): CampaignCredentialStatus {
  if (!row) {
    return {
      connected: false,
      verificationStatus: "disconnected",
      label: null,
      limitUsd: null,
      remainingUsd: null,
      usageUsd: 0,
      unlimited: false,
      connectedBy: null,
      connectedByName: null,
      connectedAt: null,
      lastVerifiedAt: null,
      verificationError: null,
      allowPlayerAi: false,
      canManage: Boolean(options.isManager || options.isCreator),
      canUse: false,
      ownerSettingsUrl: null,
    };
  }

  const canManage = options.userId ? managerCanManage(row, options.userId, Boolean(options.isCreator)) : false;
  const canUse = Boolean(options.isMember && row.verification_status === "verified");

  return {
    connected: true,
    verificationStatus: row.verification_status,
    label: row.key_label || null,
    limitUsd: numberOrNull(row.key_limit_usd),
    remainingUsd: numberOrNull(row.key_remaining_usd),
    usageUsd: numberOrZero(row.key_usage_usd),
    unlimited: row.is_unlimited,
    connectedBy: row.connected_by,
    connectedByName: options.connectedByName ?? null,
    connectedAt: row.connected_at,
    lastVerifiedAt: row.last_verified_at,
    verificationError: row.verification_error,
    allowPlayerAi: row.allow_player_ai,
    canManage,
    canUse,
    ownerSettingsUrl: canManage ? options.ownerSettingsUrl ?? null : null,
  };
}

export async function getCampaignCredentialStatus(campaignId: string, options: { supabase?: SupabaseClient; userId?: string; isMember?: boolean; isCreator?: boolean; ownerSettingsUrl?: string | null } = {}) {
  const row = await readStoredCredential(campaignId);
  return toStatus(row, options);
}

export async function getCampaignCredentialStatusForManager(campaignId: string, supabase: SupabaseClient, userId: string) {
  const manager = await readCampaignManagerContext(supabase, campaignId, userId);
  const row = await readStoredCredential(campaignId);
  const canManage = managerCanManage(row, userId, manager.isCreator);
  let connectedByName: string | null = null;

  if (row?.connected_by) {
    const { data } = await supabase
      .from("campaign_members")
      .select("display_name")
      .eq("campaign_id", campaignId)
      .eq("user_id", row.connected_by)
      .maybeSingle();
    connectedByName = data?.display_name ?? null;
  }

  return {
    manager,
    status: toStatus(row, {
      userId,
      isCreator: manager.isCreator,
      isManager: true,
      isMember: true,
      connectedByName,
      ownerSettingsUrl: row && canManage ? getOpenRouterKeySettingsUrlFromHash(row.key_hash) : null,
    }),
    row,
    connectedByName,
  };
}

function decryptStoredCredential(campaignId: string, row: StoredCredential) {
  const keys = configuration();
  const encryptionKey = keys.keyring.get(row.encryption_key_id);
  if (!encryptionKey) throw new CampaignCredentialError("misconfigured", "The campaign OpenRouter key cannot be decrypted with the configured keyring.");

  let apiKey: string;
  try {
    apiKey = decryptCredential(toEncryptedCredential(row), { campaignId, provider, key: encryptionKey });
  } catch (error) {
    if (error instanceof CredentialCryptoError) {
      throw new CampaignCredentialError("invalid", "The campaign OpenRouter key could not be authenticated.");
    }
    throw error;
  }

  if (row.encryption_key_id !== keys.activeKey.id) {
    void replaceEncryptedCredential(campaignId, apiKey, row, encryptionKey, keys.activeKey).catch(() => undefined);
  }

  return apiKey;
}

export async function getCampaignCredentialForGeneration(campaignId: string, service?: SupabaseClient) {
  const row = await readStoredCredential(campaignId, service);
  if (!row) throw new CampaignCredentialError("missing", "Connect an OpenRouter key for this campaign before using AI assistance.");
  if (row.verification_status !== "verified") throw new CampaignCredentialError("invalid", "The campaign OpenRouter key needs to be reconnected before using AI assistance.");

  const apiKey = decryptStoredCredential(campaignId, row);

  return { apiKey, status: toStatus(row, { isMember: true }) } satisfies CampaignCredential;
}

export async function getCampaignCredentialForManager(campaignId: string, supabase: SupabaseClient, userId: string) {
  const manager = await readCampaignManagerContext(supabase, campaignId, userId);
  const row = await readStoredCredential(campaignId);
  const status = toStatus(row, { userId, isCreator: manager.isCreator, isManager: true, isMember: true });

  if (!row) return { row: null, status, manager };
  if (!managerCanManage(row, userId, manager.isCreator)) {
    throw new CampaignCredentialError("forbidden", "Only the connecting GM or campaign creator can manage this OpenRouter connection.");
  }

  return { row, status, manager };
}

export async function getCampaignCredentialForRefresh(campaignId: string, supabase: SupabaseClient, userId: string) {
  const access = await getCampaignCredentialForManager(campaignId, supabase, userId);
  if (!access.row) throw new CampaignCredentialError("missing", "Connect an OpenRouter key before refreshing its details.");
  return { ...access, apiKey: decryptStoredCredential(campaignId, access.row) };
}

export async function encryptCampaignCredential(campaignId: string, apiKey: string) {
  const keys = configuration();
  return { encrypted: encryptCredential(apiKey, { campaignId, provider, key: keys.activeKey }), activeKey: keys.activeKey };
}

export async function saveCampaignCredential(input: { campaignId: string; apiKey: string; connectedBy: string; metadata: CampaignCredentialMetadata; resetPlayerAccess: boolean }) {
  const service = getSupabaseServiceRoleClient();
  const { encrypted } = await encryptCampaignCredential(input.campaignId, input.apiKey);
  const { error } = await service.from("campaign_openrouter_credentials").upsert({
    campaign_id: input.campaignId,
    ciphertext: encrypted.ciphertext,
    initialization_vector: encrypted.iv,
    authentication_tag: encrypted.authTag,
    encryption_key_id: encrypted.keyId,
    key_hash: encrypted.keyHash,
    key_label: input.metadata.label,
    key_limit_usd: input.metadata.limitUsd,
    key_remaining_usd: input.metadata.remainingUsd,
    key_usage_usd: input.metadata.usageUsd,
    is_unlimited: input.metadata.unlimited,
    verification_status: input.metadata.verificationStatus,
    verification_error: input.metadata.verificationError ?? null,
    connected_by: input.connectedBy,
    connected_at: new Date().toISOString(),
    last_verified_at: input.metadata.lastVerifiedAt ?? new Date().toISOString(),
    ...(input.resetPlayerAccess ? { allow_player_ai: false } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "campaign_id" });

  if (error) throw new CampaignCredentialError("unavailable", "Campaign OpenRouter credentials could not be saved.");
}

async function replaceEncryptedCredential(campaignId: string, apiKey: string, row: StoredCredential, encryptionKey: CredentialEncryptionKey, activeKey: CredentialEncryptionKey) {
  if (encryptionKey.id === activeKey.id) return;
  const encrypted = encryptCredential(apiKey, { campaignId, provider, key: activeKey });
  const service = getSupabaseServiceRoleClient();
  const { error } = await service.from("campaign_openrouter_credentials").update({
    ciphertext: encrypted.ciphertext,
    initialization_vector: encrypted.iv,
    authentication_tag: encrypted.authTag,
    encryption_key_id: encrypted.keyId,
    key_hash: encrypted.keyHash,
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", row.campaign_id).eq("encryption_key_id", row.encryption_key_id);
  if (error) return;
}

export async function updateCampaignCredentialMetadata(campaignId: string, metadata: CampaignCredentialMetadata) {
  const { error } = await getSupabaseServiceRoleClient().from("campaign_openrouter_credentials").update({
    key_label: metadata.label,
    key_limit_usd: metadata.limitUsd,
    key_remaining_usd: metadata.remainingUsd,
    key_usage_usd: metadata.usageUsd,
    is_unlimited: metadata.unlimited,
    verification_status: metadata.verificationStatus,
    verification_error: metadata.verificationError ?? null,
    last_verified_at: metadata.lastVerifiedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", campaignId);

  if (error) throw new CampaignCredentialError("unavailable", "Campaign OpenRouter details could not be updated.");
}

export async function markCampaignCredentialInvalid(campaignId: string, message: string) {
  const { error } = await getSupabaseServiceRoleClient().from("campaign_openrouter_credentials").update({
    verification_status: "invalid",
    verification_error: message.slice(0, 500),
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", campaignId);

  if (error) throw new CampaignCredentialError("unavailable", "Campaign OpenRouter details could not be updated.");
}

export async function setCampaignPlayerAi(campaignId: string, supabase: SupabaseClient, userId: string, allowPlayerAi: boolean) {
  const access = await getCampaignCredentialForManager(campaignId, supabase, userId);
  if (!access.row) throw new CampaignCredentialError("missing", "Connect an OpenRouter key before enabling player AI assistance.");
  if (access.row.verification_status !== "verified") throw new CampaignCredentialError("invalid", "Reconnect the campaign OpenRouter key before enabling player AI assistance.");

  const { error } = await getSupabaseServiceRoleClient().from("campaign_openrouter_credentials").update({ allow_player_ai: allowPlayerAi, updated_at: new Date().toISOString() }).eq("campaign_id", campaignId);
  if (error) throw new CampaignCredentialError("unavailable", "Player AI access could not be updated.");
}

export async function disconnectCampaignCredential(campaignId: string, supabase: SupabaseClient, userId: string) {
  const access = await getCampaignCredentialForManager(campaignId, supabase, userId);
  if (!access.row) return;

  const { error } = await getSupabaseServiceRoleClient().from("campaign_openrouter_credentials").delete().eq("campaign_id", campaignId);
  if (error) throw new CampaignCredentialError("unavailable", "Campaign OpenRouter credentials could not be disconnected.");
}