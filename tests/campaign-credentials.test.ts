import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptCredential, hashCredential, type EncryptedCredential } from "@/lib/ai/credential-crypto";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  getSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/supabase/service", () => ({ getSupabaseServiceRoleClient: mocks.getSupabaseServiceRoleClient }));

import {
  CampaignCredentialError,
  disconnectCampaignCredential,
  getCampaignCredentialForGeneration,
  getCampaignCredentialForManager,
  getCampaignCredentialStatusForManager,
  saveCampaignCredential,
  setCampaignPlayerAi,
} from "@/lib/ai/campaign-credentials";

const campaignId = "00000000-0000-4000-8000-000000000001";
const creatorId = "00000000-0000-4000-8000-000000000002";
const connectorId = "00000000-0000-4000-8000-000000000003";
const secondaryGmId = "00000000-0000-4000-8000-000000000004";
const encryptionKey = { id: "active-key", key: new Uint8Array(32).fill(7) };
const apiKey = "sk-or-v1-campaign-secret";

function createQuery(result: { data?: unknown; error?: { message: string } | null } = { data: null, error: null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    upsert: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
    delete: vi.fn(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  return query;
}

function createStoredRow(overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: campaignId,
    ciphertext: "ciphertext",
    initialization_vector: "initialization-vector",
    authentication_tag: "authentication-tag",
    encryption_key_id: encryptionKey.id,
    key_hash: "a".repeat(64),
    key_label: "Star Board campaign key",
    key_limit_usd: 10,
    key_remaining_usd: 8,
    key_usage_usd: 2,
    is_unlimited: false,
    verification_status: "verified" as const,
    verification_error: null,
    connected_by: connectorId,
    connected_at: "2026-08-28T12:00:00.000Z",
    last_verified_at: "2026-08-28T12:00:00.000Z",
    allow_player_ai: true,
    updated_at: "2026-08-28T12:00:00.000Z",
    ...overrides,
  };
}

function createManagerSupabase(options: {
  row?: Record<string, unknown> | null;
  currentUserId: string;
  campaignCreatorId?: string;
  role?: "gm" | "player";
  currentDisplayName?: string;
  connectedByName?: string;
}) {
  const campaignQuery = createQuery({ data: { created_by: options.campaignCreatorId ?? creatorId }, error: null });
  const memberQueries = [
    createQuery({ data: { role: options.role ?? "gm", display_name: options.currentDisplayName ?? "Crew member" }, error: null }),
    createQuery({ data: { display_name: options.connectedByName ?? "Connector" }, error: null }),
  ];
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "campaigns") return campaignQuery;
      return memberQueries.shift() ?? createQuery({ data: null, error: null });
    }),
  };
  const credentialQuery = createQuery({ data: options.row ?? null, error: null });
  const service = { from: vi.fn(() => credentialQuery) };
  mocks.getSupabaseServiceRoleClient.mockReturnValue(service);
  return { supabase, service, campaignQuery, credentialQuery };
}

function encryptedFields(value = apiKey): EncryptedCredential {
  return encryptCredential(value, { campaignId, provider: "openrouter", key: encryptionKey });
}

describe("campaign credential repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      CAMPAIGN_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ [encryptionKey.id]: Buffer.from(encryptionKey.key).toString("base64") }),
      CAMPAIGN_CREDENTIAL_ACTIVE_KEY_ID: encryptionKey.id,
    });
  });

  it("returns a safe manager status DTO with ownership metadata but no credential material", async () => {
    const row = createStoredRow();
    const { supabase } = createManagerSupabase({ row, currentUserId: connectorId, connectedByName: "Nova" });

    const result = await getCampaignCredentialStatusForManager(campaignId, supabase as never, connectorId);

    expect(result.status).toMatchObject({
      connected: true,
      connectedBy: connectorId,
      connectedByName: "Nova",
      canManage: true,
      canUse: true,
      ownerSettingsUrl: `https://openrouter.ai/keys/${row.key_hash}`,
    });
    expect(result.status).not.toHaveProperty("apiKey");
    expect(result.status).not.toHaveProperty("ciphertext");
    expect(JSON.stringify(result.status)).not.toContain(apiKey);
  });

  it("allows only the connector or campaign creator to manage an existing connection", async () => {
    const row = createStoredRow();
    const secondary = createManagerSupabase({ row, currentUserId: secondaryGmId });

    await expect(getCampaignCredentialForManager(campaignId, secondary.supabase as never, secondaryGmId))
      .rejects.toMatchObject({ code: "forbidden" });

    const secondaryStatusContext = createManagerSupabase({ row, currentUserId: secondaryGmId });
    const secondaryStatus = await getCampaignCredentialStatusForManager(campaignId, secondaryStatusContext.supabase as never, secondaryGmId);
    expect(secondaryStatus.status.canManage).toBe(false);
    expect(secondaryStatus.status.ownerSettingsUrl).toBeNull();

    const creator = createManagerSupabase({ row, currentUserId: creatorId });
    const creatorAccess = await getCampaignCredentialForManager(campaignId, creator.supabase as never, creatorId);
    expect(creatorAccess.status.canManage).toBe(true);
  });

  it("lets the campaign creator disconnect a connection owned by another GM", async () => {
    const { supabase, credentialQuery } = createManagerSupabase({ row: createStoredRow(), currentUserId: creatorId });

    await disconnectCampaignCredential(campaignId, supabase as never, creatorId);

    expect(credentialQuery.delete).toHaveBeenCalledOnce();
    expect(credentialQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });

  it("encrypts saved keys and resets player access when reconnecting", async () => {
    const { credentialQuery } = createManagerSupabase({ row: null, currentUserId: creatorId });

    await saveCampaignCredential({
      campaignId,
      apiKey,
      connectedBy: creatorId,
      metadata: {
        label: "Campaign key",
        limitUsd: 20,
        remainingUsd: 19,
        usageUsd: 1,
        unlimited: false,
        verificationStatus: "verified",
      },
      resetPlayerAccess: true,
    });

    const [payload] = credentialQuery.upsert.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({
      campaign_id: campaignId,
      connected_by: creatorId,
      allow_player_ai: false,
      encryption_key_id: encryptionKey.id,
      key_hash: hashCredential(apiKey),
    });
    expect(payload.ciphertext).not.toBe(apiKey);
    expect(JSON.stringify(payload)).not.toContain(apiKey);
  });

  it("decrypts only verified credentials for generation and normalizes tampering failures", async () => {
    const encrypted = encryptedFields();
    const row = createStoredRow({
      ciphertext: encrypted.ciphertext,
      initialization_vector: encrypted.iv,
      authentication_tag: encrypted.authTag,
      encryption_key_id: encrypted.keyId,
      key_hash: encrypted.keyHash,
      allow_player_ai: false,
    });
    const { service } = createManagerSupabase({ row, currentUserId: creatorId });

    const credential = await getCampaignCredentialForGeneration(campaignId, service as never);
    expect(credential.apiKey).toBe(apiKey);
    expect(credential.status).not.toHaveProperty("apiKey");

    const tamperedService = createManagerSupabase({ row: { ...row, authentication_tag: encrypted.authTag + "=" }, currentUserId: creatorId }).service;
    await expect(getCampaignCredentialForGeneration(campaignId, tamperedService as never))
      .rejects.toMatchObject({ code: "invalid", message: "The campaign OpenRouter key could not be authenticated." });
    await expect(getCampaignCredentialForGeneration(campaignId, tamperedService as never))
      .rejects.not.toThrow(apiKey);
  });

  it("updates player access only for a verified manager-owned connection", async () => {
    const row = createStoredRow({ connected_by: creatorId, allow_player_ai: false });
    const { supabase, credentialQuery } = createManagerSupabase({ row, currentUserId: creatorId });

    await setCampaignPlayerAi(campaignId, supabase as never, creatorId, true);

    expect(credentialQuery.update).toHaveBeenCalledWith(expect.objectContaining({ allow_player_ai: true, updated_at: expect.any(String) }));
    expect(credentialQuery.eq).toHaveBeenCalledWith("campaign_id", campaignId);
  });

  it("blocks player access changes for an unverified key", async () => {
    const row = createStoredRow({ connected_by: creatorId, verification_status: "invalid" });
    const { supabase, credentialQuery } = createManagerSupabase({ row, currentUserId: creatorId });

    await expect(setCampaignPlayerAi(campaignId, supabase as never, creatorId, true))
      .rejects.toMatchObject({ code: "invalid" });
    expect(credentialQuery.update).not.toHaveBeenCalled();
  });

  it("does not expose a plaintext key when the stored credential is missing", async () => {
    const { supabase, service } = createManagerSupabase({ row: null, currentUserId: creatorId });

    const result = await getCampaignCredentialStatusForManager(campaignId, supabase as never, creatorId);

    expect(result.status).toMatchObject({ connected: false, verificationStatus: "disconnected", canManage: true, canUse: false, allowPlayerAi: false });
    expect(result.status.ownerSettingsUrl).toBeNull();
    await expect(getCampaignCredentialForGeneration(campaignId, service as never)).rejects.toBeInstanceOf(CampaignCredentialError);
  });
});
