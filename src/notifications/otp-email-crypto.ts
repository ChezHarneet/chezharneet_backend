import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedOtp {
  iv: string;
  tag: string;
  ciphertext: string;
}

export function assertOtpEmailEncryptionKey(): void {
  encryptionKey();
}

function encryptionKey(): Buffer {
  const configured = process.env.OTP_EMAIL_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error("OTP_EMAIL_ENCRYPTION_KEY must be configured for email delivery");
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32 || key.toString("base64") !== configured) {
    throw new Error("OTP_EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
}

export function encryptOtp(code: string): EncryptedOtp {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptOtp(payload: EncryptedOtp): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
