import assert from "node:assert/strict";
import test from "node:test";
import { NotificationService } from "./notification.service";
import { decryptOtp } from "./otp-email-crypto";

test("notification queue does not open Redis during API startup", async () => {
  const redis = {
    get client(): never {
      throw new Error("Redis should not be accessed during API startup");
    },
  };
  const notifications = new NotificationService(redis as any, {} as any);

  await notifications.onModuleDestroy();
  assert.ok(notifications);
});

test("OTP jobs use an idempotent job ID and keep the code encrypted in Redis", async () => {
  const previous = process.env.OTP_EMAIL_ENCRYPTION_KEY;
  process.env.OTP_EMAIL_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  let captured: { name: string; data: any; options: any } | undefined;
  const notifications = new NotificationService({ client: {} } as any, {} as any);
  (notifications as any).queue = {
    add: async (name: string, data: any, options: any) => {
      captured = { name, data, options };
      return { id: options.jobId };
    },
    close: async () => undefined,
  };
  try {
    await notifications.emailOtp("person@example.com", "123456", "otp-1");
    assert.equal(captured?.name, "email.otp");
    assert.equal(captured?.options.jobId, "otp-otp-1");
    assert.equal(captured?.data.code, undefined);
    assert.equal(decryptOtp(captured!.data.encryptedCode), "123456");
  } finally {
    if (previous === undefined) delete process.env.OTP_EMAIL_ENCRYPTION_KEY;
    else process.env.OTP_EMAIL_ENCRYPTION_KEY = previous;
  }
});

test("OTP delivery awaits SMTP acceptance and records a stable notification ID without the code", async () => {
  const updates: any[] = [];
  const prisma = {
    notificationLog: {
      findUnique: async () => null,
      upsert: async (args: any) => updates.push(args),
      update: async (args: any) => updates.push(args),
    },
  };
  const notifications = new NotificationService({ client: {} } as any, prisma as any);
  let mailOptions: any;
  (notifications as any).createOtpTransport = () => ({
    sendMail: async (options: any) => {
      mailOptions = options;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { messageId: "provider-message-1" };
    },
    close: () => undefined,
  });

  const result = await notifications.sendOtpEmail("person@example.com", "123456", "otp-1");

  assert.equal(result.id, "otp-otp-1");
  assert.equal(result.messageId, "provider-message-1");
  assert.equal(mailOptions.messageId, "otp-otp-1@localhost");
  assert.equal(mailOptions.headers["X-OTP-Delivery-ID"], "otp-1");
  assert.equal(JSON.stringify(updates).includes("123456"), false);
  assert.equal(updates.at(-1).data.status, "SENT");
  assert.equal(updates.at(-1).data.providerMessageId, "provider-message-1");
});

test("an already-sent OTP delivery is not sent again", async () => {
  let sends = 0;
  const notifications = new NotificationService(
    { client: {} } as any,
    {
      notificationLog: {
        findUnique: async () => ({ status: "SENT", providerMessageId: "known", sentAt: new Date() }),
      },
    } as any,
  );
  (notifications as any).createOtpTransport = () => {
    sends += 1;
    throw new Error("SMTP must not be called for a sent delivery");
  };

  const result = await notifications.sendOtpEmail("person@example.com", "123456", "otp-1");
  assert.equal(result.alreadySent, true);
  assert.equal(result.messageId, "known");
  assert.equal(sends, 0);
});

test("a permanent SMTP rejection is recorded and returned as a service error", async () => {
  const updates: any[] = [];
  const notifications = new NotificationService(
    { client: {} } as any,
    {
      notificationLog: {
        findUnique: async () => null,
        upsert: async () => undefined,
        update: async (args: any) => updates.push(args),
      },
    } as any,
  );
  let attempts = 0;
  (notifications as any).createOtpTransport = () => ({
    sendMail: async () => {
      attempts += 1;
      throw Object.assign(new Error("private provider response"), { responseCode: 550 });
    },
    close: () => undefined,
  });

  await assert.rejects(
    notifications.sendOtpEmail("person@example.com", "123456", "otp-1"),
    /Could not send the verification email/,
  );
  assert.equal(attempts, 1);
  assert.equal(updates.at(-1).data.status, "FAILED");
  assert.equal(updates.at(-1).data.error, "SMTP_550");
});
