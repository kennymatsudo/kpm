import { describe, it, expect, vi } from 'vitest';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import { BaseTurnQueueChatSession, type SessionEndReason } from './BaseTurnQueueChatSession';

interface FakeTurn {
  label: string;
}

type AbortMode = 'sync' | 'async-reject';

/**
 * Minimal transport that gates each turn on a per-label deferred promise, so a
 * test can hold a turn in-flight, queue more, and release them in a controlled
 * order to trace the base's queue/close lifecycle.
 */
class FakeTurnQueueChatSession extends BaseTurnQueueChatSession<FakeTurn> {
  readonly trace: string[] = [];
  readonly executedLabels: string[] = [];
  abortCalls = 0;
  disposeCalls = 0;
  private readonly gates = new Map<string, { promise: Promise<void>; resolve: () => void }>();

  constructor(
    onMessage: (msg: unknown) => void,
    onSessionEnd: ((reason: SessionEndReason, error?: Error) => void) | undefined,
    private readonly abortMode: AbortMode = 'sync',
  ) {
    super(onMessage, onSessionEnd);
  }

  async start(initialMessage: string | ContentBlockParam[]): Promise<void> {
    this.active = true;
    this.ready = true;
    const label = typeof initialMessage === 'string' ? initialMessage : 'initial';
    this.turnPromise = this.runTurnAndDrain({ label });
  }

  send(text: string): void {
    this.enqueue({ label: text });
  }

  sendUserContent(content: ContentBlockParam[]): void {
    this.enqueue({ label: `content:${content.length}` });
  }

  interrupt(): Promise<void> {
    return Promise.resolve();
  }

  /** Release the gate for a turn label; safe to call before or after the turn starts. */
  releaseTurn(label: string): void {
    this.gateFor(label).resolve();
  }

  /** Await the full drain kicked off by `start`. */
  async waitForIdle(): Promise<void> {
    await this.turnPromise;
  }

  private gateFor(label: string): { promise: Promise<void>; resolve: () => void } {
    let gate = this.gates.get(label);
    if (!gate) {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      gate = { promise, resolve };
      this.gates.set(label, gate);
    }
    return gate;
  }

  protected async executeTurn(turn: FakeTurn): Promise<void> {
    this.trace.push(`turn-start:${turn.label}`);
    await this.gateFor(turn.label).promise;
    this.executedLabels.push(turn.label);
    this.trace.push(`turn-end:${turn.label}`);
  }

  protected abortActiveTurn(): void | Promise<void> {
    this.abortCalls += 1;
    this.trace.push('abort');
    if (this.abortMode === 'async-reject') {
      return (async () => {
        try {
          await Promise.reject(new Error('abort failed'));
        } catch {
          // The pi adapter swallows its own abort rejection; mirror that here.
        }
      })();
    }
  }

  protected disposeAfterClose(): void {
    this.disposeCalls += 1;
    this.trace.push('dispose');
  }
}

describe('BaseTurnQueueChatSession', () => {
  it('drains queued turns FIFO and emits one user marker per queued turn', async () => {
    const onMessage = vi.fn();
    const session = new FakeTurnQueueChatSession(onMessage, vi.fn());

    await session.start('initial');

    session.send('a');
    session.send('b');
    expect(session.pendingQueuedCount()).toBe(2);

    session.releaseTurn('initial');
    session.releaseTurn('a');
    session.releaseTurn('b');
    await session.waitForIdle();

    expect(session.executedLabels).toEqual(['initial', 'a', 'b']);

    const userMarkers = (onMessage.mock.calls as unknown[][])
      .map((call) => call[0])
      .filter(
        (msg): msg is { type: string } =>
          Boolean(msg) && typeof msg === 'object' && (msg as { type?: unknown }).type === 'user',
      );
    expect(userMarkers).toHaveLength(2);
    expect(onMessage).toHaveBeenCalledWith({ type: 'user', message: { role: 'user', content: [] } });
  });

  it('cancelLastQueued pops the most recent queued turn and updates pendingQueuedCount', async () => {
    const session = new FakeTurnQueueChatSession(vi.fn(), vi.fn());

    await session.start('initial');

    session.send('a');
    session.send('b');
    expect(session.pendingQueuedCount()).toBe(2);

    expect(session.cancelLastQueued()).toEqual({ label: 'b' });
    expect(session.pendingQueuedCount()).toBe(1);
    expect(session.cancelLastQueued()).toEqual({ label: 'a' });
    expect(session.pendingQueuedCount()).toBe(0);
    expect(session.cancelLastQueued()).toBeNull();

    session.releaseTurn('initial');
    await session.waitForIdle();
  });

  it('aborts the in-flight turn before awaiting it, then disposes after it settles', async () => {
    const onSessionEnd = vi.fn();
    const session = new FakeTurnQueueChatSession(vi.fn(), onSessionEnd);

    await session.start('initial');

    const closePromise = session.close();

    // close() ran synchronously through abortActiveTurn() (a void hook, not
    // awaited) and suspended at `await turnPromise` — so the abort is already
    // recorded while the turn is still in flight.
    expect(session.abortCalls).toBe(1);
    expect(session.trace).toContain('abort');
    expect(session.trace).not.toContain('turn-end:initial');
    expect(session.disposeCalls).toBe(0);

    session.releaseTurn('initial');
    await closePromise;

    expect(session.trace.indexOf('abort')).toBeLessThan(session.trace.indexOf('turn-end:initial'));
    expect(session.trace.indexOf('turn-end:initial')).toBeLessThan(session.trace.indexOf('dispose'));
    expect(session.disposeCalls).toBe(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith('closed');
  });

  it('dedupes concurrent close() calls into one settle and one closed callback', async () => {
    const onSessionEnd = vi.fn();
    const session = new FakeTurnQueueChatSession(vi.fn(), onSessionEnd);

    await session.start('initial');

    const first = session.close();
    const second = session.close();

    session.releaseTurn('initial');
    await Promise.all([first, second]);

    expect(session.abortCalls).toBe(1);
    expect(session.disposeCalls).toBe(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith('closed');
  });

  it('completes close() cleanly when the abort hook rejects and swallows internally', async () => {
    const onSessionEnd = vi.fn();
    const session = new FakeTurnQueueChatSession(vi.fn(), onSessionEnd, 'async-reject');

    await session.start('initial');

    const closePromise = session.close();
    session.releaseTurn('initial');

    await expect(closePromise).resolves.toBeUndefined();
    expect(session.abortCalls).toBe(1);
    expect(session.disposeCalls).toBe(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith('closed');
  });
});
