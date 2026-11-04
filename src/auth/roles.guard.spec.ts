import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, Module, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../common/prisma.service';
import { RolesGuard } from './roles.guard';

function contextFor(request: { user?: { sub?: string; role?: any; email?: string } }) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => RolesGuard.prototype.canActivate,
    getClass: () => RolesGuard,
  } as unknown as ExecutionContext;
}

function makeGuard(role: string | null, required: string[]) {
  const db = { user: { findUnique: async () => role ? { role, email: 'person@example.com', isActive: true } : null } };
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector, db as any);
}

test('roles guard authorizes using the current database role, not stale token claims', async () => {
  const request = { user: { sub: 'user-1', role: 'USER' as any } };
  assert.equal(await makeGuard('ADMIN', ['ADMIN', 'SUPER_ADMIN']).canActivate(contextFor(request)), true);
  assert.equal(request.user.role, 'ADMIN');
});

test('roles guard rejects normal users and missing accounts', async () => {
  await assert.rejects(makeGuard('USER', ['ADMIN', 'SUPER_ADMIN']).canActivate(contextFor({ user: { sub: 'user-1' } })), ForbiddenException);
  await assert.rejects(makeGuard(null, ['ADMIN']).canActivate(contextFor({ user: { sub: 'missing' } })), UnauthorizedException);
  await assert.rejects(makeGuard('ADMIN', ['ADMIN']).canActivate(contextFor({ user: {} })), UnauthorizedException);
  await assert.rejects(makeGuard('ADMIN', ['SUPER_ADMIN']).canActivate(contextFor({ user: { sub: 'admin-1' } })), ForbiddenException);
});

test('Nest injects JwtService and PrismaService into both authentication guards', async () => {
  const account = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', isActive: true };
  const db = { user: { findUnique: async () => account } };
  class GuardTestModule {}
  Module({
    imports: [JwtModule.register({ secret: 'guard-injection-test-secret' })],
    providers: [AuthGuard, RolesGuard, { provide: PrismaService, useValue: db }],
  })(GuardTestModule);

  const app = await NestFactory.createApplicationContext(GuardTestModule, { logger: false });
  try {
    const jwt = app.get(JwtService);
    const token = await jwt.signAsync({ sub: account.id });
    const request = { headers: { authorization: `Bearer ${token}` } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => RolesGuard.prototype.canActivate,
      getClass: () => RolesGuard,
    } as any;
    assert.equal(await app.get(AuthGuard).canActivate(context), true);
    assert.equal(await app.get(RolesGuard).canActivate(context), true);
  } finally {
    await app.close();
  }
});
