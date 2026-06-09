/**
 * Shared fakes for the Claude Agent SDK `query()` stream.
 *
 * `createControlledSdkStream()` returns an async iterable the test feeds
 * message-by-message via the handle, so SUTs that consume `query()` can be
 * driven through real lifecycle flows (init, chunks, result, errors).
 *
 * Usage (see src/main/claude/streaming/StreamingSession.test.ts):
 *   const { iterable, handle } = createControlledSdkStream();
 *   // wire `iterable` into a vi.mock of '@anthropic-ai/claude-agent-sdk',
 *   // then handle.emit(msg) / handle.end() / handle.fail(err) from the test.
 */
import { vi } from 'vitest';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export interface SdkStreamHandle {
  /** Deliver the next SDK message to the consumer. */
  emit: (msg: SDKMessage) => void;
  /** End the stream normally. */
  end: () => void;
  /** Make the stream throw on its next read. */
  fail: (error: Error) => void;
}

export function createControlledSdkStream(): {
  iterable: AsyncIterable<SDKMessage>;
  handle: SdkStreamHandle;
} {
  const buffer: SDKMessage[] = [];
  let waiter: ((msg: SDKMessage | null) => void) | null = null;
  let closed = false;
  let pendingError: Error | null = null;

  const wake = (msg: SDKMessage | null) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w(msg);
    } else if (msg !== null) {
      buffer.push(msg);
    }
  };

  const handle: SdkStreamHandle = {
    emit: (msg) => wake(msg),
    end: () => {
      closed = true;
      wake(null);
    },
    fail: (error) => {
      pendingError = error;
      wake(null);
    },
  };

  const iterable: AsyncIterable<SDKMessage> = {
    [Symbol.asyncIterator]: async function* () {
      while (true) {
        if (pendingError !== null) {
          const err = pendingError;
          throw err;
        }
        if (buffer.length > 0) {
          yield buffer.shift()!;
          continue;
        }
        if (closed) return;
        const next = await new Promise<SDKMessage | null>((resolve) => {
          waiter = resolve;
        });
        if (pendingError !== null) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- captured Error type widens after await
          throw pendingError;
        }
        if (next === null) return;
        yield next;
      }
    },
  };

  return { iterable, handle };
}

/**
 * The control methods the SDK attaches to the object returned by `query()`.
 * Spread onto a controlled stream when mocking the SDK module.
 */
export function createQueryControls() {
  return {
    interrupt: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    setPermissionMode: vi.fn().mockResolvedValue(undefined),
    mcpServerStatus: vi.fn().mockResolvedValue([]),
  };
}
