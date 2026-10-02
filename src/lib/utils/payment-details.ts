import { PLATFORM_TILL_NUMBER } from '@/lib/payments/platform';

/**
 * Payment-collection details for a property, as shown to tenants and used to
 * route rent. The tenant never enters a paybill themselves — they tap Pay and
 * receive an STK push against the platform's collection destination.
 *
 * The destination is locked: rent always goes to the platform Buy Goods till
 * (PLATFORM_TILL_NUMBER) in TILL mode. Any stored or submitted paybill/till
 * values are ignored — every detail shown to a tenant is the fixed platform
 * till.
 */
export interface PropertyPaymentDetails {
  mpesaPaybill?: string | null;
  mpesaAccountName?: string | null;
  mpesaTillNumber?: string | null;
  mpesaPhone?: string | null;
}

/**
 * True — the platform till is always the collection destination, so payment
 * details always exist regardless of what a property has stored.
 */
export function hasPaymentDetails(
  _details: PropertyPaymentDetails | null | undefined
): boolean {
  return true;
}

/**
 * The tenant-facing payment instructions: always exactly the fixed platform
 * till. Supplied details are deliberately ignored.
 */
export function formatPaymentInstructions(
  _details: PropertyPaymentDetails | null | undefined
): string[] {
  return [`Till Number: ${PLATFORM_TILL_NUMBER}`];
}
