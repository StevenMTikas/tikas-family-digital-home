// MVP-level at-rest encryption. Originally built for Password Entries (see
// Family_Knowledge.md: "encrypted whenever possible... no separate, stronger
// encryption scheme yet... explicitly flagged as not sufficient for anything
// beyond this single family's private use") and reused for Backup archives
// (Backup.md: "encrypted whenever possible") — same baseline, same caveat:
// AES-256-GCM with a server-held key, not a dedicated secrets-management
// solution. Hardening this (KMS, per-entry keys, etc.) is flagged as required
// before any release beyond this one household.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

// Each caller gets its own derived key (different scrypt salt) from its own
// env var, so a leaked backup key doesn't also expose password entries.
export type SecretBoxContext = "password" | "backup";

// Password context's salt is unchanged from the original single-purpose
// version of this module — changing it would silently break decryption of
// every password entry already encrypted under it.
const SCRYPT_SALT: Record<SecretBoxContext, string> = {
  password: "tikas-family-knowledge",
  backup: "tikas-family-knowledge:backup",
};

function getKey(context: SecretBoxContext): Buffer {
  const envVar = context === "backup" ? "BACKUP_ENCRYPTION_KEY" : "PASSWORD_ENCRYPTION_KEY";
  const secret = process.env[envVar];
  if (!secret) throw new Error(`${envVar} is not set — see .env.example`);
  return scryptSync(secret, SCRYPT_SALT[context], 32);
}

/** Encrypts plaintext into a single "iv:authTag:ciphertext" base64 string for storage. Format unchanged from the original password-only version. */
export function encryptSecret(plaintext: string, context: SecretBoxContext = "password"): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(context), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Inverse of encryptSecret. */
export function decryptSecret(stored: string, context: SecretBoxContext = "password"): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Malformed encrypted value.");

  const decipher = createDecipheriv(ALGORITHM, getKey(context), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Buffer-oriented variant for larger binary payloads (backup archives) — packs iv/authTag/ciphertext into one Buffer rather than a delimited string. */
export function encryptBuffer(plaintext: Buffer, context: SecretBoxContext): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(context), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

/** Inverse of encryptBuffer. */
export function decryptBuffer(stored: Buffer, context: SecretBoxContext): Buffer {
  const iv = stored.subarray(0, IV_LENGTH);
  const authTag = stored.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = stored.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, getKey(context), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
