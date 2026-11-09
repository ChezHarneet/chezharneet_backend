import assert from "node:assert/strict";
import test from "node:test";
import { decryptOtp, encryptOtp } from "./otp-email-crypto";

test("OTP queue payload is encrypted and decrypts only with its configured key", () => {
  const previous = process.env.OTP_EMAIL_ENCRYPTION_KEY;
  process.env.OTP_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const encrypted = encryptOtp("123456");
    assert.notEqual(encrypted.ciphertext, Buffer.from("123456").toString("base64"));
    assert.equal(decryptOtp(encrypted), "123456");
    process.env.OTP_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    assert.throws(() => decryptOtp(encrypted));
  } finally {
    if (previous === undefined) delete process.env.OTP_EMAIL_ENCRYPTION_KEY;
    else process.env.OTP_EMAIL_ENCRYPTION_KEY = previous;
  }
});

test("OTP queue encryption rejects missing or malformed keys", () => {
  const previous = process.env.OTP_EMAIL_ENCRYPTION_KEY;
  delete process.env.OTP_EMAIL_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptOtp("123456"), /must be configured/);
    process.env.OTP_EMAIL_ENCRYPTION_KEY = "not-a-key";
    assert.throws(() => encryptOtp("123456"), /32-byte key/);
  } finally {
    if (previous === undefined) delete process.env.OTP_EMAIL_ENCRYPTION_KEY;
    else process.env.OTP_EMAIL_ENCRYPTION_KEY = previous;
  }
});
