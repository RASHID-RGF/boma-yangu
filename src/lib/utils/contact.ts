/**
 * Contact normalization used to link a tenant record to a login account.
 *
 * The landlord enters the tenant's email/phone when adding them. The person may
 * then sign in with different casing, whitespace or digit grouping, so both sides
 * are normalised before matching — an email or phone the landlord linked is
 * recognised when the tenant signs in with it.
 */

/** Trims and lowercases an email (or returns null for empty input). */
export function normalizeEmail(email?: string | null): string | null {
  const trimmed = email?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

/**
 * Normalises a phone number: strips everything except digits (and a leading
 * plus for international numbers), then trims. This lets a landlord enter
 * "0712345678" and the tenant sign in with "0712 345 678" — both resolve to
 * "0712345678".
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  // Keep a leading '+' for international numbers, then keep only digits.
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9+]/g, '');
  return hasPlus ? `+${digits.slice(1)}` : digits;
}

/**
 * Chooses a sensible display name for a tenant invited by email only, e.g.
 * "mary.jane@example.com" -> "Mary Jane". Returns null when there is nothing
 * usable, so the caller can fall back to another default.
 */
export function deriveNameFromEmail(email?: string | null): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const local = normalized.split('@')[0] || '';
  const cleaned = local.replace(/[._\-+]+/g, ' ').trim();
  if (!cleaned) return null;

  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}
