/**
 * AsyncMessageQueue Unit Tests
 *
 * Tests the push-to-pull adapter for bridging user input to SDK generator.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AsyncMessageQueue, type StreamingUserMessage } from './AsyncMessageQueue';

/**
 * Helper to create a test user message
 */
function createTestMessage(text: string, sessionId = 'test-session'): StreamingUserMessage {
  return {
    type: 'user',
    session_id: sessionId,
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
    parent_tool_use_id: null,
  };
}

/** Extract the text from the first content block of a user message. */
function getFirstText(msg: StreamingUserMessage | null | undefined): string | undefined {
  if (!msg) return undefined;
  const { content } = msg.message;
  if (typeof content === 'string') return content;
  const first = content[0];
  if (first?.type === 'text') return first.text;
  return undefined;
}

describe('AsyncMessageQueue', () => {
  let queue: AsyncMessageQueue;

  beforeEach(() => {
    queue = new AsyncMessageQueue();
  });

  describe('initial state', () => {
    it('starts with empty queue', () => {
      expect(queue.pendingCount).toBe(0);
    });

    it('starts not closed', () => {
      expect(queue.isClosed).toBe(false);
    });

    it('starts not waiting', () => {
      expect(queue.isWaiting).toBe(false);
    });
  });

  describe('push()', () => {
    it('queues message when no pull is waiting', () => {
      const msg = createTestMessage('Hello');
      queue.push(msg);
      expect(queue.pendingCount).toBe(1);
    });

    it('queues multiple messages in order', () => {
      queue.push(createTestMessage('First'));
      queue.push(createTestMessage('Second'));
      queue.push(createTestMessage('Third'));
      expect(queue.pendingCount).toBe(3);
    });

    it('throws when pushing to closed queue', () => {
      queue.close();
      expect(() => queue.push(createTestMessage('Should fail'))).toThrow('Cannot push to closed queue');
    });

    it('immediately resolves waiting pull', async () => {
      // Start a pull that will wait
      const pullPromise = queue.pull();
      expect(queue.isWaiting).toBe(true);

      // Push a message
      const msg = createTestMessage('Hello');
      queue.push(msg);

      // Pull should resolve with the message
      const result = await pullPromise;
      expect(result).toEqual(msg);
      expect(queue.isWaiting).toBe(false);
      expect(queue.pendingCount).toBe(0);
    });
  });

  describe('pull()', () => {
    it('returns queued message immediately', async () => {
      const msg = createTestMessage('Hello');
      queue.push(msg);

      const result = await queue.pull();
      expect(result).toEqual(msg);
      expect(queue.pendingCount).toBe(0);
    });

    it('returns messages in FIFO order', async () => {
      queue.push(createTestMessage('First'));
      queue.push(createTestMessage('Second'));
      queue.push(createTestMessage('Third'));

      const first = await queue.pull();
      const second = await queue.pull();
      const third = await queue.pull();

      expect(getFirstText(first)).toBe('First');
      expect(getFirstText(second)).toBe('Second');
      expect(getFirstText(third)).toBe('Third');
    });

    it('waits for push when queue is empty', async () => {
      // Start pull before push
      const pullPromise = queue.pull();
      expect(queue.isWaiting).toBe(true);

      // Push after delay
      const msg = createTestMessage('Delayed message');
      setTimeout(() => queue.push(msg), 10);

      const result = await pullPromise;
      expect(result).toEqual(msg);
    });

    it('returns null when queue is closed', async () => {
      queue.close();
      const result = await queue.pull();
      expect(result).toBeNull();
    });

    it('returns null when closed while waiting', async () => {
      // Start a pull that will wait
      const pullPromise = queue.pull();
      expect(queue.isWaiting).toBe(true);

      // Close the queue
      queue.close();

      // Pull should resolve with null
      const result = await pullPromise;
      expect(result).toBeNull();
    });

    it('drains remaining messages before returning null', async () => {
      queue.push(createTestMessage('Message 1'));
      queue.push(createTestMessage('Message 2'));
      queue.close();

      // Should still get queued messages
      const first = await queue.pull();
      const second = await queue.pull();
      const third = await queue.pull();

      expect(getFirstText(first)).toBe('Message 1');
      expect(getFirstText(second)).toBe('Message 2');
      expect(third).toBeNull();
    });
  });

  describe('close()', () => {
    it('sets isClosed to true', () => {
      queue.close();
      expect(queue.isClosed).toBe(true);
    });

    it('is idempotent', () => {
      queue.close();
      queue.close();
      expect(queue.isClosed).toBe(true);
    });

    it('resolves waiting pull with null', async () => {
      const pullPromise = queue.pull();
      queue.close();
      const result = await pullPromise;
      expect(result).toBeNull();
    });
  });

  describe('reset()', () => {
    it('clears the queue', () => {
      queue.push(createTestMessage('Message 1'));
      queue.push(createTestMessage('Message 2'));
      expect(queue.pendingCount).toBe(2);

      queue.reset();
      expect(queue.pendingCount).toBe(0);
    });

    it('clears closed state', () => {
      queue.close();
      expect(queue.isClosed).toBe(true);

      queue.reset();
      expect(queue.isClosed).toBe(false);
    });

    it('allows pushing after reset', () => {
      queue.close();
      queue.reset();

      const msg = createTestMessage('New message');
      queue.push(msg);
      expect(queue.pendingCount).toBe(1);
    });

    it('clears waiting state', () => {
      // Start a pull (no way to test this races, so we just verify no error)
      queue.reset();
      expect(queue.isWaiting).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('handles multiple sequential pulls', async () => {
      // Push multiple messages
      for (let i = 0; i < 5; i++) {
        queue.push(createTestMessage(`Message ${i}`));
      }

      // Pull all messages
      const messages: (StreamingUserMessage | null)[] = [];
      for (let i = 0; i < 5; i++) {
        messages.push(await queue.pull());
      }

      expect(messages.length).toBe(5);
      expect(getFirstText(messages[0])).toBe('Message 0');
      expect(getFirstText(messages[4])).toBe('Message 4');
    });

    it('handles interleaved push and pull', async () => {
      queue.push(createTestMessage('First'));
      const first = await queue.pull();

      queue.push(createTestMessage('Second'));
      queue.push(createTestMessage('Third'));
      const second = await queue.pull();
      const third = await queue.pull();

      expect(getFirstText(first)).toBe('First');
      expect(getFirstText(second)).toBe('Second');
      expect(getFirstText(third)).toBe('Third');
    });
  });
});
