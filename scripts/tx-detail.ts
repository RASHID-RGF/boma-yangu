/**
 * Prints full detail for a PalPluss transaction by id.
 * Run: npx tsx scripts/tx-detail.ts <transactionId>
 */
import { PalPluss } from '@palpluss/sdk';
import { readFileSync } from 'node:fs';

function loadEnvFile(path = '.env') {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

async function main() {
  loadEnvFile();
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: npx tsx scripts/tx-detail.ts <transactionId>');
    process.exit(1);
  }
  const client = new PalPluss({ apiKey: process.env.PALPLUSS_API_KEY });
  const tx = await client.getTransaction(id);
  console.log(JSON.stringify(tx, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
