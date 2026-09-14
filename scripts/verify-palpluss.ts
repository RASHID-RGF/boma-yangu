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
