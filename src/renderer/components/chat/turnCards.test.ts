import { describe, expect, it } from 'vitest';
import { assignTurnCards } from './turnCards';

const u = (id: string, clientMessageId?: string) => ({ id, role: 'user' as const, clientMessageId });
const a = (id: string) => ({ id, role: 'assistant' as const });

describe('assignTurnCards', () => {
  it('gives each reply its own turn', () => {
    const map = assignTurnCards([u('u1', 'c1'), a('a1'), u('u2', 'c2'), a('a2')]);
    expect(map).toEqual(new Map([['a1', ['c1']], ['a2', ['c2']]]));
  });

  it('gives steered follow-ups to the one reply', () => {
    expect(assignTurnCards([u('u1', 'c1'), u('u2', 'c2'), a('a')])).toEqual(
      new Map([['a', ['c1', 'c2']]])
    );
  });

  it('puts the card on the last of several assistant messages', () => {
    expect(assignTurnCards([u('u1', 'c1'), a('a1'), a('a2')])).toEqual(new Map([['a2', ['c1']]]));
  });

  it('ignores users without an id', () => {
    expect(assignTurnCards([u('u1', 'c1'), u('ux'), a('a')])).toEqual(new Map([['a', ['c1']]]));
  });

  it('returns nothing for an empty list', () => {
    expect(assignTurnCards([]).size).toBe(0);
  });
});
