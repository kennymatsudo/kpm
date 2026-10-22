/**
 * AsyncMessageQueue - Push-to-pull adapter for bridging user input to SDK generator.
 *
 * The Claude SDK's streaming input pattern uses an async generator that yields messages.
 * This queue allows external code (IPC handlers) to push messages that the generator
 * then pulls and yields to the SDK.
 *
 * Design:
 * - push(): Called when user sends a message (from IPC handler)
 * - pull(): Called from async generator, awaits next message
 * - close(): Signals end of conversation, causes pull() to return null
 * - pause()/resume(): While paused, pushed messages wait in the queue instead
 *   of reaching a waiting pull(), so they can still be cancelled
 * - releasePending(): Lets the messages waiting right now through a pause
 *
 * Thread safety: Single-threaded (Node.js event loop), no explicit locking needed.
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';

/**
 * User message structure for streaming input.
 * This matches what the SDK expects from the async generator. `content`
 * accepts the full SDK content-block union so callers can attach images,
 * documents, and text in a single message.
 */
export interface StreamingUserMessage {
  type: 'user';
  session_id: string;
  message: {
    role: 'user';
    content: string | ContentBlockParam[];
  };
  parent_tool_use_id: string | null;
}

/** Keep user input cancellable until the SDK pulls it. */
export class AsyncMessageQueue {
  private queue: StreamingUserMessage[] = [];
  private waitingResolver: ((msg: StreamingUserMessage | null) => void) | null = null;
  private closed = false;
  private paused = false;
  /** How many queued messages may leave while paused (set by releasePending). */
  private releasedCount = 0;

  /**
   * Push a message to the queue.
   * If a pull() is waiting and the queue is not paused, immediately resolves it.
   * Otherwise, queues the message for a later pull().
   *
   * @throws If the queue has been closed
   */
  push(msg: StreamingUserMessage): void {
    if (this.closed) {
      throw new Error('Cannot push to closed queue');
    }

    this.queue.push(msg);
    this.deliverToWaiter();
  }

  /**
   * Pull the next message from the queue.
   * If a message may leave, returns it immediately.
   * If the queue is closed, returns null.
   * Otherwise, waits until a message may leave.
   *
   * @returns The next message, or null if the queue is closed
   */
  async pull(): Promise<StreamingUserMessage | null> {
    if (this.canDeliver()) {
      return this.takeNext();
    }

    if (this.closed) {
      return null;
    }

    return new Promise(resolve => {
      this.waitingResolver = resolve;
    });
  }

  /** Hold pushed messages in the queue until resume() or releasePending(). */
  pause(): void {
    this.paused = true;
  }

  /** Stop holding messages; a waiting pull() gets the next one at once. */
  resume(): void {
    this.paused = false;
    this.releasedCount = 0;
    this.deliverToWaiter();
  }

  /** Let every message queued right now through, while staying paused for later pushes. */
  releasePending(): void {
    this.releasedCount = this.queue.length;
    this.deliverToWaiter();
  }

  private canDeliver(): boolean {
    return this.queue.length > 0 && (!this.paused || this.releasedCount > 0);
  }

  private takeNext(): StreamingUserMessage {
    if (this.paused) this.releasedCount--;
    return this.queue.shift()!;
  }

  /** Resolve a waiting pull only when the queue permits delivery. */
  private deliverToWaiter(): void {
    if (!this.waitingResolver || !this.canDeliver()) return;
    const resolver = this.waitingResolver;
    this.waitingResolver = null;
    resolver(this.takeNext());
  }

  /**
   * Close the queue, signaling that no more messages will be pushed.
   * Any waiting pull() will return null.
   * Future pull() calls will return null immediately.
   */
  close(): void {
    this.closed = true;

    // If a pull() is waiting, resolve it with null
    if (this.waitingResolver) {
      const resolver = this.waitingResolver;
      this.waitingResolver = null;
      resolver(null);
    }
  }

  /**
   * Remove and return the most recently pushed message that has not yet been
   * pulled by the generator. Used to cancel a queued follow-up before the
   * SDK consumes it. Returns null if the queue is empty.
   *
   * Note: messages already pulled by `pull()` cannot be cancelled — the SDK
   * has them in-flight.
   */
  cancelLast(): StreamingUserMessage | null {
    const cancelled = this.queue.pop() ?? null;
    this.releasedCount = Math.min(this.releasedCount, this.queue.length);
    return cancelled;
  }

  /**
   * Reset the queue to initial state.
   * Used when restarting a session.
   */
  reset(): void {
    this.queue = [];
    this.waitingResolver = null;
    this.closed = false;
    this.paused = false;
    this.releasedCount = 0;
  }

  /**
   * Check if the queue has been closed.
   */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get the number of messages waiting in the queue.
   */
  get pendingCount(): number {
    return this.queue.length;
  }

  /**
   * Check if there's a pull() waiting for a message.
   */
  get isWaiting(): boolean {
    return this.waitingResolver !== null;
  }
}
