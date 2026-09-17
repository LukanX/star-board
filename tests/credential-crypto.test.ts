import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential, type CredentialEncryptionKey } from "@/lib/ai/credential-crypto";

const campaignId = "11111111-1111-4111-8111-111111111111";
const currentKey: CredentialEncryptionKey = { id: "2026-08", key: randomBytes(32) };
const previousKey: CredentialEncryptionKey = { id: "2026-07", key: randomBytes(32) };

describe("campaign credential encryption", () => {
  it("round trips a credential with authenticated metadata", () => {
    const encrypted = encryptCredential("sk-or-v1-test-key", { campaignId, key: currentKey });

    expect(encrypted).toMatchObject({ keyId: currentKey.id, keyHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(encrypted.ciphertext).not.toContain("sk-or-v1-test-key");
    expect(decryptCredential(encrypted, { campaignId, key: currentKey })).toBe("sk-or-v1-test-key");
  });

  it("uses a fresh initialization vector for every encryption", () => {
    const first = encryptCredential("same-key", { campaignId, key: currentKey });
    const second = encryptCredential("same-key", { campaignId, key: currentKey });

    expect(second.iv).not.toBe(first.iv);
    expect(second.ciphertext).not.toBe(first.ciphertext);
  });

  it("rejects ciphertext, authentication tag, and associated-data tampering", () => {
    const encrypted = encryptCredential("sk-or-v1-test-key", { campaignId, key: currentKey });

    expect(() => decryptCredential({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` }, { campaignId, key: currentKey })).toThrow("authentication failed");
    expect(() => decryptCredential({ ...encrypted, authTag: `${encrypted.authTag.slice(0, -4)}AAAA` }, { campaignId, key: currentKey })).toThrow("authentication failed");
    expect(() => decryptCredential(encrypted, { campaignId: "22222222-2222-4222-8222-222222222222", key: currentKey })).toThrow("authentication failed");
  });

  it("rejects invalid encryption key material", () => {
    expect(() => encryptCredential("sk-or-v1-test-key", { campaignId, key: { id: "bad", key: randomBytes(31) } })).toThrow("exactly 32 bytes");
    const encrypted = encryptCredential("sk-or-v1-test-key", { campaignId, key: currentKey });
    expect(() => decryptCredential(encrypted, { campaignId, key: { id: "bad", key: randomBytes(33) } })).toThrow("exactly 32 bytes");
  });

  it("can decrypt rows written with a previous key during rotation", () => {
    const encrypted = encryptCredential("sk-or-v1-test-key", { campaignId, key: previousKey });

    expect(decryptCredential(encrypted, { campaignId, key: previousKey })).toBe("sk-or-v1-test-key");
    expect(() => decryptCredential(encrypted, { campaignId, key: currentKey })).toThrow("authentication failed");
  });
});