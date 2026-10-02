export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'CANCELLED' | 'EXPIRED' | 'REVERSED';

export function isTerminalPaymentStatus(status?: string | null): boolean {
  if (!status) return false;
  return ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'EXPIRED', 'REVERSED'].includes(status);
}
