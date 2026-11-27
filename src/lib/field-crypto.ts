import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Field-level encryption for sensitive personal data (Iqama and passport numbers).
 * AES-256-GCM with a random IV per value. Format: "v1:<iv>:<tag>:<ciphertext>" (base64url),
 * the version prefix allows key rotation later. The key never leaves the server.
 */
const VERSION = "v1";

let keys: { enc: Buffer; index: Buffer } | undefined;

function getKeys() {
  if (keys) return keys;
  const raw = env().FIELD_ENCRYPTION_KEY;
  const master = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (master.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 32 random bytes in base64. Generate one with: openssl rand -base64 32");
  }
  // Separate keys for encryption and for the search index, derived from one secret.
  keys = {
    enc: Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), "nealabs:field-encryption", 32)),
    index: Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), "nealabs:blind-index", 32)),
  };
  return keys;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKeys().enc, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptField(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unsupported encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", getKeys().enc, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * Keyed hash for exact-match lookups and uniqueness without storing the value.
 * Scoped per organization so the same number cannot be correlated across companies.
 */
export function blindIndex(organizationId: string, value: string): string {
  return createHmac("sha256", getKeys().index).update(`${organizationId}:${value}`).digest("base64url");
}
