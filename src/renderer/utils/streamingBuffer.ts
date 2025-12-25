/**
 * StreamingBuffer - Accumulates streaming chunks with throttled flushing.
 *
 * This utility reduces React re-renders by batching rapid streaming updates.
 * Instead of updating state for every chunk, chunks are accumulated in a buffer
 * and flushed at a throttled interval.
 *
 * Usage with Zustand stores:
 * ```typescript
 * // Create buffer outside store
 * const buffer = createStreamingBuffer(50);
 *
 * // In store creation:
 * create((set) => ({
 *   appendChunk: (chunk) => buffer.append(chunk, (content) => {
 *     set((state) => ({ streamingContent: state.streamingContent + content }));
 *   }),
 *   finalizeMessage: () => {
 *     const remaining = buffer.flush();
 *     // ... use remaining content
 *   },
 * }));
 * ```
 */

/** Default throttle interval in milliseconds */
export const DEFAULT_STREAMING_THROTTLE_MS = 50;

export interface StreamingBuffer {
  /**
   * Append a chunk to the buffer.
   * Schedules a throttled flush if not already scheduled.
   * @param chunk - The text chunk to append
   * @param onFlush - Callback invoked when buffer is automatically flushed
   */
  append: (chunk: string, onFlush: (content: string) => void) => void;

  /**
   * Immediately flush and return all buffered content.
   * Cancels any pending throttled flush.
   */
  flush: () => string;

  /**
   * Clear the buffer without returning content.
   * Useful for error recovery or cancellation.
   */
  clear: () => void;
}

/**
 * Create a new streaming buffer with throttled flushing.
 * The onFlush callback is provided per-append to allow access to store's set() function.
 *
 * @param throttleMs - Interval between automatic flushes (default: 50ms)
 */
export function createStreamingBuffer(
  throttleMs: number = DEFAULT_STREAMING_THROTTLE_MS
): StreamingBuffer {
  let buffer = '';
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentOnFlush: ((content: string) => void) | null = null;

  const scheduleFlush = () => {
    if (!flushTimeout) {
      flushTimeout = setTimeout(() => {
        const content = buffer;
        buffer = '';
        flushTimeout = null;

        if (content && currentOnFlush) {
          currentOnFlush(content);
        }
      }, throttleMs);
    }
  };

  const cancelPendingFlush = () => {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
  };

  return {
    append: (chunk: string, onFlush: (content: string) => void) => {
      buffer += chunk;
      currentOnFlush = onFlush;
      scheduleFlush();
    },

    flush: () => {
      cancelPendingFlush();
      const content = buffer;
      buffer = '';
      return content;
    },

    clear: () => {
      cancelPendingFlush();
      buffer = '';
      currentOnFlush = null;
    },
  };
}
