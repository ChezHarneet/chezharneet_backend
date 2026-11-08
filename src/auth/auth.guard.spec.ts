import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";

function contextFor(request: {
  headers: { authorization?: string };
  user?: unknown;
}) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

function guardFor(
  account: unknown,
  verify: () => Promise<unknown> = async () => ({
    sub: "u1",
    role: "SUPER_ADMIN",
  }),
) {
  const jwt = { verifyAsync: verify };
  const db = { user: { findUnique: async () => account } };
  return new AuthGuard(jwt as any, db as any);
}

test("auth guard uses the current database role and email from the account", async () => {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization: "Bearer valid" },
  };
  const guard = guardFor({
    id: "u1",
    email: "user@example.com",
    role: "USER",
    isActive: true,
  });
  assert.equal(await guard.canActivate(contextFor(request)), true);
  assert.deepEqual(request.user, {
    sub: "u1",
    email: "user@example.com",
    role: "USER",
  });
});

test("auth guard rejects deleted and inactive accounts", async () => {
  await assert.rejects(
    guardFor(null).canActivate(
      contextFor({ headers: { authorization: "Bearer valid" } }),
    ),
    UnauthorizedException,
  );
  await assert.rejects(
    guardFor({
      id: "u1",
      email: "user@example.com",
      role: "USER",
      isActive: false,
    }).canActivate(contextFor({ headers: { authorization: "Bearer valid" } })),
    UnauthorizedException,
  );
});

test("auth guard does not translate database failures into invalid-token responses", async () => {
  const failure = new Error("database unavailable");
  const guard = new AuthGuard(
    { verifyAsync: async () => ({ sub: "u1" }) } as any,
    {
      user: {
        findUnique: async () => {
          throw failure;
        },
      },
    } as any,
  );
  await assert.rejects(
    guard.canActivate(
      contextFor({ headers: { authorization: "Bearer valid" } }),
    ),
    failure,
  );
});
