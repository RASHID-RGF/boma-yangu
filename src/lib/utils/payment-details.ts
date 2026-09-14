/**
 * Landlord payment-collection details for a property, as shown to tenants and
 * used to route rent. The tenant never enters a paybill themselves — they tap
 * Pay and receive an STK push against the landlord's configured destination.
 */
export interface PropertyPaymentDetails {
  mpesaPaybill?: string | null;
  mpesaAccountName?: string | null;
  mpesaTillNumber?: string | null;
  mpesaPhone?: string | null;
}

/** True when at least one collection detail is set on the property. */
export function hasPaymentDetails(
  details: PropertyPaymentDetails | null | undefined
): boolean {
  if (!details) return false;
  return Boolean(
    details.mpesaPaybill?.trim() ||
      details.mpesaAccountName?.trim() ||
      details.mpesaTillNumber?.trim() ||
      details.mpesaPhone?.trim()
  );
}

/** One human-readable line per set detail, e.g. "Paybill: 123456 — Acct: Rent". */
export function formatPaymentInstructions(
  details: PropertyPaymentDetails | null | undefined
): string[] {
  if (!details) return [];
  const lines: string[] = [];

  const paybill = details.mpesaPaybill?.trim();
  const account = details.mpesaAccountName?.trim();
  if (paybill) {
    lines.push(account ? `Paybill: ${paybill} — Account: ${account}` : `Paybill: ${paybill}`);
  }

  const till = details.mpesaTillNumber?.trim();
  if (till) lines.push(`Till Number: ${till}`);

  const phone = details.mpesaPhone?.trim();
  if (phone) lines.push(`Direct phone: ${phone}`);

  return lines;
}
