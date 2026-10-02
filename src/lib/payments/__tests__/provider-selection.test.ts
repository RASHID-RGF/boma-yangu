import test from 'node:test';
import assert from 'node:assert/strict';
import { getStkProvider, isStkProviderConfigured } from '@/lib/payments/finalize';
import { isPayheroConfigured, getAuthHeader } from '@/lib/payments/payhero';

/** Runs `fn` with `overrides` applied to process.env, restoring the originals. */
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) saved[key] = process.env[key];

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const PAYHERO = {
  PAYHERO_BASIC_AUTH_TOKEN: undefined,
  PAYHERO_BASIC_AUTH: undefined,
  PAYHERO_API_USERNAME: undefined,
  PAYHERO_API_PASSWORD: undefined,
};

const PALPLUSS = {
  PALPLUSS_API_KEY: undefined,
  PALPLUSS_CHANNEL_ID: undefined,
};

const DARAJA = {
  DARAJA_CONSUMER_KEY: undefined,
  DARAJA_CONSUMER_SECRET: undefined,
  DARAJA_SHORTCODE: undefined,
  DARAJA_PASSKEY: undefined,
};

/** A complete, valid-looking Payhero credential set. */
const PAYHERO_SET = {
  ...PAYHERO,
  PAYHERO_BASIC_AUTH_TOKEN: 'Basic dTFlYWpzOGs=',
};

/** A complete Daraja credential set. */
const DARAJA_SET = {
  ...DARAJA,
  DARAJA_ENV: 'production',
  DARAJA_CONSUMER_KEY: 'key',
  DARAJA_CONSUMER_SECRET: 'secret',
  DARAJA_SHORTCODE: '174379',
  DARAJA_PASSKEY: 'passkey',
};

// NOTE: importing `@/lib/payments/finalize` pulls in the Prisma client, which
// auto-loads the project .env into process.env. Every test that assumes a
// provider is NOT configured must therefore spread that provider's vars (as
// undefined) into withEnv — an unset shell env is not enough here.

test('no provider configured → payments are refused, never simulated', () => {
  withEnv({ ...PAYHERO, ...PALPLUSS, ...DARAJA }, () => {
    assert.equal(isPayheroConfigured(), false);
    assert.equal(isStkProviderConfigured(), false);
  });
});

test('Payhero alone selects Payhero as the STK provider', () => {
  withEnv({ ...PAYHERO_SET, ...PALPLUSS, ...DARAJA }, () => {
    assert.equal(isStkProviderConfigured(), true);
    assert.equal(getStkProvider(), 'PAYHERO');
  });
});

test('Payhero via username/password (no pre-computed token) also selects Payhero', () => {
  withEnv({ ...PAYHERO, ...PALPLUSS, PAYHERO_API_USERNAME: 'u', PAYHERO_API_PASSWORD: 'p', ...DARAJA }, () => {
    assert.equal(isPayheroConfigured(), true);
    assert.equal(getStkProvider(), 'PAYHERO');
  });
});

test('PalPluss takes priority when its API key is configured', () => {
  withEnv({ ...PAYHERO, ...PALPLUSS, PALPLUSS_API_KEY: 'pk_live_ok', ...DARAJA }, () => {
    assert.equal(getStkProvider(), 'PALPLUSS');
  });
});

test('Daraja alone still selects Daraja — the fallback keeps working', () => {
  withEnv({ ...PAYHERO, ...PALPLUSS, ...DARAJA_SET }, () => {
    assert.equal(isStkProviderConfigured(), true);
    assert.equal(getStkProvider(), 'DARAJA');
  });
});

test('PalPluss wins when it is configured alongside Payhero', () => {
  withEnv({ ...PAYHERO_SET, ...PALPLUSS, PALPLUSS_API_KEY: 'pk_live_ok', ...DARAJA_SET }, () => {
    assert.equal(isStkProviderConfigured(), true);
    assert.equal(getStkProvider(), 'PALPLUSS');
  });
});

test('a partial Payhero set is not enough to select Payhero', () => {
  // Username without a password can never produce a valid Basic auth header,
  // so it must not be mistaken for a configured provider.
  withEnv({ ...PAYHERO, ...PALPLUSS, PAYHERO_API_USERNAME: 'u', ...DARAJA }, () => {
    assert.equal(isPayheroConfigured(), false);
    assert.equal(isStkProviderConfigured(), false);
    assert.equal(getStkProvider(), 'DARAJA');
  });
});

test('getAuthHeader accepts a bare token and normalises it to "Basic …"', () => {
  withEnv({ ...PAYHERO, PAYHERO_BASIC_AUTH_TOKEN: 'dmFsdWU=' }, () => {
    assert.equal(getAuthHeader(), 'Basic dmFsdWU=');
  });
  withEnv({ ...PAYHERO, PAYHERO_BASIC_AUTH: 'Basic dmFsdWU=' }, () => {
    assert.equal(getAuthHeader(), 'Basic dmFsdWU=');
  });
  withEnv({ ...PAYHERO, PAYHERO_BASIC_AUTH_TOKEN: 'Basic dmFsdWU=' }, () => {
    // Already prefixed — must not be double-prefixed.
    assert.equal(getAuthHeader(), 'Basic dmFsdWU=');
  });
  // No credentials at all → empty header, and the caller reports "not configured".
  withEnv({ ...PAYHERO }, () => assert.equal(getAuthHeader(), ''));
});
