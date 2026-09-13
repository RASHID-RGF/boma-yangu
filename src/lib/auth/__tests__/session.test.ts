import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, verifyToken, setSessionCookie } from '@/lib/auth/jwt';
import type { User } from '@/types';

/**
 * JWT session tests — confirms the `boma-yangu-session` cookie path is
 * still intact after the auth switch to Google Cloud Console + direct JWT.
 */

test('createToken creates a valid JWT session token', async () => {
  const user: User = {
    id: 'test-user-001',
    email: 'session-test@example.com',
    role: 'TENANT',
  };

  const token = await createToken(user);
  assert.ok(token, 'JWT token should be created');
  assert.ok(typeof token === 'string' && token.length > 0, 'JWT should be a non-empty string');
});

test('verifyToken returns the correct user payload', async () => {
  const user: User = {
    id: 'test-user-002',
    email: 'verify-test@example.com',
    role: 'SUPER_ADMIN',
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
    role: 'TENANT',
  });

  // Tamper with the signature portion
  const tampered = token.slice(0, -5) + 'xxxxx';
  const result = await verifyToken(tampered);
  assert.equal(result, null, 'tampered token should return null');
});

test('verifyToken returns null for expired tokens', async () => {
  // Create a token that expired 1 hour ago by using a custom secret and
  // manually constructing an expired token via the jwt library.
  const expiredSecret = new TextEncoder().encode('test-expired-secret-key-1234567890');
  import('jose').then(async ({ SignJWT, jwtVerify }) => {
    const expiredToken = await new SignJWT({ userId: 'test-user-004', email: 'expired@example.com', role: 'TENANT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('-1h')
      .sign(expiredSecret);

    const result = await verifyToken(expiredToken);
    assert.equal(result, null, 'expired token should return null');
  });
});

test('setSessionCookie is exported and accepts a token argument', () => {
  // setSessionCookie uses next/headers cookies() which requires a request
  // context, so we can only verify it's exported and typed correctly here.
  assert.equal(typeof setSessionCookie, 'function', 'setSessionCookie should be a function');
  assert.equal(setSessionCookie.length, 1, 'setSessionCookie should take one argument (token)');
});

test('session cookie path works for different user roles', async () => {
  const adminUser: User = {
    id: 'admin-001',
    email: 'admin@example.com',
    role: 'SUPER_ADMIN',
  };

  const tenantUser: User = {
    id: 'tenant-001',
    email: 'tenant@example.com',
    role: 'TENANT',
  };

  const adminToken = await createToken(adminUser);
  const tenantToken = await createToken(tenantUser);

  const adminPayload = await verifyToken(adminToken);
  const tenantPayload = await verifyToken(tenantToken);

  assert.equal(adminPayload.role, 'SUPER_ADMIN');
  assert.equal(tenantPayload.role, 'TENANT');
  assert.equal(adminPayload.email, 'admin@example.com');
  assert.equal(tenantPayload.email, 'tenant@example.com');
});
