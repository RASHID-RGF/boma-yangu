// Read-only check that the PalPluss live API key works.
// Usage: npx tsx scripts/verify-palpluss-key.ts
import { PalPluss } from '@palpluss/sdk';

async function main() {
  const client = new PalPluss({ apiKey: process.env.PALPLUSS_API_KEY });
  try {
    const balance = await client.getServiceBalance();
    console.log('SUCCESS', JSON.stringify(balance));
  } catch (err: any) {
    console.log('ERROR', err?.code, err?.httpStatus, err?.message);
  }
}

main();
