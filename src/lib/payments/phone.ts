/**
 * Client-safe M-Pesa phone helpers — no SDK or server-only imports, so these
 * can be bundled into browser code (payment forms) as well as API routes.
 */

/**
 * Normalizes a Kenyan phone number to the 2547XXXXXXXX format PalPluss expects.
 * Accepts common inputs such as 0712345678, +254 712 345678, 254712345678,
 * and 0712-345-678 without failing the STK push.
 */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.trim().replace(/\D/g, '');

  if (!digits) {
    throw new Error('Phone number is required');
  }

  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return `254${digits}`;
}

/**
 * Accepts only Kenyan mobile formats that can realistically receive a Safaricom
 * STK prompt. This catches invalid or stale numbers before the app attempts a
 * live payment push and surfaces a clearer tenant message to update their
 * profile with an active M-Pesa number.
 */
export function isValidSafaricomPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;

  const digits = phone.trim().replace(/\D/g, '');
  if (!digits) return false;

  // Accept 07XXXXXXXX / 070XXXXXXXX and +2547XXXXXXXX / 2547XXXXXXXX.
  const local = digits.startsWith('0') ? digits : digits.startsWith('254') ? `0${digits.slice(3)}` : digits;
  return /^0[17]\d{8}$/.test(local);
}

/**
 * Lenient normalizer used to MATCH phones (webhook/sync), never to send:
 * returns '' for empty input instead of throwing, and always yields the
 * 2547XXXXXXXX form so a stored 07... number compares equal to the 254...
 * number the provider reports.
 */
export function normalizePhoneForMatch(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.trim().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return `254${digits}`;
}
