/**
 * Client-safe PalPluss pay-link helpers — no server-only imports, safe to use
 * in browser components.
 *
 * The hosted checkout is a PalPluss PayLink page (NEXT_PUBLIC_PALPLUSS_PAY_LINK_URL,
 * e.g. https://link.palpluss.com/<merchant-id>). It is opened in a new tab with
 * the amount prefilled; the tenant completes payment there with M-Pesa and the
 * payment is confirmed either by the PalPluss webhook or by the sync endpoint
 * (`/api/payments/sync-link`) polling the PalPluss transaction list.
 */

/** Hosted PalPluss checkout base URL (undefined in demo mode / not configured). */
export function getPayLinkUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_PALPLUSS_PAY_LINK_URL || undefined;
}

/**
 * Builds the hosted checkout URL with the amount prefilled. Tenant-app params
 * (reference, phone) are appended for the checkout to echo back when possible;
 * PalPluss ignores unknown query params, so this stays forward-compatible.
 */
export function buildPayLinkUrl(amount: number, reference?: string): string {
  const base = getPayLinkUrl();
  if (!base) return '';
  const params = new URLSearchParams({ amount: String(Math.round(amount)) });
  if (reference) params.set('reference', reference);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${params.toString()}`;
}
