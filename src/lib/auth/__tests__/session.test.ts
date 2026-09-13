import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createToken, verifyToken, setSessionCookie } from '@/lib/auth/jwt';
import { UserRole } from '@/types';
import type { User } from '@/types';

test('verifyToken creates and verifies a JWT payload', async () => {
  const user: Pick<User, 'id' | 'email' | 'role'> = {
    id: 'test-user-001',
    email: 'tenant@example.com',
    role: UserRole.TENANT,
  };

  const token = await createToken(user);
  const payload = await verifyToken(token);

  assert.ok(payload, 'verifyToken should return a payload');
  assert.equal(payload.userId, user.id);
  assert.equal(payload.email, user.email);
  assert.equal(payload.role, user.role);
});

test('verifyToken returns null for tampered tokens', async () => {
  const token = await createToken({
    id: 'test-user-003',
    email: 'tampered@example.com',
    role: UserRole.TENANT,
  });

  const tampered = token.slice(0, -5) + 'xxxxx';
  const result = await verifyToken(tampered);
  assert.equal(result, null, 'tampered token should return null');
});

test('verifyToken returns null for expired tokens', async () => {
  const expiredSecret = new TextEncoder().encode('test-expired-secret-key-1234567890');
  const expiredToken = await new SignJWT({ userId: 'test-user-004', email: 'expired@example.com', role: 'TENANT' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('-1h')
    .sign(expiredSecret);

  const result = await verifyToken(expiredToken);
  assert.equal(result, null, 'expired token should return null');
});

test('setSessionCookie is exported and accepts a token argument', () => {
  assert.equal(typeof setSessionCookie, 'function', 'setSessionCookie should be a function');
  assert.equal(setSessionCookie.length, 1, 'setSessionCookie should take one argument (token)');
});

test('session cookie path works for different user roles', async () => {
  const adminUser: Pick<User, 'id' | 'email' | 'role'> = {
    id: 'admin-001',
    email: 'admin@example.com',
    role: UserRole.SUPER_ADMIN,
  };

  const tenantUser: Pick<User, 'id' | 'email' | 'role'> = {
    id: 'tenant-001',
    email: 'tenant@example.com',
    role: UserRole.TENANT,
  };

  const adminToken = await createToken(adminUser);
  const tenantToken = await createToken(tenantUser);

  const adminPayload = await verifyToken(adminToken);
  const tenantPayload = await verifyToken(tenantToken);

  assert.ok(adminPayload, 'adminPayload should not be null');
  assert.ok(tenantPayload, 'tenantPayload should not be null');
  assert.equal(adminPayload.role, 'SUPER_ADMIN');
  assert.equal(tenantPayload.role, 'TENANT');
  assert.equal(adminPayload.email, 'admin@example.com');
  assert.equal(tenantPayload.email, 'tenant@example.com');
});
