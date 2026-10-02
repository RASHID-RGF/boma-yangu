import { useCallback, useEffect, useRef, useState } from 'react';
import { isTerminalPaymentStatus } from '@/lib/payments/status';

/** How long the tenant's screen waits for the M-Pesa PIN entry — 3 minutes. */
export const STK_WAIT_MS = 180_000;

/** How often the client re-arms the long-poll while waiting. */
const RETRY_DELAY_MS = 1_000;

export type StkWaitPhase = 'idle' | 'waiting' | 'completed' | 'failed' | 'timeout';

export interface StkWaitState {
  phase: StkWaitPhase;
  /** Seconds left in the 3-minute wait window (only meaningful while waiting). */
  secondsLeft: number;
  /** M-Pesa receipt / transaction code once the payment completes. */
  transactionCode?: string | null;
}

const INITIAL_STATE: StkWaitState = { phase: 'idle', secondsLeft: STK_WAIT_MS / 1000 };

/**
 * Waits for the tenant to enter their M-Pesa PIN after an STK push.
 *
 * `start(paymentId)` puts the hook into a `waiting` state with a live 3-minute
 * countdown and long-polls `GET /api/payments/[id]/status` (the server holds
 * each request up to ~55s, responding the moment the payment leaves PENDING).
 *
 * Two ways the wait ends:
 *  - **PIN entered** → the payment flips to COMPLETED (provider callback or the
 *    server-side provider query) and the countdown stops immediately: the phase
 *    becomes `completed` and the caller refreshes so the payment list shows
 *    COMPLETED with its receipt code.
 *  - **Full 3 minutes elapsed** → the phase becomes `timeout`. The wait runs to
 *    completion first — it is never cut short. Payment records that stay PENDING
 *    simply remain pending in the payment history (the provider callback can
 *    still land later).
 *
 * Failures (FAILED / CANCELLED / EXPIRED / REVERSED) resolve to `failed` right
 * away as well.
 *
 * The hook auto-cleans up on unmount and aborts any in-flight poll.
 */
export function useStkWait() {
  const [state, setState] = useState<StkWaitState>(INITIAL_STATE);
  const paymentIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    paymentIdRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (paymentId: string) => {
      stop();
      paymentIdRef.current = paymentId;
      const deadline = Date.now() + STK_WAIT_MS;
      setState({ phase: 'waiting', secondsLeft: STK_WAIT_MS / 1000 });

      const tick = () => {
        const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setState((s) => (s.phase === 'waiting' ? { ...s, secondsLeft } : s));
      };
      countdownRef.current = setInterval(tick, 250);

      const poll = async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const res = await fetch(
            `/api/payments/${paymentId}/status?wait=${Math.min(55_000, Math.max(0, deadline - Date.now()))}`,
            { signal: controller.signal, cache: 'no-store' }
          );
          const result = await res.json().catch(() => null);
          if (paymentIdRef.current !== paymentId) return; // cancelled meanwhile

          const status: string | undefined = result?.data?.status;
          if (res.ok && isTerminalPaymentStatus(status)) {
            // PIN entered (or the payment failed) — stop the countdown and the
            // polling immediately instead of running the window out.
            stop();
            if (status === 'COMPLETED' || status === 'PARTIAL') {
              setState({
                phase: 'completed',
                secondsLeft: 0,
                transactionCode: result.data.transactionCode || result.data.receiptNumber || null,
              });
            } else {
              setState({ phase: 'failed', secondsLeft: 0 });
            }
            return;
          }
        } catch {
          // network error / abort — fall through and retry until the deadline
        }
        if (Date.now() < deadline && paymentIdRef.current === paymentId) {
          timerRef.current = setTimeout(poll, RETRY_DELAY_MS);
        } else {
          // The full 3 minutes elapsed with no PIN entry: let the window expire.
          stop();
          setState({ phase: 'timeout', secondsLeft: 0 });
        }
      };
      poll();
    },
    [stop]
  );

  const reset = useCallback(() => {
    stop();
    setState(INITIAL_STATE);
  }, [stop]);

  return { ...state, start, reset };
}
