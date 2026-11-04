import assert from 'node:assert/strict';
import test from 'node:test';
import { getJwtSecret } from './jwt-secret';

test('JWT secret lookup prefers the access key and falls back to the configured JWT_SECRET', () => {
  const oldAccess = process.env.JWT_ACCESS_SECRET;
  const oldSecret = process.env.JWT_SECRET;
  const oldNodeEnv = process.env.NODE_ENV;
  try {
    process.env.JWT_ACCESS_SECRET = 'access-key-for-test';
    process.env.JWT_SECRET = 'shared-key-for-test';
    assert.equal(getJwtSecret(), 'access-key-for-test');
    delete process.env.JWT_ACCESS_SECRET;
    assert.equal(getJwtSecret(), 'shared-key-for-test');
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';
    assert.throws(() => getJwtSecret(), /must be configured in production/);
  } finally {
    if (oldAccess === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = oldAccess;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});
