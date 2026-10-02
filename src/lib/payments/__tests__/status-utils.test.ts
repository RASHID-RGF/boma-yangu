import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalPaymentStatus } from '@/lib/payments/status';

test('terminal payment statuses stop the STK wait immediately', () => {
  assert.equal(isTerminalPaymentStatus('COMPLETED'), true);
  assert.equal(isTerminalPaymentStatus('PARTIAL'), true);
  assert.equal(isTerminalPaymentStatus('FAILED'), true);
  assert.equal(isTerminalPaymentStatus('PENDING'), false);
  assert.equal(isTerminalPaymentStatus(null), false);
  assert.equal(isTerminalPaymentStatus(undefined), false);
});
