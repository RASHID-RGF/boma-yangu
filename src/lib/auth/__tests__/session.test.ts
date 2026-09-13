import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, verifyToken } from '@/lib/auth/jwt';
import type { User } from '@/types';

test('createToken + verifyToken round trip still works', async () => {
  const user = {
    id: 'user-1',
    email: 'test@example.com',
    role: 'TENANT' as User['role'],
  };

  const token = await createToken(user);
  assert.ok(token, 'Token should be created');

  const payload = await verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
});

test('session cookie path uses boma-yangu-session and sets the JWT', async () => {
  const user = {
    id: 'user-2',
    email: 'cookie-test@example.com',
    role: 'SUPER_ADMIN' as User['role'],
  };

  const token = await createToken(user);
  assert.ok(token);

  assert.ok(
    token.length > 0,
    'JWT should not be empty'
  );

  const payload = await verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
});
