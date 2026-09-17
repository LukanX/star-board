import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const ivLength = 12;
const authTagLength = 16;
const associatedDataVersion = "v1";

export type CredentialEncryptionKey = {
  id: string;
  key: Uint8Array;
};

export type EncryptedCredential = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
  keyHash: string;
};

export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

function assertKeyId(keyId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId)) {
    throw new CredentialCryptoError("Credential encryption key ID is invalid.");
  }
}

function assertKey(key: Uint8Array) {
  if (key.byteLength !== 32) {
    throw new CredentialCryptoError("Credential encryption key must be exactly 32 bytes.");
  }
}

function assertAssociatedDataPart(value: string, label: string) {
  if (!value || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CredentialCryptoError(`Credential ${label} is invalid.`);
  }
}

function associatedData(campaignId: string, provider: string) {
  assertAssociatedDataPart(campaignId, "campaign");
  assertAssociatedDataPart(provider, "provider");
  return Buffer.from(`star-board:${associatedDataVersion}:${campaignId}:${provider}`, "utf8");
}

function decodeBase64(value: string, label: string, expectedLength?: number) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new CredentialCryptoError(`Credential ${label} is invalid.`);
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new CredentialCryptoError(`Credential ${label} is invalid.`);
  }

  return decoded;
}

export function hashCredential(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encryptCredential(value: string, options: { campaignId: string; provider?: string; key: CredentialEncryptionKey }): EncryptedCredential {
  if (!value) throw new CredentialCryptoError("Credential value is empty.");

  assertKey(options.key.key);
  assertKeyId(options.key.id);
  const provider = options.provider ?? "openrouter";
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, options.key.key, iv);
  cipher.setAAD(associatedData(options.campaignId, provider));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(value, "utf8")), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId: options.key.id,
    keyHash: hashCredential(value),
  };
}

export function decryptCredential(record: EncryptedCredential, options: { campaignId: string; provider?: string; key: CredentialEncryptionKey }): string {
  assertKey(options.key.key);
  assertKeyId(options.key.id);

  try {
    const provider = options.provider ?? "openrouter";
    const iv = decodeBase64(record.iv, "initialization vector", ivLength);
    const authTag = decodeBase64(record.authTag, "authentication tag", authTagLength);
    const ciphertext = decodeBase64(record.ciphertext, "ciphertext");
    const decipher = createDecipheriv(algorithm, options.key.key, iv);
    decipher.setAAD(associatedData(options.campaignId, provider));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

    if (!plaintext || hashCredential(plaintext) !== record.keyHash) {
      throw new CredentialCryptoError("Credential authentication failed.");
    }

    return plaintext;
  } catch (error) {
    throw new CredentialCryptoError("Credential authentication failed.");
  }
}

export function parseCredentialEncryptionKeyring(serializedKeyring: string, activeKeyId: string) {
  assertKeyId(activeKeyId);

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeyring);
  } catch {
    throw new CredentialCryptoError("Credential encryption keyring is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CredentialCryptoError("Credential encryption keyring is invalid.");
  }

  const keyring = new Map<string, CredentialEncryptionKey>();
  for (const [id, encodedKey] of Object.entries(parsed)) {
    try {
      assertKeyId(id);
      if (typeof encodedKey !== "string") throw new CredentialCryptoError("Credential encryption keyring is invalid.");
      keyring.set(id, { id, key: decodeBase64(encodedKey, "encryption key", 32) });
    } catch (error) {
      if (error instanceof CredentialCryptoError) {
        throw new CredentialCryptoError("Credential encryption keyring is invalid.");
      }
      throw error;
    }
  }

  const activeKey = keyring.get(activeKeyId);
  if (!activeKey) throw new CredentialCryptoError("Active credential encryption key is not in the keyring.");

  return { activeKey, keyring };
}