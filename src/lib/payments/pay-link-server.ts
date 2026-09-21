/**
 * Server-side PalPluss pay-link configuration check. Kept separate from the
 * client-safe helpers in pay-link.ts because this module reads server env and
 * must never be imported by browser components.
 */

/** True when the hosted PalPluss checkout URL is configured. */
export function isPayLinkConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PALPLUSS_PAY_LINK_URL;
}
