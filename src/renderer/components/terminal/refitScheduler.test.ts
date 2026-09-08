import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createRefitScheduler } from './refitScheduler';

const OPTIONS = { debounceMs: 100, retryMs: 250, maxRetries: 3 };

describe('createRefitScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of schedule calls into one refit', () => {
    const attempt = vi.fn(() => true);
    const scheduler = createRefitScheduler({ attempt, canRetry: () => true, ...OPTIONS });

    for (let i = 0; i < 10; i += 1) {
      scheduler.schedule();
      vi.advanceTimersByTime(16);
    }
    expect(attempt).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OPTIONS.debounceMs);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries a refit that could not measure the terminal', () => {
    const attempt = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);
    const scheduler = createRefitScheduler({ attempt, canRetry: () => true, ...OPTIONS });

    scheduler.schedule();
    vi.advanceTimersByTime(OPTIONS.debounceMs + OPTIONS.retryMs * 2);
    expect(attempt).toHaveBeenCalledTimes(3);

    // The third attempt succeeded, so nothing is left pending.
    vi.advanceTimersByTime(OPTIONS.retryMs * 5);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('gives up after the retry budget so a permanently unfittable view stops polling', () => {
    const attempt = vi.fn(() => false);
    const scheduler = createRefitScheduler({ attempt, canRetry: () => true, ...OPTIONS });

    scheduler.schedule();
    vi.advanceTimersByTime(OPTIONS.debounceMs + OPTIONS.retryMs * 20);
    expect(attempt).toHaveBeenCalledTimes(1 + OPTIONS.maxRetries);
  });

  it('does not retry while the terminal is off screen', () => {
    const attempt = vi.fn(() => false);
    const scheduler = createRefitScheduler({ attempt, canRetry: () => false, ...OPTIONS });

    scheduler.schedule();
    vi.advanceTimersByTime(OPTIONS.debounceMs + OPTIONS.retryMs * 5);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('restores the retry budget when a new resize arrives', () => {
    const attempt = vi.fn(() => false);
    const scheduler = createRefitScheduler({ attempt, canRetry: () => true, ...OPTIONS });

    scheduler.schedule();
    vi.advanceTimersByTime(OPTIONS.debounceMs + OPTIONS.retryMs * 20);
    expect(attempt).toHaveBeenCalledTimes(1 + OPTIONS.maxRetries);

    scheduler.schedule();
    vi.advanceTimersByTime(OPTIONS.debounceMs + OPTIONS.retryMs * 20);
    expect(attempt).toHaveBeenCalledTimes((1 + OPTIONS.maxRetries) * 2);
  });

  it('cancel stops a pending refit', () => {
    const attempt = vi.fn(() => true);
    const scheduler = createRefitScheduler({ attempt, canRetry: () => true, ...OPTIONS });

    scheduler.schedule();
    scheduler.cancel();
    vi.advanceTimersByTime(OPTIONS.debounceMs + OPTIONS.retryMs * 5);
    expect(attempt).not.toHaveBeenCalled();
  });
});
