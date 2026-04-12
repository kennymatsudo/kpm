import { describe, expect, it } from 'vitest';
import { getBoardDropDecision } from './dropBehavior';

describe('getBoardDropDecision', () => {
  it('starts an agent when a card is dragged into in_progress without an active session', () => {
    expect(getBoardDropDecision('not_started', 'in_progress', false)).toEqual({
      action: 'start_agent',
      stopActiveSession: false,
    });
  });

  it('does not create a new start flow when the card already has an active session', () => {
    expect(getBoardDropDecision('done', 'in_progress', true)).toEqual({
      action: 'move',
      stopActiveSession: false,
    });
  });

  it('stops the active session before moving into a terminal column', () => {
    expect(getBoardDropDecision('in_progress', 'done', true)).toEqual({
      action: 'move',
      stopActiveSession: true,
    });
  });
});
