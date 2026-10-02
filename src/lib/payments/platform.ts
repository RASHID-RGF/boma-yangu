/**
 * The platform's fixed M-Pesa collection destination.
 *
 * Every rent payment — the details shown/sent to tenants, the STK push routing,
 * the notifications — uses this Buy Goods till in TILL mode. Landlord-supplied
 * paybill/till values are ignored everywhere and the value cannot be changed
 * from the app.
 */
export const PLATFORM_TILL_NUMBER = '9062851';

/** The only payment mode the platform uses: Buy Goods till. */
export const PLATFORM_PAYMENT_MODE = 'TILL' as const;
