/**
 * Read-only PalPluss credential check: prints the service wallet balance and
 * lists the account's payment channels (paybill/till) so you can confirm the
 * API key works and see which channels exist (useful for PALPLUSS_CHANNEL_ID).
 *
 * Run: npx tsx scripts/verify-palpluss.ts
 * No money moves — this only calls read-only endpoints.
 */
import { PalPluss, PalPlussApiError } from '@palpluss/sdk';
import { readFileSync } from 'node:fs';

/** Loads .env file values over any stale exported env vars (file is truth here). */
function loadEnvFile(path = '.env') {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // no .env file — use shell env as-is
  }
}

async function main() {
  loadEnvFile();
  const apiKey = process.env.PALPLUSS_API_KEY;
  if (!apiKey) {
    console.error('PALPLUSS_API_KEY is not set.');
    process.exit(1);
  }
  console.log(`API key: ${apiKey.slice(0, 11)}... (${apiKey.length} chars)`);

  // Format sanity check — the console issues API keys prefixed pp_live_ / pp_test_
  // (older docs show pk_live_; both are accepted). Anything else is probably a
  // different credential type, which the API rejects with 401 INVALID_API_KEY
  // even though the request itself is well-formed.
  if (!/^(pp|pk)_(live|test)_/.test(apiKey)) {
    console.warn(
      `\n⚠ Heads-up: PalPluss API keys start with "pp_live_", "pp_test_",\n` +
        `  "pk_live_" or "pk_test_", but this key starts with "${apiKey.slice(0, 8)}".\n` +
        `  If auth fails below, you likely copied a different credential type —\n` +
        `  the API key lives at console.palpluss.com → Settings → API Keys.`
    );
  }

  const client = new PalPluss({
    apiKey,
    timeout: 30_000,
    autoRetryOnRateLimit: true,
    maxRetries: 3,
  });

  try {
    const balance = await client.getServiceBalance();
    console.log('\n✔ Credentials valid — service wallet:');
    console.log(`  Available: ${balance.availableBalance} ${balance.currency}`);
    console.log(`  Ledger:    ${balance.ledgerBalance} ${balance.currency}`);
  } catch (err) {
    if (err instanceof PalPlussApiError) {
      console.error(`\n✘ PalPluss API error ${err.httpStatus} [${err.code}]: ${err.message}`);
      if (err.code === 'INVALID_API_KEY' || (err.httpStatus === 401 && err.code === 'HTTP_401')) {
        // The server parsed our Basic header fine — it just doesn't know this key.
        console.error(
          `\nThe request reached PalPluss and the auth header was parsed correctly —\n` +
            `the server does not recognize this key. Fix the credential:\n` +
            `  1. Sign in at https://console.palpluss.com → Settings → API Keys.\n` +
            `  2. If the key shows as regenerated/revoked (or the entry isn't labeled\n` +
            `     "API key"), copy a fresh pk_live_… API key.\n` +
            `  3. Put the FULL key in .env as PALPLUSS_API_KEY=pk_live_… (no quotes).\n` +
            `  4. Re-run: npx tsx scripts/verify-palpluss.ts\n` +
            `     (restart the dev server afterwards — Next.js caches env at startup).`
        );
      } else if (err.code === 'AUTH_HEADER_INVALID') {
        console.error(
          `\nThe Authorization header itself was rejected — check for an SDK/API\n` +
            `version mismatch or a proxy stripping the header.`
        );
      }
      process.exit(1);
    }
    throw err;
  }

  try {
    const list = await (client as any).listChannels?.();
    if (list && Array.isArray(list.items ?? list)) {
      const channels = list.items ?? list;
      console.log('\nPayment channels:');
      for (const ch of channels) {
        const marker =
          ch.id === process.env.PALPLUSS_CHANNEL_ID ? '  <-- PALPLUSS_CHANNEL_ID (configured)' : '';
        console.log(
          `  ${ch.id}  ${ch.type}  ${ch.shortcode}  "${ch.name}"${ch.isDefault ? ' (default)' : ''}${marker}`
        );
      }
      if (channels.length === 0) console.log('  (none yet)');
    }
  } catch {
    // listChannels may not exist in this SDK version — balance check is enough.
  }

  const channelId = process.env.PALPLUSS_CHANNEL_ID;
  console.log(
    channelId
      ? `\nPALPLUSS_CHANNEL_ID is set: ${channelId}`
      : '\nPALPLUSS_CHANNEL_ID is NOT set — STK pushes will use the account default channel.'
  );
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
