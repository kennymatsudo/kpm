import { describe, it, expect } from 'vitest';
import { createTurnLifecycle } from './turnLifecycle';

describe('createTurnLifecycle', () => {
  it('starts not in flight, not settled, with no timings and no hung reason', () => {
    const lifecycle = createTurnLifecycle();
    expect(lifecycle.inFlight).toBe(false);
    expect(lifecycle.settled).toBe(false);
    expect(lifecycle.settledCause).toBeUndefined();
    expect(lifecycle.startedAt).toBeUndefined();
    expect(lifecycle.lastActivityAt).toBeUndefined();
    expect(lifecycle.hungReason(1_000, { idleMs: 100, hardMs: 100 })).toBeUndefined();
  });

  it('settles the first time and reports the cause', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    expect(lifecycle.settle('result')).toBe(true);
    expect(lifecycle.settled).toBe(true);
    expect(lifecycle.settledCause).toBe('result');
    expect(lifecycle.inFlight).toBe(false);
  });

  it('returns false and keeps the first cause on a second settle', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    expect(lifecycle.settle('result')).toBe(true);
    expect(lifecycle.settle('timed-out')).toBe(false);
    expect(lifecycle.settledCause).toBe('result');
  });

  it('lets begin after settle clear settlement and start a fresh turn', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.settle('result');

    lifecycle.begin(500);
    expect(lifecycle.settled).toBe(false);
    expect(lifecycle.settledCause).toBeUndefined();
    expect(lifecycle.inFlight).toBe(true);
    expect(lifecycle.startedAt).toBe(500);
    expect(lifecycle.lastActivityAt).toBe(500);
  });

  it('ignores noteActivity before any begin', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.noteActivity(100);
    expect(lifecycle.lastActivityAt).toBeUndefined();
    expect(lifecycle.inFlight).toBe(false);
  });

  it('ignores noteActivity after settle', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.settle('result');
    lifecycle.noteActivity(999);
    expect(lifecycle.lastActivityAt).toBe(0);
  });

  it('moves lastActivityAt and defers the idle hang', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.noteActivity(400);
    expect(lifecycle.lastActivityAt).toBe(400);
    expect(lifecycle.hungReason(450, { idleMs: 100, hardMs: 100_000 })).toBeUndefined();
  });

  it('returns undefined while activity is recent', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.noteActivity(100);
    expect(lifecycle.hungReason(150, { idleMs: 100, hardMs: 100_000 })).toBeUndefined();
  });

  it('reports an idle hang off lastActivityAt', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.noteActivity(100);
    expect(lifecycle.hungReason(300, { idleMs: 100, hardMs: 100_000 })).toEqual({ kind: 'idle', idleMs: 200 });
  });

  it('falls back to startedAt for the idle hang when no activity was noted', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    expect(lifecycle.hungReason(300, { idleMs: 100, hardMs: 100_000 })).toEqual({ kind: 'idle', idleMs: 300 });
  });

  it('reports a hard timeout off startedAt', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.noteActivity(50);
    expect(lifecycle.hungReason(200, { idleMs: 100_000, hardMs: 100 })).toEqual({
      kind: 'hard-timeout',
      elapsedMs: 200,
    });
  });

  it('prefers the idle reason when both thresholds are exceeded', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    expect(lifecycle.hungReason(1_000, { idleMs: 100, hardMs: 100 })).toEqual({ kind: 'idle', idleMs: 1_000 });
  });

  it('reports undefined once settled', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.settle('timed-out');
    expect(lifecycle.hungReason(10_000, { idleMs: 100, hardMs: 100 })).toBeUndefined();
  });

  it('abandon clears liveness and timings without settling', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.noteActivity(50);

    lifecycle.abandon();

    expect(lifecycle.inFlight).toBe(false);
    expect(lifecycle.startedAt).toBeUndefined();
    expect(lifecycle.lastActivityAt).toBeUndefined();
    expect(lifecycle.settled).toBe(false);
    expect(lifecycle.settledCause).toBeUndefined();
  });

  it('abandon leaves an earlier settlement and its cause intact', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.settle('result');

    lifecycle.abandon();

    expect(lifecycle.settled).toBe(true);
    expect(lifecycle.settledCause).toBe('result');
    expect(lifecycle.inFlight).toBe(false);
    expect(lifecycle.startedAt).toBeUndefined();
    expect(lifecycle.lastActivityAt).toBeUndefined();
  });

  it('hungReason returns undefined after abandon', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.abandon();
    expect(lifecycle.hungReason(10_000, { idleMs: 100, hardMs: 100 })).toBeUndefined();
  });

  it('lets begin after abandon start a fresh turn cleanly', () => {
    const lifecycle = createTurnLifecycle();
    lifecycle.begin(0);
    lifecycle.abandon();

    lifecycle.begin(500);

    expect(lifecycle.inFlight).toBe(true);
    expect(lifecycle.settled).toBe(false);
    expect(lifecycle.settledCause).toBeUndefined();
    expect(lifecycle.startedAt).toBe(500);
    expect(lifecycle.lastActivityAt).toBe(500);
  });
});
