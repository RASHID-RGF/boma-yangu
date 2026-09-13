import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { createToken } from '@/lib/auth/jwt';
import { UserRole } from '@/types';

test('middleware allows unauthenticated access to home page', async () => {
  const req = new NextRequest('http://localhost:3000/');
  const res = await middleware(req);
  assert.equal(res.status, 200);
});

test('middleware allows unauthenticated access to /login and /register', async () => {
  const loginReq = new NextRequest('http://localhost:3000/login');
  const loginRes = await middleware(loginReq);
  assert.equal(loginRes.status, 200);

  const registerReq = new NextRequest('http://localhost:3000/register');
  const registerRes = await middleware(registerReq);
  assert.equal(registerRes.status, 200);

  const forgotReq = new NextRequest('http://localhost:3000/forgot-password');
  const forgotRes = await middleware(forgotReq);
  assert.equal(forgotRes.status, 200);
});

test('middleware allows unauthenticated access to auth API routes', async () => {
  const registerApiReq = new NextRequest('http://localhost:3000/api/auth/register', { method: 'POST' });
  const registerApiRes = await middleware(registerApiReq);
  assert.equal(registerApiRes.status, 200);

  const loginApiReq = new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST' });
  const loginApiRes = await middleware(loginApiReq);
  assert.equal(loginApiRes.status, 200);

  const googleApiReq = new NextRequest('http://localhost:3000/api/auth/google', { method: 'POST' });
  const googleApiRes = await middleware(googleApiReq);
  assert.equal(googleApiRes.status, 200);
});

test('middleware redirects unauthenticated user from protected routes to /login with redirect query', async () => {
  const req = new NextRequest('http://localhost:3000/dashboard');
  const res = await middleware(req);
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/login?redirect=%2Fdashboard'));
});

test('middleware redirects authenticated user from /login to /dashboard', async () => {
  const token = await createToken({
    id: 'user-1',
    email: 'user@example.com',
    role: UserRole.LANDLORD,
  });

  const req = new NextRequest('http://localhost:3000/login', {
    headers: {
      cookie: `boma-yangu-session=${token}`,
    },
  });

  const res = await middleware(req);
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/dashboard'));
});

test('middleware lets a tenant into /my-room but blocks non-tenant roles', async () => {
  const tenantToken = await createToken({
    id: 'tenant-1',
    email: 'tenant@example.com',
    role: UserRole.TENANT,
  });
  const tenantRes = await middleware(
    new NextRequest('http://localhost:3000/my-room', {
      headers: { cookie: `boma-yangu-session=${tenantToken}` },
    })
  );
  assert.equal(tenantRes.status, 200, 'tenant should reach their own room');

  const landlordToken = await createToken({
    id: 'landlord-1',
    email: 'landlord@example.com',
    role: UserRole.LANDLORD,
  });
  const landlordRes = await middleware(
    new NextRequest('http://localhost:3000/my-room', {
      headers: { cookie: `boma-yangu-session=${landlordToken}` },
    })
  );
  assert.equal(landlordRes.status, 307, 'non-tenant should be redirected away');
  assert.ok(landlordRes.headers.get('location')?.includes('/dashboard'));
});

