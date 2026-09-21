import { describe, expect, it } from 'vitest';
import { getBoardDropDecision } from './dropBehavior';

describe('getBoardDropDecision', () => {
  it('does nothing when the drop lands back on the same column', () => {
    expect(getBoardDropDecision('done', 'done', true)).toEqual({
      action: 'noop',
      stopActiveSession: false,
    });
  });

  it.each(['not_started', 'blocked'] as const)(
    'starts an agent when a card is dragged into in_progress from %s without an active session',
    (previousStatus) => {
      expect(getBoardDropDecision(previousStatus, 'in_progress', false)).toEqual({
        action: 'start_agent',
        stopActiveSession: false,
      });
    },
  );

  it('does not create a new start flow when the card already has an active session', () => {
    expect(getBoardDropDecision('done', 'in_progress', true)).toEqual({
      action: 'move',
      stopActiveSession: false,
    });
  });

  it.each(['done', 'canceled', 'blocked'] as const)(
    'stops the active session before moving into terminal column %s',
    (newStatus) => {
      expect(getBoardDropDecision('in_progress', newStatus, true)).toEqual({
        action: 'move',
        stopActiveSession: true,
      });
    },
  );

  it('leaves the session running when moving into a terminal column without one active', () => {
    expect(getBoardDropDecision('in_progress', 'done', false)).toEqual({
      action: 'move',
      stopActiveSession: false,
    });
  });
});
