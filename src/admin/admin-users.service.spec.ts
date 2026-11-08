import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "crypto";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { ROLES_KEY } from "../auth/roles.decorator";

test("only SUPER_ADMIN may invite teammates", () => {
  assert.deepEqual(
    Reflect.getMetadata(ROLES_KEY, AdminUsersController.prototype.invite),
    [Role.SUPER_ADMIN],
  );
});

test("admin invitation normalizes email, stores only a hash, and queues a 24-hour link", async () => {
  let savedInvite: any;
  let sentEmail: any;
  const db = {
    user: { findUnique: async () => null },
    adminInvite: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        savedInvite = data;
        return {
          id: "invite-1",
          email: data.email,
          firstName: data.firstName,
          expiresAt: data.expiresAt,
        };
      },
    },
  };
  const notifications = {
    emailAdminInvite: async (...args: any[]) => {
      sentEmail = args;
    },
  };
  const service = new AdminUsersService(db as any, notifications as any);
  const previousWebUrl = process.env.WEB_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.WEB_URL = "http://localhost:3000";
  process.env.NODE_ENV = "test";
  let result: Awaited<ReturnType<typeof service.inviteAdmin>>;
  try {
    result = await service.inviteAdmin(
      " Teammate@Example.com ",
      "Alex",
      "Martin",
      "admin-1",
    );
  } finally {
    if (previousWebUrl === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = previousWebUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  assert.equal(result.email, "teammate@example.com");
  assert.equal(savedInvite.email, "teammate@example.com");
  assert.equal(savedInvite.tokenHash.length, 64);
  assert.equal(savedInvite.invitedById, "admin-1");
  assert.ok(savedInvite.expiresAt.getTime() - Date.now() <= 24 * 60 * 60 * 1000);
  assert.equal(sentEmail[0], "teammate@example.com");
  assert.match(sentEmail[2], /^http:\/\/localhost:3000\/admin-invite\?token=/);
  const rawToken = new URL(sentEmail[2]).searchParams.get("token");
  assert.ok(rawToken);
  assert.equal(
    savedInvite.tokenHash,
    createHash("sha256").update(rawToken!).digest("hex"),
  );
});

test("accepting an invitation creates an active ADMIN account and consumes the invite", async () => {
  const rawToken = "x".repeat(32);
  const invite = {
    id: "invite-1",
    email: "teammate@example.com",
    firstName: "Alex",
    lastName: "Martin",
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
  };
  let createdUser: any;
  let claimedInvite: any;
  const transaction = {
    adminInvite: {
      findUnique: async () => invite,
      updateMany: async (args: any) => {
        claimedInvite = args;
        return { count: 1 };
      },
    },
    user: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
        createdUser = data;
        return { email: data.email };
      },
    },
  };
  const db = { $transaction: async (work: (tx: any) => unknown) => work(transaction) };
  const service = new AdminUsersService(db as any, {} as any);
  const result = await service.acceptInvitation(rawToken);
  assert.equal(result.email, invite.email);
  assert.equal(createdUser.role, Role.ADMIN);
  assert.equal(createdUser.emailVerifiedAt instanceof Date, true);
  assert.equal(claimedInvite.where.id, invite.id);
  assert.ok(claimedInvite.data.acceptedAt instanceof Date);
});

test("expired invitations cannot be accepted", async () => {
  const service = new AdminUsersService({
    $transaction: async (work: (tx: any) => unknown) =>
      work({
        adminInvite: {
          findUnique: async () => ({
            id: "invite-1",
            expiresAt: new Date(Date.now() - 1000),
            acceptedAt: null,
          }),
        },
      }),
  } as any, {} as any);
  await assert.rejects(service.acceptInvitation("x".repeat(32)), ForbiddenException);
});

test("duplicate active admin invitations are rejected", async () => {
  const service = new AdminUsersService({
    user: { findUnique: async () => null },
    adminInvite: { findFirst: async () => ({ id: "pending-invite" }) },
  } as any, {} as any);
  await assert.rejects(
    service.inviteAdmin("teammate@example.com", "Alex", "Martin", "admin-1"),
    ConflictException,
  );
});
