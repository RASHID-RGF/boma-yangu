/**
 * Safaricom Daraja live test — proves an STK prompt really reaches a phone.
 *
 * Run:
 *   npx tsx scripts/test-daraja-stk.ts
 *       → prints the resolved config, verifies OAuth, and validates that the
 *         callback URL is something Safaricom can actually reach. No money moves.
 *
 *   npx tsx scripts/test-daraja-stk.ts 0712345678 [amount]
 *       → sends a real M-Pesa STK push to that number and polls until it
 *         succeeds, fails, or times out. REAL MONEY MOVES (default 1 KES) and
 *         the phone owner must enter their PIN.
 *
 * Completion is confirmed by polling Daraja's STK query endpoint — the same
 * path the app's status route uses as its webhook fallback, so this also proves
 * the payment flow completes even if the callback cannot be delivered.
 */
import { readFileSync } from 'node:fs';
import {
  isDarajaConfigured,
  isSandbox,
  getBaseUrl,
  getCallbackUrl,
  timestamp,
  sanitizeAccountReference,
  stkPush,
  queryStatus,
} from '../src/lib/payments/daraja';

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

const REQUIRED = [
  ['DARAJA_CONSUMER_KEY', 'My Apps → your app → Consumer Key'],
  ['DARAJA_CONSUMER_SECRET', 'My Apps → your app → Consumer Secret'],
  ['DARAJA_SHORTCODE', 'your paybill number (or till, with DARAJA_TRANSACTION_TYPE)'],
  ['DARAJA_PASSKEY', 'Security Credentials → Lipa na M-Pesa Online Passkey'],
] as const;

/** Read-only config + OAuth check. Prints exactly what is still missing. */
async function check(): Promise<void> {
  console.log('--- Daraja connection check ---');
  console.log(`Environment: ${isSandbox() ? 'SANDBOX' : 'PRODUCTION'} (${getBaseUrl()})`);
  console.log(`Timestamp:   ${timestamp()} (Africa/Nairobi)`);
  console.log(
    `Paybill ref: "${sanitizeAccountReference('INV-2024-0099')}" (Daraja caps AccountReference at 12 chars)\n`
  );

  const missing = REQUIRED.filter(([key]) => !process.env[key]?.trim()).map(
    ([key, where]) => `  ✘ ${key.padEnd(24)} — ${where}`
  );
  if (missing.length) {
    console.log('Missing credentials in .env:\n' + missing.join('\n') + '\n');
    process.exit(1);
  }
  console.log('✔ All four Daraja credentials are present.');

  let callbackUrl: string;
  try {
    callbackUrl = getCallbackUrl();
  } catch (err: any) {
    console.log(`\n✘ Callback URL: ${err.message}`);
    process.exit(1);
  }
  console.log(`✔ Callback URL: ${callbackUrl}`);

  if (!callbackUrl.startsWith('https://')) {
    console.log('  ✘ Safaricom cannot deliver callbacks to a non-HTTPS URL in production.');
    console.log('    Set NEXT_PUBLIC_APP_URL to your public https:// domain.\n');
    process.exit(1);
  }
  if (callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1')) {
    console.log('  ✘ This points at localhost — Safaricom cannot reach it.');
    console.log('    The app still settles payments via its status-poll fallback, but');
    console.log('    set NEXT_PUBLIC_APP_URL to your public domain for real callbacks.\n');
    process.exit(1);
  }

  console.log('\nVerifying OAuth...');
  const { resetTokenCache } = await import('../src/lib/payments/daraja');
  resetTokenCache();
  try {
    // A deliberate no-op query: it authenticates without moving money, and a bad
    // consumer key/secret surfaces here rather than during a real payment.
    await queryStatus('ws_CO_not_a_real_checkout_id').catch((err) => {
      if (err?.httpStatus === 401 || /auth|token|invalid/i.test(err?.message || '')) throw err;
      // Any other answer (unknown checkout id, invalid request) proves auth worked.
    });
    console.log('✔ OAuth accepted — Daraja credentials are valid.');
  } catch (err: any) {
    console.error(`✘ OAuth failed${err?.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}: ${err.message}`);
    if (err?.httpStatus === 401) {
      console.error('  → Check DARAJA_CONSUMER_KEY / DARAJA_CONSUMER_SECRET.');
      console.error('  → Ensure the app on developer.safaricom.co.ke has M-Pesa Express enabled.');
    }
    process.exit(1);
  }

  console.log('\nReady. Send a real prompt with:');
  console.log('  npx tsx scripts/test-daraja-stk.ts 0712345678 1');
}

/** Sends a real STK push and waits for the outcome. */
async function send(phoneArg: string, amountArg?: string): Promise<void> {
  const phone = normalizePhone(phoneArg);
  const amount = Math.max(1, Math.round(Number(amountArg) || 1));
  const reference = `TEST${Date.now().toString(36).toUpperCase()}`.slice(0, 12);

  console.log('--- Daraja live STK push test ---');
  console.log(`Environment: ${isSandbox() ? 'SANDBOX' : 'PRODUCTION'}`);
  console.log(`Shortcode:   ${process.env.DARAJA_SHORTCODE || '(not set)'}`);
  console.log(`Phone:       ${phone}`);
  console.log(`Amount:      ${amount} KES`);
  console.log(`Reference:   ${reference} (shown on the M-Pesa prompt)`);
  console.log(`Callback:    ${getCallbackUrl()}\n`);

  if (!isDarajaConfigured()) {
    console.error('✘ Daraja is not configured — run this script without arguments to see what is missing.');
    process.exit(1);
  }

  let pushed;
  try {
    pushed = await stkPush(phone, amount, reference, 'Test payment');
    console.log(`✔ STK push accepted — CheckoutRequestID: ${pushed.transactionId}`);
    console.log('  The phone should show an M-Pesa prompt NOW. Enter the PIN to pay.\n');
  } catch (err: any) {
    console.error(`✘ STK push failed${err?.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}: ${err.message}`);
    if (err?.httpStatus === 503) console.error('  → Run without arguments to see which credential is missing.');
    if (/callback/i.test(err?.message || '')) console.error('  → Fix NEXT_PUBLIC_APP_URL (must be public https://).');
    process.exit(1);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const tx = await queryStatus(pushed.transactionId);
      console.log(`  status: ${tx.status}${tx.resultDesc ? ` (${tx.resultDesc})` : ''}`);
      if (tx.status === 'SUCCESS') {
        console.log(`\n✔✔ PAYMENT SUCCESSFUL — receipt: ${tx.receipt ?? 'see callback'}`);
        console.log('  In the app, the callback/status-poll marks the matching Payment COMPLETED.');
        process.exit(0);
      }
      if (tx.status === 'FAILED') {
        console.log(`\n✘ Payment failed: ${tx.resultDesc ?? 'no detail'}`);
        console.log('  (Prompt timeout/cancel is expected if it was ignored.)');
        process.exit(0);
      }
    } catch (err) {
      console.log(`  poll error (will retry): ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\n⏱ Timed out waiting for a terminal status. Check the M-Pesa Express logs on');
  console.log('   developer.safaricom.co.ke, or wait — the callback may still arrive.');
  console.log(`   CheckoutRequestID: ${pushed.transactionId}`);
  process.exit(2);
}

async function main() {
  loadEnvFile();
  const [phoneArg, amountArg] = process.argv.slice(2);
  if (!phoneArg) return check();
  return send(phoneArg, amountArg);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
