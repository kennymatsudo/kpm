import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  it('resolves with the operation value when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'fallback')).resolves.toBe('done');
  });

  it('resolves with the fallback when the operation exceeds the timeout', async () => {
    vi.useFakeTimers();
    try {
      const hang = new Promise<string>(() => {});
      const raced = withTimeout(hang, 50, 'fallback');
      await vi.advanceTimersByTimeAsync(50);
      await expect(raced).resolves.toBe('fallback');
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a rejection that arrives before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'fallback')).rejects.toThrow('boom');
  });

  it('swallows a rejection that arrives after the timeout fired', async () => {
    vi.useFakeTimers();
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      let rejectLate: (reason: Error) => void = () => {};
      const late = new Promise<string>((_, reject) => { rejectLate = reject; });
      const raced = withTimeout(late, 50, 'fallback');
      await vi.advanceTimersByTimeAsync(50);
      await expect(raced).resolves.toBe('fallback');
      rejectLate(new Error('late boom'));
      await Promise.resolve();
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      vi.useRealTimers();
    }
  });
});
