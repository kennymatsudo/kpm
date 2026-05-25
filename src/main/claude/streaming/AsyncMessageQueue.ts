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

export class AsyncMessageQueue {
  private queue: StreamingUserMessage[] = [];
  private waitingResolver: ((msg: StreamingUserMessage | null) => void) | null = null;
  private closed = false;

  /**
   * Push a message to the queue.
   * If a pull() is waiting, immediately resolves it.
   * Otherwise, queues the message for the next pull().
   *
   * @throws If the queue has been closed
   */
  push(msg: StreamingUserMessage): void {
    if (this.closed) {
      throw new Error('Cannot push to closed queue');
    }

    if (this.waitingResolver) {
      // A pull() is waiting, resolve it immediately
      const resolver = this.waitingResolver;
      this.waitingResolver = null;
      resolver(msg);
    } else {
      // No pull() waiting, queue the message
      this.queue.push(msg);
    }
  }

  /**
   * Pull the next message from the queue.
   * If a message is available, returns it immediately.
   * If the queue is empty, waits for the next push().
   * If the queue is closed, returns null.
   *
   * @returns The next message, or null if the queue is closed
   */
  async pull(): Promise<StreamingUserMessage | null> {
    // If there are queued messages, return the first one
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }

    // If closed and no messages, return null
    if (this.closed) {
      return null;
    }

    // Wait for the next push()
    return new Promise(resolve => {
      this.waitingResolver = resolve;
    });
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
   * SDK consumes it. Returns null if the queue is empty or only the
   * currently-streaming turn's seed message remains pulled.
   *
   * Note: messages already pulled by `pull()` cannot be cancelled — the SDK
   * has them in-flight.
   */
  cancelLast(): StreamingUserMessage | null {
    if (this.queue.length === 0) return null;
    return this.queue.pop() ?? null;
  }

  /**
   * Reset the queue to initial state.
   * Used when restarting a session.
   */
  reset(): void {
    this.queue = [];
    this.waitingResolver = null;
    this.closed = false;
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
