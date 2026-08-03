import { describe, it, expect, vi } from 'vitest';
import { createFollowUpQueue } from './followUpQueue';

describe('createFollowUpQueue', () => {
  describe('enqueue / withdraw', () => {
    it('ignores an undefined id', () => {
      const queue = createFollowUpQueue();
      queue.enqueue(undefined);
      expect(queue.queuedCount).toBe(0);
    });

    it('removes an enqueued id on withdraw', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.enqueue('b');
      queue.withdraw('a');
      expect(queue.queuedIds).toEqual(['b']);
    });

    it('is a no-op when withdrawing undefined', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.withdraw(undefined);
      expect(queue.queuedIds).toEqual(['a']);
    });
  });

  describe('acceptNext', () => {
    it('returns undefined on an empty queue', () => {
      const queue = createFollowUpQueue();
      expect(queue.acceptNext()).toBeUndefined();
    });

    it('accepts a non-promoted entry, which later surfaces as firstLiveFollowUpClientMessageId', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('x');
      expect(queue.acceptNext()).toEqual({ clientMessageId: 'x', wasPromoted: false });
      expect(queue.settleTurn(0).firstLiveFollowUpClientMessageId).toBe('x');
    });

    it('accepts a promoted entry without adding it to accepted', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.settleTurn(1);
      expect(queue.acceptNext()).toEqual({ clientMessageId: 'a', wasPromoted: true });
      expect(queue.settleTurn(0).firstLiveFollowUpClientMessageId).toBeUndefined();
    });
  });

  describe('settleTurn', () => {
    it('reports nothing queued and nothing pending', () => {
      const queue = createFollowUpQueue();
      expect(queue.settleTurn(0)).toEqual({
        hasQueuedFollowUp: false,
        nextQueuedClientMessageId: undefined,
        firstLiveFollowUpClientMessageId: undefined,
        steeredClientMessageIds: [],
      });
    });

    it('steers all pending ids in order when the transport count is 0', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.enqueue('b');
      const settlement = queue.settleTurn(0);
      expect(settlement.hasQueuedFollowUp).toBe(false);
      expect(settlement.steeredClientMessageIds).toEqual(['a', 'b']);
      expect(settlement.firstLiveFollowUpClientMessageId).toBe('a');
      expect(queue.queuedCount).toBe(0);
    });

    it('promotes the head and retains it across the boundary when the transport count is > 0', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('pre');
      queue.acceptNext();
      queue.enqueue('a');

      const first = queue.settleTurn(1);
      expect(first.hasQueuedFollowUp).toBe(true);
      expect(first.nextQueuedClientMessageId).toBe('a');
      expect(first.steeredClientMessageIds).toEqual([]);
      expect(first.firstLiveFollowUpClientMessageId).toBe('pre');
      expect(queue.queuedIds).toEqual(['a']);

      expect(queue.acceptNext()).toEqual({ clientMessageId: 'a', wasPromoted: true });

      const second = queue.settleTurn(0);
      expect(second.firstLiveFollowUpClientMessageId).toBeUndefined();
    });

    it('reports no nextQueuedClientMessageId when the transport count is > 0 but no ids are pending', () => {
      const queue = createFollowUpQueue();
      const settlement = queue.settleTurn(1);
      expect(settlement.hasQueuedFollowUp).toBe(true);
      expect(settlement.nextQueuedClientMessageId).toBeUndefined();
    });

    it('prefers an accepted id over a queued one for firstLiveFollowUpClientMessageId', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('x');
      queue.acceptNext();
      queue.enqueue('y');
      const settlement = queue.settleTurn(0);
      expect(settlement.firstLiveFollowUpClientMessageId).toBe('x');
    });
  });

  describe('cancelLast', () => {
    it('returns none-queued when nothing is queued', () => {
      const queue = createFollowUpQueue();
      const dropFromTransport = vi.fn(() => true);
      expect(queue.cancelLast('a', dropFromTransport)).toEqual({
        ok: false,
        reason: 'none-queued',
        clientMessageId: 'a',
      });
      expect(dropFromTransport).not.toHaveBeenCalled();
    });

    it('returns not-last without calling dropFromTransport when the requested id is not the last queued', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.enqueue('b');
      const dropFromTransport = vi.fn(() => true);
      expect(queue.cancelLast('a', dropFromTransport)).toEqual({
        ok: false,
        reason: 'not-last',
        clientMessageId: 'a',
      });
      expect(dropFromTransport).not.toHaveBeenCalled();
      expect(queue.queuedIds).toEqual(['a', 'b']);
    });

    it('returns already-sent when the transport already pulled it', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      const dropFromTransport = vi.fn(() => false);
      expect(queue.cancelLast(undefined, dropFromTransport)).toEqual({
        ok: false,
        reason: 'already-sent',
        clientMessageId: 'a',
      });
      expect(dropFromTransport).toHaveBeenCalledTimes(1);
      expect(queue.queuedIds).toEqual(['a']);
    });

    it('cancels the last queued id on success', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.enqueue('b');
      const dropFromTransport = vi.fn(() => true);
      expect(queue.cancelLast(undefined, dropFromTransport)).toEqual({ ok: true, clientMessageId: 'b' });
      expect(dropFromTransport).toHaveBeenCalledTimes(1);
      expect(queue.queuedIds).toEqual(['a']);
    });
  });

  describe('cancelAll', () => {
    it('stops at the first falsy dropFromTransport and returns popped ids in pop order', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.enqueue('b');
      queue.enqueue('c');
      let calls = 0;
      const dropFromTransport = vi.fn(() => {
        calls += 1;
        return calls <= 2;
      });
      expect(queue.cancelAll(dropFromTransport)).toEqual(['c', 'b']);
      expect(dropFromTransport).toHaveBeenCalledTimes(3);
      expect(queue.queuedIds).toEqual(['a']);
    });
  });

  describe('clear', () => {
    it('returns the queued ids and empties queued, accepted, and promoted', () => {
      const queue = createFollowUpQueue();
      queue.enqueue('a');
      queue.settleTurn(1);
      queue.enqueue('b');

      expect(queue.clear()).toEqual(['a', 'b']);
      expect(queue.queuedCount).toBe(0);

      queue.enqueue('a');
      expect(queue.acceptNext()).toEqual({ clientMessageId: 'a', wasPromoted: false });
    });
  });
});
