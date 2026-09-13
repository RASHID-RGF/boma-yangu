import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, verifyToken } from '@/lib/auth/jwt';
import type { User } from '@/types';

/**
 * These tests confirm the JWT session path is still intact after the auth
 * switch. They do not depend on a live Google call or on the Next.js cookies
 * export.
 */
test('JWT session token can be created and verified', async () => {
  const user = {
    id: 'user-session-1',
    email: 'session-test@example.com',
    role: 'TENANT' as User['role'],
  };

  const token = await createToken(user);
  assert.ok(token, 'JWT should be created');

  const payload = await verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
});

test('JWT session token works for different roles', async () => {
  const user = {
    id: 'user-cookie-1',
    email: 'cookie-test@example.com',
    role: 'SUPER_ADMIN' as User['role'],
  };

  const token = await createToken(user);
  assert.ok(token);

  const payload = await verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
});
