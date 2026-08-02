// Verifies the full tenant payment flow against the live server:
// login -> list invoices -> pay an unpaid invoice -> confirm invoice PAID,
// a RECEIPT document exists, and payment notifications/messages were created.
// Usage: npx tsx scripts/verify-payment-flow.ts
import { execFileSync } from 'child_process';

const BASE = 'http://localhost:3001';
const COOKIE_JAR = '/tmp/verify-pay-cookies.txt';

// execFileSync passes args verbatim (no shell quote-removal mangling JSON).
function run(label: string, method: string, path: string, body?: unknown) {
  const args = ['-s', '-b', COOKIE_JAR, '-c', COOKIE_JAR, '-X', method, `${BASE}${path}`];
  if (body) args.push('-H', 'Content-Type:application/json', '-d', JSON.stringify(body));
  const out = execFileSync('curl', args, { encoding: 'utf-8' }).trim();
  console.log(`\n=== ${label} ===`);
  console.log(out.length > 2000 ? out.slice(0, 2000) : out);
  return out;
}

function parse(out: string) {
  return JSON.parse(out);
}

const login = parse(run('1. LOGIN', 'POST', '/api/auth/login', { email: 'tenant@bomayangu.com', password: 'password123' }));
console.log('\nLogin success:', login.success);

const invoicesBefore = parse(run('2. INVOICES BEFORE', 'GET', '/api/invoices')).data;
const unpaid = (invoicesBefore || []).find((i: any) => i.balance > 0);
console.log('\nUnpaid invoice found:', unpaid ? `${unpaid.invoiceNumber} balance=${unpaid.balance}` : 'NONE');

if (unpaid) {
  const pay = parse(run('3. PAY INVOICE (simulated PalPluss)', 'POST', '/api/payments', {
    invoiceId: unpaid.id,
    phoneNumber: '0712345678',
  }));
  console.log('\nPayment result:', JSON.stringify(pay));

  const invoicesAfter = parse(run('4. INVOICES AFTER', 'GET', '/api/invoices')).data;
  const paid = (invoicesAfter || []).find((i: any) => i.id === unpaid.id);
  console.log('\nInvoice now:', paid ? `${paid.invoiceNumber} status=${paid.status} balance=${paid.balance}` : 'not found');

  const docs = parse(run('5. RECEIPT DOCUMENTS', 'GET', '/api/documents')).data || [];
  console.log('\nRECEIPT docs:', docs.filter((d: any) => d.type === 'RECEIPT').map((d: any) => d.name));

  const notifs = parse(run('6. NOTIFICATIONS', 'GET', '/api/notifications')).data || [];
  console.log('\nNewest notifications:', notifs.slice(0, 3).map((n: any) => `${n.title} | ${n.message.slice(0, 70)}`));

  const msgs = parse(run('7. MESSAGES', 'GET', '/api/messages')).data || [];
  console.log('\nNewest messages:', msgs.slice(0, 3).map((m: any) => `${m.subject} | ${m.content.slice(0, 70)}`));
}

console.log('\n✅ Verification complete');
