/**
 * Sets the PalPluss payment channel to TILL (Buy Goods) with the given
 * shortcode, then prints the saved channel. Use this when the shortcode is a
 * M-Pesa Buy Goods till — STK pushes to a till fail with M-Pesa result 2002
 * ("Agent number and Store number do not match") when the channel is typed
 * as PAYBILL/SHORTCODE.
 *
 * Run: npx tsx scripts/setup-till-channel.ts <channelId> <shortcode>
 */
import { PalPluss, PalPlussApiError } from '@palpluss/sdk';
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

function print(ch: { id: string; type: string; shortcode: string; name: string; isDefault: boolean }) {
  console.log(`  id:        ${ch.id}`);
  console.log(`  type:      ${ch.type}`);
  console.log(`  shortcode: ${ch.shortcode}`);
  console.log(`  name:      ${ch.name}`);
  console.log(`  default:   ${ch.isDefault}`);
}

async function main() {
  loadEnvFile();
  const [channelId, shortcode] = process.argv.slice(2);
  if (!channelId || !shortcode) {
    console.error('Usage: npx tsx scripts/setup-till-channel.ts <channelId> <shortcode>');
    process.exit(1);
  }

  const client = new PalPluss({
    apiKey: process.env.PALPLUSS_API_KEY,
    timeout: 30_000,
    autoRetryOnRateLimit: true,
    maxRetries: 3,
  });

  try {
    const updated = await client.updateChannel(channelId, {
      type: 'TILL',
      shortcode,
      name: 'Boma Yangu Till',
      isDefault: true,
    });
    console.log('✔ Channel updated to TILL:');
    print(updated);
  } catch (err) {
    if (err instanceof PalPlussApiError && err.httpStatus === 404) {
      // Channel id doesn't exist on this account (e.g. copied from another
      // environment) — create a fresh TILL channel instead.
      console.log(`Channel ${channelId} not found on this account — creating a new TILL channel...`);
      const created = await client.createChannel({
        type: 'TILL',
        shortcode,
        name: 'Boma Yangu Till',
        isDefault: true,
      });
      console.log('✔ TILL channel created:');
      print(created);
      console.log(`\n→ Set PALPLUSS_CHANNEL_ID=${created.id} in .env and .env.local`);
    } else if (err instanceof PalPlussApiError) {
      console.error(`✘ Failed ${err.httpStatus} [${err.code}]: ${err.message}`);
      process.exit(1);
    } else {
      console.error('✘ Unexpected error:', err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
