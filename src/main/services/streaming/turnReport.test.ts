import { describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import { createTurnLifecycle, type TurnLifecycle } from './turnLifecycle';
import { createTurnReport, type TurnOutcome } from './turnReport';

function setup(options: { inFlight?: boolean } = {}) {
  const sent: { channel: string; payload: Record<string, unknown> }[] = [];
  const window = {
    webContents: {
      send: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload }),
    },
  } as unknown as BrowserWindow;
  const turn: TurnLifecycle = createTurnLifecycle();
  if (options.inFlight !== false) turn.begin(Date.now());

  return {
    sent,
    turn,
    channels: () => sent.map((event) => event.channel),
    report: createTurnReport({
      turn,
      projectId: 'project-1',
      getChatSessionId: () => 'session-1',
      getMainWindow: () => window,
    }),
  };
}

const outcome = { model: 'sonnet' } as TurnOutcome;

describe('endTurn', () => {
  it('result: reports the session ready and the turn done', () => {
    const { report, channels, sent, turn } = setup();

    report.endTurn({ cause: 'result', hasQueuedFollowUp: false, outcome });

    expect(channels()).toEqual(['chat:session-ready', 'chat:done']);
    expect(sent[1].payload).toMatchObject({ projectId: 'project-1', chatSessionId: 'session-1', model: 'sonnet' });
    expect(turn.settledCause).toBe('result');
  });

  it('result with a queued follow-up: stays busy, because the next turn is already waiting', () => {
    const { report, channels } = setup();

    report.endTurn({ cause: 'result', hasQueuedFollowUp: true, outcome });

    expect(channels()).toEqual(['chat:done']);
  });

  it('timed-out: reports done once, so a second attempt cannot revive a settled turn', () => {
    const { report, channels } = setup();

    report.endTurn({ cause: 'timed-out' });
    report.endTurn({ cause: 'timed-out' });

    expect(channels()).toEqual(['chat:done']);
  });

  it('disconnected: deactivates and finishes the turn even when it already settled', () => {
    const { report, channels, sent } = setup();
    report.endTurn({ cause: 'result', hasQueuedFollowUp: false, outcome });
    const afterResult = sent.length;

    report.endTurn({
      cause: 'disconnected', silent: false, reason: 'idle_timeout', source: 'cleanupTask', previousState: 'ready',
    });

    // An idle session's leftover activities still need a finalized bubble.
    expect(channels().slice(afterResult)).toEqual(['chat:session-deactivated', 'chat:done']);
  });

  it('disconnected silently: says nothing, because the session is being replaced', () => {
    const { report, channels } = setup();

    report.endTurn({
      cause: 'disconnected', silent: true, reason: 'reconnect', source: 'sendMessage', previousState: 'ready',
    });

    expect(channels()).toEqual([]);
  });

  it('session-ended: reports teardown for a turn that was still running', () => {
    const { report, channels } = setup();

    report.endTurn({
      cause: 'session-ended', reason: 'session_end_error', source: 'onSessionEnd', previousState: 'processing',
      suppressLifecycle: false, error: 'boom',
    });

    expect(channels()).toEqual(['chat:session-deactivated', 'chat:done', 'chat:session-error']);
  });

  it('session-ended after the turn finished: stays quiet rather than undoing the finalized bubble', () => {
    const { report, sent } = setup();
    report.endTurn({ cause: 'result', hasQueuedFollowUp: false, outcome });
    const afterResult = sent.length;

    report.endTurn({
      cause: 'session-ended', reason: 'session_end_completed', source: 'onSessionEnd', previousState: 'ready',
      suppressLifecycle: false,
    });

    expect(sent).toHaveLength(afterResult);
  });

  it('session-ended while closing: still reports, so a deliberately closed tab stops looking live', () => {
    const { report, sent, channels } = setup();
    report.endTurn({ cause: 'result', hasQueuedFollowUp: false, outcome });
    const afterResult = sent.length;

    report.endTurn({
      cause: 'session-ended', reason: 'session_end_closed', source: 'onSessionEnd', previousState: 'closing',
      suppressLifecycle: false,
    });

    expect(channels().slice(afterResult)).toEqual(['chat:session-deactivated', 'chat:done']);
  });

  it('session-ended with lifecycle suppressed: says nothing whatever the turn did', () => {
    const { report, channels } = setup();

    report.endTurn({
      cause: 'session-ended', reason: 'session_end_replaced', source: 'onSessionEnd', previousState: 'processing',
      suppressLifecycle: true,
    });

    expect(channels()).toEqual([]);
  });
});
