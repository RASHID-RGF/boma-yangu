/**
 * Lists all payment channels on the PalPluss account so you can see which
 * channel ids actually exist (and their type/shortcode).
 *
 * Run: npx tsx scripts/list-channels.ts
 */
import { PalPluss } from '@palpluss/sdk';
import { readFileSync } from 'node:fs';

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
  const client = new PalPluss({
    apiKey: process.env.PALPLUSS_API_KEY,
    timeout: 30_000,
    autoRetryOnRateLimit: true,
    maxRetries: 3,
  });

  // The SDK type defs don't expose listChannels, but the client supports it.
  const res = await (client as any).listChannels();
  const channels = res.items ?? res ?? [];
  if (channels.length === 0) {
    console.log('No payment channels on this account.');
    return;
  }
  console.log(`Found ${channels.length} channel(s):\n`);
  for (const ch of channels) {
    console.log(`  id:        ${ch.id}`);
    console.log(`  type:      ${ch.type}`);
    console.log(`  shortcode: ${ch.shortcode}`);
    console.log(`  name:      ${ch.name}`);
    console.log(`  account:   ${ch.accountNumber ?? '—'}`);
    console.log(`  default:   ${ch.isDefault ? 'yes' : 'no'}\n`);
  }
}

main().catch((err) => {
  console.error('Failed to list channels:', err instanceof Error ? err.message : err);
  process.exit(1);
});
