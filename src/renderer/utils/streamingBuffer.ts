/**
 * KeyedStreamingBuffer - Accumulates streaming chunks per session key with
 * throttled flushing.
 *
 * This utility reduces React re-renders by batching rapid streaming updates.
 * Instead of updating state for every chunk, chunks are accumulated per
 * session and flushed at a throttled interval. Each session key gets its own
 * pending buffer and timer, so concurrent sessions never share or clobber
 * each other's buffered text.
 *
 * Usage with Zustand stores:
 * ```typescript
 * // Create buffer outside store
 * const buffer = createKeyedStreamingBuffer();
 *
 * // In store creation:
 * create((set) => ({
 *   appendChunk: (sessionId, chunk, intervalMs) => buffer.append(sessionId, chunk, (content) => {
 *     set((state) => ({ streamingContent: state.streamingContent + content }));
 *   }, intervalMs),
 *   finalizeMessage: (sessionId) => {
 *     const remaining = buffer.flush(sessionId);
 *     // ... use remaining content
 *   },
 * }));
 * ```
 */

/** Throttle interval for the currently viewed session. */
export const VIEWED_STREAMING_THROTTLE_MS = 50;

/** Throttle interval for sessions streaming in the background (not viewed). */
export const BACKGROUND_STREAMING_THROTTLE_MS = 250;

export interface KeyedStreamingBuffer {
  /**
   * Append a chunk to the buffer for `key`.
   * Schedules a throttled flush if not already scheduled.
   * @param key - The session id this chunk belongs to
   * @param chunk - The text chunk to append
   * @param onFlush - Callback invoked when this key's buffer is automatically flushed
   * @param intervalMs - Interval before the automatic flush fires
   */
  append: (key: string, chunk: string, onFlush: (content: string) => void, intervalMs: number) => void;

  /**
   * Immediately flush and return all buffered content for `key`.
   * Cancels any pending throttled flush for that key.
   */
  flush: (key: string) => string;

  /**
   * Clear the buffer for `key` without returning content.
   * Useful for error recovery or cancellation.
   */
  clear: (key: string) => void;

  /** Clear every key's buffer. Used when resetting the whole store. */
  clearAll: () => void;
}

interface BufferEntry {
  pending: string;
  timer: ReturnType<typeof setTimeout> | null;
  onFlush: ((content: string) => void) | null;
}

/**
 * Create a new keyed streaming buffer with per-key throttled flushing.
 * The onFlush callback is provided per-append to allow access to the store's
 * set() function; the interval is provided per-append so the same key can be
 * throttled differently over time (e.g. viewed vs. backgrounded).
 */
export function createKeyedStreamingBuffer(): KeyedStreamingBuffer {
  const buffers = new Map<string, BufferEntry>();

  return {
    append: (key, chunk, onFlush, intervalMs) => {
      let entry = buffers.get(key);
      if (!entry) {
        entry = { pending: '', timer: null, onFlush: null };
        buffers.set(key, entry);
      }

      entry.pending += chunk;
      entry.onFlush = onFlush;

      if (!entry.timer) {
        entry.timer = setTimeout(() => {
          const content = entry.pending;
          const flushCallback = entry.onFlush;
          buffers.delete(key);
          if (content && flushCallback) {
            flushCallback(content);
          }
        }, intervalMs);
      }
    },

    flush: (key) => {
      const entry = buffers.get(key);
      if (!entry) return '';

      if (entry.timer) {
        clearTimeout(entry.timer);
      }

      const content = entry.pending;
      buffers.delete(key);
      return content;
    },

    clear: (key) => {
      const entry = buffers.get(key);
      if (!entry) return;
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      buffers.delete(key);
    },

    clearAll: () => {
      for (const entry of buffers.values()) {
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
      }
      buffers.clear();
    },
  };
}
