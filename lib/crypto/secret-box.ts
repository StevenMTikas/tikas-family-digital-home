// MVP-level at-rest encryption for Password Entries. See Family_Knowledge.md:
// "encrypted whenever possible... no separate, stronger encryption scheme
// yet... explicitly flagged as not sufficient for anything beyond this
// single family's private use" — this is exactly that baseline: AES-256-GCM
// with a server-held key, not a dedicated secrets-management solution.
// Hardening this (KMS, per-entry keys, etc.) is flagged there as required
// before any release beyond this one household.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const secret = process.env.PASSWORD_ENCRYPTION_KEY;
  if (!secret) throw new Error("PASSWORD_ENCRYPTION_KEY is not set — see .env.example");
  return scryptSync(secret, "tikas-family-knowledge", 32);
}

/** Encrypts plaintext into a single "iv:authTag:ciphertext" base64 string for storage. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Inverse of encryptSecret. */
export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted value.");

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
