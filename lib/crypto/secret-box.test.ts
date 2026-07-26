process.env.PASSWORD_ENCRYPTION_KEY = "test-only-key-not-a-secret";

import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./secret-box";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", () => {
    const encrypted = encryptSecret("hunter2");
    expect(encrypted).not.toContain("hunter2");
    expect(decryptSecret(encrypted)).toBe("hunter2");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-password");
    const b = encryptSecret("same-password");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-password");
    expect(decryptSecret(b)).toBe("same-password");
  });

  it("rejects a tampered ciphertext", () => {
    const encrypted = encryptSecret("hunter2");
    const [iv, tag, ciphertext] = encrypted.split(":");
    const tampered = [iv, tag, Buffer.from("tampered-data").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
