import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoogleProfile } from './google';

test('normalizeGoogleProfile builds a usable user profile from Google claims', () => {
  const profile = normalizeGoogleProfile({
    email: 'jane.doe@gmail.com',
    email_verified: true,
    given_name: 'Jane',
    family_name: 'Doe',
    name: 'Jane Doe',
    picture: 'https://lh3.googleusercontent.com/example',
    aud: 'client-id',
  });

  assert.equal(profile.email, 'jane.doe@gmail.com');
  assert.equal(profile.firstName, 'Jane');
  assert.equal(profile.lastName, 'Doe');
  assert.equal(profile.avatarUrl, 'https://lh3.googleusercontent.com/example');
  assert.equal(profile.isVerified, true);
});

test('normalizeGoogleProfile falls back to name parts when given names are missing', () => {
  const profile = normalizeGoogleProfile({
    email: 'alex@example.com',
    email_verified: false,
    name: 'Alex Morgan',
    aud: 'client-id',
  });

  assert.equal(profile.firstName, 'Alex');
  assert.equal(profile.lastName, 'Morgan');
  assert.equal(profile.isVerified, false);
});
