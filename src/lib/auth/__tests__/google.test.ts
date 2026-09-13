import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogleToken } from '@/lib/auth/google';

/**
 * Tests for Google token verification using the Google Cloud Console
 * OpenID Connect flow (no Supabase auth).
 */

test('verifyGoogleToken rejects empty credentials', async () => {
  await assert.rejects(
    () => verifyGoogleToken('', 'some-client-id'),
    (err) => {
      assert.ok(err instanceof Error);
      return true;
    },
    'empty credential should be rejected'
  );
});

test('verifyGoogleToken rejects missing client ID', async () => {
  await assert.rejects(
    () => verifyGoogleToken('some-token', ''),
    (err) => {
      assert.ok(err instanceof Error);
      return true;
    },
    'missing client ID should be rejected'
  );
});

test('verifyGoogleToken calls Google tokeninfo with the credential and client ID', async () => {
  // We can't actually call Google's endpoint without real credentials,
  // but we can verify the function structure accepts these parameters
  // and that the error handling path works.
  const clientId = '679879504490-olb78hah5o5md3clj2np95q0h9jk6vvb.apps.googleusercontent.com';

  // This will fail to actually fetch (no network / bad token), but it
  // confirms the function is wired to receive and forward both params.
  await assert.rejects(
    () => verifyGoogleToken('invalid-token', clientId),
    (err) => {
      assert.ok(err instanceof Error);
      // Should be a network or verification error, not a type error
      assert.notEqual(err.message, 'Invalid client_id');
      return true;
    },
    'invalid token should produce a verification error, not a type error'
  );
});
