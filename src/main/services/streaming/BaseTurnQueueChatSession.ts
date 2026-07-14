import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import type { IChatSession } from './IChatSession';

export type SessionEndReason = 'completed' | 'error' | 'closed';

/**
 * BaseTurnQueueChatSession - Shared turn-queue lifecycle for the non-Claude
 * chat backends (Codex, pi).
 *
 * Owns the async queue/close machinery both transports had duplicated: the
 * serialized turn queue, the single-flight `processing` guard, the drain loop
 * that emits one user marker per queued turn, and the re-entrant `close()`
 * teardown (flag sets -> abort -> await the in-flight turn -> dispose ->
 * session-closed). Concrete subclasses supply only the transport seam:
 * `executeTurn` runs one turn over their SDK (owning its own per-turn state and
 * error handling), and the two `close()` hooks abort the in-flight turn and
 * release transport resources.
 *
 * The Claude streaming-input session intentionally stays off this base — it
 * steers mid-turn rather than queueing discrete turns. See
 * `src/main/services/agents/CLAUDE.md`.
 */
export abstract class BaseTurnQueueChatSession<TTurn extends object> implements IChatSession {
  protected active = false;
  protected ready = false;
  protected closing = false;
  protected processing = false;
  protected closePromise: Promise<void> | null = null;
  protected turnPromise: Promise<void> | null = null;
  protected queue: TTurn[] = [];

  private readonly onMessage: (msg: unknown) => void;
  private readonly onSessionEnd?: (reason: SessionEndReason, error?: Error) => void;

  constructor(
    onMessage: (msg: unknown) => void,
    onSessionEnd?: (reason: SessionEndReason, error?: Error) => void,
  ) {
    this.onMessage = onMessage;
    this.onSessionEnd = onSessionEnd;
  }

  abstract start(initialMessage: string | ContentBlockParam[]): Promise<void>;
  abstract send(text: string): void;
  abstract sendUserContent(content: ContentBlockParam[]): void;
  abstract interrupt(): Promise<void>;

  /**
   * Run one turn over the transport. Owns its per-turn state and its
   * transport-specific error handling; the base owns the `processing`
   * guard/set/reset around it.
   */
  protected abstract executeTurn(turn: TTurn): Promise<void>;

  /**
   * Abort the in-flight turn during `close()`. Awaited only when it returns a
   * promise, so a synchronous hook adds no microtask and a rejecting async hook
   * must swallow its own rejection.
   */
  protected abstract abortActiveTurn(): void | Promise<void>;

  /** Release transport resources after the final turn has unwound. */
  protected abstract disposeAfterClose(): void;

  pendingQueuedCount(): number {
    return this.queue.length;
  }

  cancelLastQueued(): TTurn | null {
    return this.queue.pop() ?? null;
  }

  isActive(): boolean {
    return this.active;
  }

  isReady(): boolean {
    return this.ready && !this.closing;
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = (async () => {
      this.closing = true;
      this.ready = false;
      this.queue = [];
      const pending = this.abortActiveTurn();
      if (pending) await pending;
      try {
        await this.turnPromise;
      } catch {
        // Ignore errors during close.
      }
      this.active = false;
      this.processing = false;
      this.disposeAfterClose();
      this.onSessionEnd?.('closed');
    })();
    try {
      await this.closePromise;
    } finally {
      this.closePromise = null;
    }
  }

  protected enqueue(turn: TTurn): void {
    if (!this.active || !this.ready) {
      throw new Error('Session is not ready');
    }
    this.queue.push(turn);
    if (!this.processing) {
      this.turnPromise = this.drainQueue();
    }
  }

  protected async runTurnAndDrain(turn: TTurn): Promise<void> {
    await this.runTurn(turn);
    await this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    while (!this.closing && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return;
      this.onMessage({
        type: 'user',
        message: { role: 'user', content: [] },
      });
      await this.runTurn(next);
    }
  }

  private async runTurn(turn: TTurn): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.executeTurn(turn);
    } finally {
      this.processing = false;
    }
  }
}
