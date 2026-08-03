export interface AcceptedFollowUp {
  clientMessageId: string;
  wasPromoted: boolean;
}

export interface TurnSettlement {
  hasQueuedFollowUp: boolean;
  nextQueuedClientMessageId?: string;
  firstLiveFollowUpClientMessageId?: string;
  /** Queued entries the SDK steered into the turn that just ended, in order. */
  steeredClientMessageIds: string[];
}

export type CancelOutcome =
  | { ok: true; clientMessageId: string }
  | { ok: false; reason: 'none-queued' | 'not-last' | 'already-sent'; clientMessageId?: string };

export interface FollowUpQueue {
  enqueue(clientMessageId: string | undefined): void;
  withdraw(clientMessageId: string | undefined): void;
  readonly queuedCount: number;
  readonly queuedIds: readonly string[];
  acceptNext(): AcceptedFollowUp | undefined;
  settleTurn(stillQueuedInTransport: number): TurnSettlement;
  cancelLast(requestedClientMessageId: string | undefined, dropFromTransport: () => boolean): CancelOutcome;
  cancelAll(dropFromTransport: () => boolean): string[];
  clear(): string[];
}

export function createFollowUpQueue(): FollowUpQueue {
  let queued: string[] = [];
  let accepted: string[] = [];
  const promoted = new Set<string>();

  function enqueue(clientMessageId: string | undefined): void {
    if (!clientMessageId) return;
    queued.push(clientMessageId);
  }

  function withdraw(clientMessageId: string | undefined): void {
    if (!clientMessageId) return;
    queued = queued.filter((id) => id !== clientMessageId);
  }

  function acceptNext(): AcceptedFollowUp | undefined {
    if (queued.length === 0) return undefined;
    const clientMessageId = queued.shift()!;
    const wasPromoted = promoted.delete(clientMessageId);
    if (!wasPromoted) {
      accepted.push(clientMessageId);
    }
    return { clientMessageId, wasPromoted };
  }

  function settleTurn(stillQueuedInTransport: number): TurnSettlement {
    const hasQueuedFollowUp = stillQueuedInTransport > 0;
    const nextQueuedClientMessageId = hasQueuedFollowUp ? queued[0] : undefined;
    // Must be read before any draining below: once a turn steers queued
    // entries into `accepted`, they'd otherwise get double-counted here.
    const firstLiveFollowUpClientMessageId = accepted[0] ?? (!hasQueuedFollowUp ? queued[0] : undefined);

    let steeredClientMessageIds: string[] = [];
    if (!hasQueuedFollowUp && queued.length > 0) {
      steeredClientMessageIds = [...queued];
      for (const clientMessageId of steeredClientMessageIds) {
        accepted.push(clientMessageId);
      }
      queued = [];
    }

    if (hasQueuedFollowUp && nextQueuedClientMessageId) {
      promoted.add(nextQueuedClientMessageId);
    }

    accepted = [];
    if (!hasQueuedFollowUp) {
      promoted.clear();
    }

    return {
      hasQueuedFollowUp,
      nextQueuedClientMessageId,
      firstLiveFollowUpClientMessageId,
      steeredClientMessageIds,
    };
  }

  function cancelLast(requestedClientMessageId: string | undefined, dropFromTransport: () => boolean): CancelOutcome {
    if (queued.length === 0) {
      return { ok: false, reason: 'none-queued', clientMessageId: requestedClientMessageId };
    }

    const last = queued[queued.length - 1];
    const clientMessageId = requestedClientMessageId ?? last;
    if (requestedClientMessageId && requestedClientMessageId !== last) {
      return { ok: false, reason: 'not-last', clientMessageId };
    }

    if (!dropFromTransport()) {
      return { ok: false, reason: 'already-sent', clientMessageId };
    }

    queued.pop();
    return { ok: true, clientMessageId };
  }

  function cancelAll(dropFromTransport: () => boolean): string[] {
    const cancelled: string[] = [];
    while (queued.length > 0 && dropFromTransport()) {
      const clientMessageId = queued.pop();
      if (clientMessageId) cancelled.push(clientMessageId);
    }
    return cancelled;
  }

  function clear(): string[] {
    const cleared = [...queued];
    queued = [];
    accepted = [];
    promoted.clear();
    return cleared;
  }

  return {
    enqueue,
    withdraw,
    get queuedCount() {
      return queued.length;
    },
    get queuedIds() {
      return [...queued];
    },
    acceptNext,
    settleTurn,
    cancelLast,
    cancelAll,
    clear,
  };
}
