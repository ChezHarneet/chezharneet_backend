import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { test } from "node:test";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../common/prisma.service";
import { OptionalAuthGuard } from "./optional-auth.guard";

function contextFor(request: {
  headers: { authorization?: string };
  user?: { sub: string; email: string; role: string };
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

test("optional auth allows public requests without a token", async () => {
  const guard = new OptionalAuthGuard(
    { verifyAsync: async () => { throw new Error("Unexpected token check"); } } as unknown as JwtService,
    { user: { findUnique: async () => { throw new Error("Unexpected database lookup"); } } } as unknown as PrismaService,
  );

  assert.equal(await guard.canActivate(contextFor({ headers: {} })), true);
});

test("optional auth rejects invalid tokens", async () => {
  const guard = new OptionalAuthGuard(
    { verifyAsync: async () => { throw new Error("Bad token"); } } as unknown as JwtService,
    { user: { findUnique: async () => null } } as unknown as PrismaService,
  );

  await assert.rejects(
    guard.canActivate(
      contextFor({ headers: { authorization: "Bearer invalid" } }),
    ),
    UnauthorizedException,
  );
});

test("optional auth does not disguise database failures as invalid tokens", async () => {
  const databaseError = new Error("Database unavailable");
  const guard = new OptionalAuthGuard(
    {
      verifyAsync: async () => ({
        sub: "user-1",
        email: "learner@example.com",
        role: "USER",
      }),
    } as unknown as JwtService,
    {
      user: {
        findUnique: async () => {
          throw databaseError;
        },
      },
    } as unknown as PrismaService,
  );

  await assert.rejects(
    guard.canActivate(
      contextFor({ headers: { authorization: "Bearer valid" } }),
    ),
    (error) => error === databaseError,
  );
});
