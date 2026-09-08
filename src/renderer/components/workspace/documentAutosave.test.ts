import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosaveScheduler, type AutosaveTarget } from './documentAutosave';

function target(id: string, content: string, dirty = true): AutosaveTarget {
  return { id, content, dirty };
}

describe('createAutosaveScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of keystrokes into one write', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'h')]);
    vi.advanceTimersByTime(400);
    scheduler.sync([target('a', 'he')]);
    vi.advanceTimersByTime(400);
    scheduler.sync([target('a', 'hel')]);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('does not restart a document timer when a different document changes', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'edited')]);
    vi.advanceTimersByTime(900);
    // Typing in the other tab must not hold back the one already counting down.
    scheduler.sync([target('a', 'edited'), target('b', 'typing')]);
    vi.advanceTimersByTime(200);

    expect(save).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('saves a document that is still dirty while another is being typed in', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'one'), target('b', 'two')]);
    vi.advanceTimersByTime(1000);

    expect(save.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
  });

  it('cancels the write once a document is clean', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'edited')]);
    scheduler.sync([target('a', 'edited', false)]);
    vi.advanceTimersByTime(2000);

    expect(save).not.toHaveBeenCalled();
  });

  it('drops the write for a document that is no longer open', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'edited')]);
    scheduler.sync([]);
    vi.advanceTimersByTime(2000);

    expect(save).not.toHaveBeenCalled();
  });

  it('leaves a failed write alone until the next edit', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'edited')]);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);

    // The write failed, so the document is still dirty with the same content.
    // Retrying on every store change would spin forever.
    scheduler.sync([target('a', 'edited')]);
    scheduler.sync([target('a', 'edited')]);
    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);

    scheduler.sync([target('a', 'edited more')]);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flush writes everything pending without waiting', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'one'), target('b', 'two')]);
    scheduler.flush();

    expect(save.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);

    // Flushed timers must not fire a second time.
    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('cancel abandons pending writes', () => {
    const save = vi.fn();
    const scheduler = createAutosaveScheduler({ save, delayMs: 1000 });

    scheduler.sync([target('a', 'one')]);
    scheduler.cancel();
    vi.advanceTimersByTime(2000);

    expect(save).not.toHaveBeenCalled();
  });
});
