/**
 * Live PalPluss end-to-end test: sends a real 1 KES STK push, then polls the
 * transaction until it succeeds, fails, or times out.
 *
 * Run: npx tsx scripts/test-stk-push.ts <phone> [amount]
 *   phone: Safaricom number, e.g. 0712345678 or 254712345678
 *
 * Real money moves (default 1 KES) — the phone owner must enter their PIN.
 * Webhooks are NOT tested here (localhost is unreachable from PalPluss);
 * completion is confirmed by polling PalPluss's transaction status API.
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

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s+-]/g, '');
  if (/^0\d{9}$/.test(cleaned)) return `254${cleaned.slice(1)}`;
  if (/^254\d{9}$/.test(cleaned)) return cleaned;
  throw new Error(`Not a valid Kenyan number: ${phone} (use 07XXXXXXXXX or 2547XXXXXXXXX)`);
}

async function main() {
  loadEnvFile();

  const [phoneArg, amountArg] = process.argv.slice(2);
  if (!phoneArg) {
    console.error('Usage: npx tsx scripts/test-stk-push.ts <phone> [amount]\n  e.g. npx tsx scripts/test-stk-push.ts 0712345678 1');
    process.exit(1);
  }
  const phone = normalizePhone(phoneArg);
  const amount = Math.max(1, Math.round(Number(amountArg) || 1));
  const reference = `TEST-${Date.now().toString(36).toUpperCase()}`;

  console.log('--- PalPluss live STK push test ---');
  console.log(`Channel:  ${process.env.PALPLUSS_CHANNEL_ID || '(account default)'}`);
  console.log(`Phone:    ${phone}`);
  console.log(`Amount:   ${amount} KES`);
  console.log(`Reference: ${reference}\n`);

  const client = new PalPluss({
    apiKey: process.env.PALPLUSS_API_KEY,
    timeout: 30_000,
    autoRetryOnRateLimit: true,
    maxRetries: 3,
  });

  let transactionId: string;
  try {
    const tx = await client.stkPush({
      amount,
      phone,
      accountReference: reference,
      transactionDesc: 'Boma Yangu live test payment',
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/palpluss-callback`,
      channelId: process.env.PALPLUSS_CHANNEL_ID || undefined,
    });
    transactionId = tx.transactionId;
    console.log(`✔ STK push accepted — transactionId: ${transactionId}`);
    console.log('  The phone should show an M-Pesa prompt now. Enter the PIN to pay.\n');
  } catch (err) {
    if (err instanceof PalPlussApiError) {
      console.error(`✘ STK push failed ${err.httpStatus} [${err.code}]: ${err.message}`);
      if (err.code === 'HTTP_401') console.error('  → API key rejected. Check PALPLUSS_API_KEY (watch for stale shell env vars).');
      if (err.httpStatus === 400 || err.httpStatus === 422) console.error('  → Check the channel id / shortcode on your PalPluss dashboard.');
    } else {
      console.error('✘ Unexpected error:', err);
    }
    process.exit(1);
  }

  // Poll until terminal state or timeout (~90s covers M-Pesa prompt expiry).
  const deadline = Date.now() + 90_000;
  const terminal = ['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'];
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const tx = await client.getTransaction(transactionId);
      console.log(`  status: ${tx.status} (result: ${tx.result_code ?? '—'})`);
      if (terminal.includes(tx.status)) {
        if (tx.status === 'SUCCESS') {
          console.log(`\n✔✔ PAYMENT SUCCESSFUL — receipt: ${(tx as any).mpesa_receipt ?? tx.result_desc ?? 'n/a'}`);
          console.log('  In the app, the webhook marks the matching Payment COMPLETED with this receipt code.');
        } else {
          console.log(`\n✘ Payment ended as ${tx.status}: ${tx.result_desc ?? 'no detail'}`);
          console.log('  (Pin entry timeout/cancel is expected if the prompt was ignored.)');
        }
        process.exit(0);
      }
    } catch (err) {
      console.log(`  poll error (will retry): ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log('\n⏱ Timed out waiting for a terminal status. Check the PalPluss dashboard for this transaction.');
  console.log(`   transactionId: ${transactionId}`);
  process.exit(2);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
