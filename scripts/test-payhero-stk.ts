/**
 * Payhero live test — proves an STK prompt really reaches a phone number.
 *
 * Run:
 *   npx tsx scripts/test-payhero-stk.ts
 *       → verifies the Basic token and lists your payment channels, so you can
 *         copy the right integer id into PAYHERO_CHANNEL_ID. No money moves.
 *
 *   npx tsx scripts/test-payhero-stk.ts 0712345678 [amount] [--channel <id>]
 *       → sends a real M-Pesa STK push to that number and polls until it
 *         succeeds, fails, or times out. REAL MONEY MOVES (default 1 KES) and
 *         the phone owner must enter their PIN.
 *
 * Webhooks are not exercised here (localhost is unreachable from Payhero) —
 * completion is confirmed by polling Payhero's transaction-status API, the
 * same path the app's status route uses as its webhook fallback.
 */
import { readFileSync } from 'node:fs';
import {
  getAuthHeader,
  getWebhookUrl,
  isPayheroConfigured,
  resolveChannelId,
  stkPush,
  queryStatus,
} from '../src/lib/payments/payhero';

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

async function getJson(path: string): Promise<any> {
  const res = await fetch(`https://backend.payhero.co.ke/api/v2/${path}`, {
    headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body?.message || body?.error || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(message) as Error & { httpStatus: number };
    err.httpStatus = res.status;
    throw err;
  }
  return body;
}

/** Read-only credential + channel check. Prints the id to put in .env. */
async function check(): Promise<void> {
  console.log('--- Payhero connection check ---');
  if (!isPayheroConfigured()) {
    console.error('✘ Payhero is not configured. Set PAYHERO_BASIC_AUTH_TOKEN (or username/password) in .env');
    process.exit(1);
  }

  let channels: any[] = [];
  try {
    const body = await getJson('payment_channels?is_active=true');
    channels = body?.payment_channels ?? [];
  } catch (err: any) {
    console.error(`✘ Authentication failed (HTTP ${err.httpStatus ?? '?'}): ${err.message}`);
    if (err.httpStatus === 401) {
      console.error('  → The token in .env was rejected.');
      console.error('  → Generate a fresh one: app.payhero.co.ke → API Keys → Add new API Key');
      console.error('    → Copy the "Basic Authorization token" into PAYHERO_BASIC_AUTH_TOKEN.');
    }
    process.exit(1);
  }

  console.log('✔ Credentials accepted.');
  console.log(`  Account ID: ${process.env.PAYHERO_ACCOUNT_ID || '(not set)'}`);
  console.log(`  Callback:   ${getWebhookUrl()}`);
  console.log(`  Active payment channels: ${channels.length}\n`);

  if (!channels.length) {
    console.log('✘ No active payment channels. Register one under Payment Channels →');
    console.log('  My Payment Channels, then set PAYHERO_CHANNEL_ID in .env.\n');
    process.exit(1);
  }

  for (const c of channels) {
    console.log(`  id=${c.id}  type=${c.channel_type}/${c.transaction_type}  shortcode=${c.short_code ?? '—'}  account=${c.account_number ?? '—'}  ${c.description ?? ''}`);
  }

  const configured = resolveChannelId();
  console.log('');
  if (configured) {
    console.log(`✔ PAYHERO_CHANNEL_ID=${configured} — ready to send STK pushes.`);
  } else {
    const first = channels.length === 1 ? channels[0] : null;
    console.log('✘ PAYHERO_CHANNEL_ID is not set.');
    console.log(
      first
        ? `  You have exactly one channel — add this line to .env:\n    PAYHERO_CHANNEL_ID=${first.id}`
        : `  Pick one of the ids above and add it to .env:\n    PAYHERO_CHANNEL_ID=<id>`
    );
    console.log('  Until then, payments fail with a clear message instead of a broken push.');
  }
  console.log(`\nThen run: npx tsx scripts/test-payhero-stk.ts <phone> 1`);
}

/** Sends a real STK push and waits for the outcome. */
async function send(phoneArg: string, amountArg?: string, channelArg?: string): Promise<void> {
  const phone = normalizePhone(phoneArg);
  const amount = Math.max(1, Math.round(Number(amountArg) || 1));
  const channelId = channelArg ? Number(channelArg) : resolveChannelId();
  const reference = `TEST-${Date.now().toString(36).toUpperCase()}`;

  console.log('--- Payhero live STK push test ---');
  console.log(`Channel:   ${channelId ?? '(none)'}`);
  console.log(`Phone:     ${phone}`);
  console.log(`Amount:    ${amount} KES`);
  console.log(`Reference: ${reference}`);
  console.log(`Callback:  ${getWebhookUrl()}\n`);

  if (!isPayheroConfigured()) {
    console.error('✘ Payhero is not configured. Set PAYHERO_BASIC_AUTH_TOKEN in .env');
    process.exit(1);
  }

  let pushed;
  try {
    pushed = await stkPush(phone, amount, reference, channelId ?? null);
    console.log(`✔ STK push accepted — reference: ${pushed.transactionId}`);
    if (pushed.checkoutRequestId) console.log(`  CheckoutRequestID: ${pushed.checkoutRequestId}`);
    console.log(`  Status: ${pushed.status}`);
    console.log('  The phone should show an M-Pesa prompt NOW. Enter the PIN to pay.\n');
  } catch (err: any) {
    console.error(`✘ STK push failed${err.httpStatus ? ` (HTTP ${err.httpStatus})` : ''}: ${err.message}`);
    if (err.httpStatus === 401) console.error('  → Credentials rejected. Re-run without a phone to check the token.');
    if (err.httpStatus === 503) console.error('  → Set PAYHERO_CHANNEL_ID in .env (run the script with no arguments to list channels).');
    if (err.httpStatus === 400 || err.httpStatus === 422) console.error('  → Check the channel id on your Payhero dashboard.');
    process.exit(1);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const tx = await queryStatus(pushed.transactionId);
      console.log(`  status: ${tx.status}${tx.resultDesc ? ` (${tx.resultDesc})` : ''}`);
      if (tx.status === 'SUCCESS') {
        console.log(`\n✔✔ PAYMENT SUCCESSFUL — receipt: ${tx.mpesaReceipt ?? 'n/a'}`);
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

  console.log('\n⏱ Timed out waiting for a terminal status. Check the Payhero dashboard.');
  console.log(`   reference: ${pushed.transactionId}`);
  process.exit(2);
}

async function main() {
  loadEnvFile();

  const args = process.argv.slice(2);
  const channelFlag = args.indexOf('--channel');
  let channelArg: string | undefined;
  if (channelFlag !== -1) {
    channelArg = args[channelFlag + 1];
    args.splice(channelFlag, 2);
  }

  const [phoneArg, amountArg] = args;
  if (!phoneArg) return check();
  return send(phoneArg, amountArg, channelArg);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
