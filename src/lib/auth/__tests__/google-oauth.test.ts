import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as googleSigninGET } from '@/app/api/auth/google/signin/route';
import { handleGoogleOAuthCallback } from '@/lib/auth/google-oauth';

test('GET /api/auth/google/signin redirects to accounts.google.com with OAuth2 parameters', async () => {
  const req = new NextRequest('http://localhost:3000/api/auth/google/signin');
  const res = await googleSigninGET(req);

  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location, 'location header should be present');

  const url = new URL(location);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.ok(url.searchParams.get('client_id'));
  assert.ok(url.searchParams.get('redirect_uri'));
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
});

test('handleGoogleOAuthCallback redirects to login with error when error param is present', async () => {
  const req = new NextRequest('http://localhost:3000/api/auth/callback/google?error=access_denied');
  const res = await handleGoogleOAuthCallback(req);

  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/login?error=access_denied'));
});

test('handleGoogleOAuthCallback redirects to login with error when code param is missing', async () => {
  const req = new NextRequest('http://localhost:3000/api/auth/callback/google');
  const res = await handleGoogleOAuthCallback(req);

  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/login?error=missing_code'));
});

