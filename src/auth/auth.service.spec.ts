import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

function otp(id: string, code: string, createdAt: Date) {
  return {
    id,
    email: "person@example.com",
    purpose: "LOGIN",
    codeHash: createHash("sha256").update(code).digest("hex"),
    attempts: 0,
    createdAt,
  };
}

function serviceWith(otps: any[]) {
  const calls: any[] = [];
  const db = {
    otpCode: {
      findMany: async () => otps,
      updateMany: async (args: any) => {
        calls.push(args);
      },
      update: async (args: any) => {
        calls.push(args);
      },
    },
    session: { create: async () => undefined },
    user: {
      findUnique: async () => ({
        id: "u1",
        email: "person@example.com",
        role: "ADMIN",
        isActive: true,
      }),
      update: async () => undefined,
    },
  };
  const jwt = { signAsync: async () => "access-token" };
  return {
    auth: new AuthService(db as any, {} as any, jwt as any, {} as any),
    calls,
  };
}

test("OTP verification accepts the matching unexpired code when delivery order differs from request order", async () => {
  const otps = [
    otp("newest", "654321", new Date()),
    otp("delayed-email", "123456", new Date(Date.now() - 30_000)),
  ];
  const { auth, calls } = serviceWith(otps);
  const result = await auth.verifyOtp(
    " Person@Example.com ",
    "123456",
    "LOGIN",
  );
  assert.equal(result.accessToken, "access-token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.email, "person@example.com");
});

test("OTP request and verification reject malformed input before touching storage", async () => {
  const fail = async () => {
    throw new Error("storage must not be touched");
  };
  const db = {
    otpCode: { findMany: fail, create: fail },
    user: { findUnique: fail },
  };
  const redis = { client: { exists: fail } };
  const auth = new AuthService(db as any, redis as any, {} as any, {} as any);
  await assert.rejects(
    auth.requestEmailOtp("bad", "LOGIN"),
    BadRequestException,
  );
  await assert.rejects(
    auth.verifyOtp("person@example.com", "abc123", "LOGIN"),
    BadRequestException,
  );
});

test("failed OTP attempts increment the newest active code", async () => {
  const { auth, calls } = serviceWith([otp("newest", "654321", new Date())]);
  await assert.rejects(
    auth.verifyOtp("person@example.com", "000000", "LOGIN"),
    UnauthorizedException,
  );
  assert.deepEqual(calls[0], {
    where: { id: "newest" },
    data: { attempts: { increment: 1 } },
  });
});

test("requested OTP expires in ten minutes and starts a 60-second resend cooldown", async () => {
  let createdOtp: any;
  const loggedMessages: string[] = [];
  const db = {
    user: { findUnique: async () => null },
    otpCode: {
      create: async ({ data }: any) => {
        createdOtp = data;
        return { id: "otp-1" };
      },
      update: async () => undefined,
    },
  };
  const redis = {
    client: { set: async () => "OK" },
    deleteIfValueMatches: async () => undefined,
  };
  const notifications = { sendOtpEmail: async () => ({ id: "otp-otp-1" }) };
  const auth = new AuthService(
    db as any,
    redis as any,
    {} as any,
    notifications as any,
  );
  (auth as any).logger = {
    log: (message: string) => loggedMessages.push(message),
  };
  const before = Date.now();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  let result: Awaited<ReturnType<typeof auth.requestEmailOtp>>;
  try {
    result = await auth.requestEmailOtp(" Person@Example.com ", "LOGIN");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  const expiryMs = createdOtp.expiresAt.getTime() - Date.now();
  assert.ok(
    expiryMs <= 600_000 && expiryMs > 599_000,
    `expected a ten-minute expiry, got ${expiryMs}ms remaining (start ${before})`,
  );
  assert.equal(createdOtp.email, "person@example.com");
  assert.equal(result.resendAfterSeconds, 60);
  assert.ok(result.devCode);
  assert.match(result.devCode, /^\d{6}$/);
  assert.equal(loggedMessages.length, 1);
  assert.match(loggedMessages[0], /"event":"otp\.email\.accepted"/);
  assert.doesNotMatch(loggedMessages[0], new RegExp(result.devCode));
  assert.doesNotMatch(loggedMessages[0], /person@example\.com/);
});

test("concurrent OTP requests reuse the accepted request instead of queuing another code", async () => {
  let queuedEmails = 0;
  const expiresAt = new Date(Date.now() + 500_000);
  const auth = new AuthService(
    {
      otpCode: { findFirst: async () => ({ id: "otp-1", expiresAt }) },
      notificationLog: { findUnique: async () => ({ status: "SENT" }) },
    } as any,
    {
      client: {
        set: async () => null,
        get: async () => "sent:otp-1",
        ttl: async () => 42,
      },
    } as any,
    {} as any,
    { sendOtpEmail: async () => { queuedEmails += 1; } } as any,
  );

  const result = await auth.requestEmailOtp("person@example.com", "LOGIN");
  assert.deepEqual(result, {
    queued: false,
    sent: true,
    retryAfterSeconds: 42,
    expiresAt: expiresAt.toISOString(),
    resendAfterSeconds: 42,
  });
  assert.equal(queuedEmails, 0);
});

test("failed email enqueue consumes its OTP and releases only its cooldown reservation", async () => {
  let consumedOtp = false;
  let releasedKey = "";
  let releasedValue = "";
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  const auth = new AuthService(
    {
      user: { findUnique: async () => null },
      otpCode: {
        create: async () => ({ id: "otp-failed" }),
        update: async ({ data }: any) => { consumedOtp = data.consumedAt instanceof Date; },
      },
    } as any,
    {
      client: { set: async () => "OK" },
      deleteIfValueMatches: async (key: string, value: string) => {
        releasedKey = key;
        releasedValue = value;
      },
    } as any,
    {} as any,
    { sendOtpEmail: async () => { throw new Error("SMTP unavailable"); } } as any,
  );
  try {
    await assert.rejects(
      auth.requestEmailOtp("person@example.com", "LOGIN"),
      /SMTP unavailable/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  assert.equal(consumedOtp, true);
  assert.match(releasedKey, /^otp:cooldown:LOGIN:/);
  assert.match(releasedValue, /^pending:/);
});

test("OTP login token is accepted by the authenticated profile guard", async () => {
  const code = "456789";
  const db = {
    otpCode: {
      findMany: async () => [otp("otp-1", code, new Date())],
      updateMany: async () => undefined,
    },
    session: { create: async () => undefined },
    user: {
      findUnique: async () => ({
        id: "u1",
        email: "person@example.com",
        role: "ADMIN",
        isActive: true,
      }),
      update: async () => undefined,
    },
  };
  const jwt = new JwtService({ secret: "auth-round-trip-test-secret" });
  const auth = new AuthService(db as any, {} as any, jwt, {} as any);
  const { accessToken } = await auth.verifyOtp(
    "person@example.com",
    code,
    "LOGIN",
  );
  const request: {
    headers: { authorization?: string };
    user?: { sub: string; email?: string; role?: string };
  } = { headers: { authorization: `Bearer ${accessToken}` } };
  const guard = new AuthGuard(jwt, db as any);
  assert.equal(
    await guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as any),
    true,
  );
  assert.equal(request.user?.role, "ADMIN");
});

test("refresh rotates its opaque token and extends the session by 30 days", async () => {
  let updatedSession: any;
  const db = {
    session: {
      findFirst: async () => ({ id: "session-1", userId: "u1" }),
      updateMany: async (args: any) => {
        updatedSession = args;
        return { count: 1 };
      },
    },
    user: {
      findUnique: async () => ({
        id: "u1",
        email: "person@example.com",
        role: "ADMIN",
        isActive: true,
      }),
    },
  };
  const auth = new AuthService(db as any, {} as any, {
    signAsync: async () => "new-access-token",
  } as any, {} as any);
  const before = Date.now();
  const result = await auth.refreshSession("old-refresh-token");
  assert.equal(result.accessToken, "new-access-token");
  assert.notEqual(result.refreshToken, "old-refresh-token");
  assert.equal(updatedSession.where.id, "session-1");
  assert.equal(updatedSession.data.refreshTokenHash.length, 64);
  assert.ok(updatedSession.data.expiresAt.getTime() - before > 29 * 24 * 60 * 60 * 1000);
});

test("refresh rejects revoked or unknown sessions", async () => {
  const auth = new AuthService({
    session: { findFirst: async () => null },
  } as any, {} as any, {} as any, {} as any);
  await assert.rejects(auth.refreshSession("invalid"), UnauthorizedException);
});

test("concurrent refresh attempts rotate a session only once", async () => {
  let currentHash = createHash("sha256").update("shared-refresh").digest("hex");
  const auth = new AuthService(
    {
      session: {
        findFirst: async () => ({ id: "session-1", userId: "u1" }),
        updateMany: async ({ where, data }: any) => {
          if (where.refreshTokenHash !== currentHash) return { count: 0 };
          currentHash = data.refreshTokenHash;
          return { count: 1 };
        },
      },
      user: {
        findUnique: async () => ({
          id: "u1",
          email: "person@example.com",
          role: "USER",
          isActive: true,
        }),
      },
    } as any,
    {} as any,
    { signAsync: async () => "new-access-token" } as any,
    {} as any,
  );
  const results = await Promise.allSettled([
    auth.refreshSession("shared-refresh"),
    auth.refreshSession("shared-refresh"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("logout revokes the stored refresh-token hash without storing the raw token", async () => {
  let update: any;
  const auth = new AuthService(
    {
      session: {
        updateMany: async (args: any) => { update = args; },
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
  );
  await auth.revokeSession("refresh-to-revoke");
  assert.equal(
    update.where.refreshTokenHash,
    createHash("sha256").update("refresh-to-revoke").digest("hex"),
  );
  assert.equal(JSON.stringify(update).includes("refresh-to-revoke"), false);
});
