import { useCallback, useEffect, useRef, useState } from 'react';
import { isTerminalPaymentStatus } from '@/lib/payments/status';

/** How long the tenant's screen waits for the M-Pesa PIN entry — 2 minutes. */
export const STK_WAIT_MS = 120_000;

/** How often the client re-arms the long-poll while waiting. */
const RETRY_DELAY_MS = 1_000;

export type StkWaitPhase = 'idle' | 'waiting' | 'completed' | 'failed' | 'timeout';

export interface StkWaitState {
  phase: StkWaitPhase;
  /** Seconds left in the 2-minute wait window (only meaningful while waiting). */
  secondsLeft: number;
  /** M-Pesa receipt / transaction code once the payment completes. */
  transactionCode?: string | null;
}

const INITIAL_STATE: StkWaitState = { phase: 'idle', secondsLeft: STK_WAIT_MS / 1000 };

/**
 * Waits for the tenant to enter their M-Pesa PIN after an STK push.
 *
 * `start(paymentId)` puts the hook into a `waiting` state with a live 2-minute
 * countdown and long-polls `GET /api/payments/[id]/status` (the server holds
 * each request up to ~55s, responding the moment the payment leaves PENDING).
 * The hook resolves to `completed` / `failed`, or `timeout` after the full
 * 2 minutes — payment records that stay PENDING simply remain pending in the
 * payment history (the provider callback can still land later).
 *
 * The hook auto-cleans up on unmount and aborts any in-flight poll.
 */
export function useStkWait() {
  const [state, setState] = useState<StkWaitState>(INITIAL_STATE);
  const paymentIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
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
      const countdown = setInterval(tick, 250);

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
            clearInterval(countdown);
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
          clearInterval(countdown);
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
