export type SettleCause = 'result' | 'disconnected' | 'session-ended' | 'timed-out';

export type HungReason =
  | { kind: 'idle'; idleMs: number }
  | { kind: 'hard-timeout'; elapsedMs: number };

export interface TurnLifecycle {
  /** A turn has started. Resets settlement so a promoted follow-up can begin a fresh turn. */
  begin(at: number): void;
  /** SDK activity observed; feeds idle-hang detection. */
  noteActivity(at: number): void;
  /** Returns false when this turn was already settled, so the caller emits nothing. */
  settle(cause: SettleCause): boolean;
  /** The turn stopped without settling: clears liveness and timing, leaves settlement untouched. */
  abandon(): void;
  readonly inFlight: boolean;
  readonly settled: boolean;
  readonly settledCause: SettleCause | undefined;
  readonly startedAt: number | undefined;
  readonly lastActivityAt: number | undefined;
  hungReason(now: number, limits: { idleMs: number; hardMs: number }): HungReason | undefined;
}

export function createTurnLifecycle(): TurnLifecycle {
  let inFlight = false;
  let settled = false;
  let settledCause: SettleCause | undefined;
  let startedAt: number | undefined;
  let lastActivityAt: number | undefined;

  function begin(at: number): void {
    startedAt = at;
    lastActivityAt = at;
    settled = false;
    settledCause = undefined;
    inFlight = true;
  }

  function noteActivity(at: number): void {
    if (!inFlight) return;
    lastActivityAt = at;
  }

  function settle(cause: SettleCause): boolean {
    if (settled) return false;
    settled = true;
    settledCause = cause;
    inFlight = false;
    return true;
  }

  function abandon(): void {
    inFlight = false;
    startedAt = undefined;
    lastActivityAt = undefined;
  }

  // Idle is checked first and wins when both thresholds are exceeded,
  // mirroring runCleanupTick's precedence today.
  function hungReason(now: number, limits: { idleMs: number; hardMs: number }): HungReason | undefined {
    if (!inFlight || startedAt === undefined) return undefined;
    const lastActivity = lastActivityAt ?? startedAt;
    const idleMs = now - lastActivity;
    if (idleMs > limits.idleMs) return { kind: 'idle', idleMs };
    const elapsedMs = now - startedAt;
    if (elapsedMs > limits.hardMs) return { kind: 'hard-timeout', elapsedMs };
    return undefined;
  }

  return {
    begin,
    noteActivity,
    settle,
    abandon,
    get inFlight() {
      return inFlight;
    },
    get settled() {
      return settled;
    },
    get settledCause() {
      return settledCause;
    },
    get startedAt() {
      return startedAt;
    },
    get lastActivityAt() {
      return lastActivityAt;
    },
    hungReason,
  };
}
