import { describe, expect, it } from 'vitest';
import {
  EMPTY_SELECTION,
  commitSelection,
  extendSelection,
  resolveSelection,
  startSelection,
} from './useLineSelection';

const keys = ['a', 'b', 'c', 'd'];

describe('line selection', () => {
  it('drags from start through extend to commit', () => {
    let s = startSelection(EMPTY_SELECTION, 'b', false);
    expect(s.committed).toBe(false);
    s = extendSelection(s, 'd');
    expect(resolveSelection(s, keys)).toEqual({ start: 1, end: 3 });
    s = commitSelection(s);
    expect(s).toMatchObject({ dragging: false, committed: true });
  });

  it('ignores extend when not dragging', () => {
    const s = extendSelection(EMPTY_SELECTION, 'c');
    expect(s).toBe(EMPTY_SELECTION);
  });

  it('shift-click extends from the anchor and commits', () => {
    const done = commitSelection(extendSelection(startSelection(EMPTY_SELECTION, 'b', false), 'b'));
    const s = startSelection(done, 'd', true);
    expect(s.committed).toBe(true);
    expect(resolveSelection(s, keys)).toEqual({ start: 1, end: 3 });
  });

  it('commits on an outside mouseup the same way as inside', () => {
    const s = commitSelection(extendSelection(startSelection(EMPTY_SELECTION, 'a', false), 'c'));
    expect(s.committed).toBe(true);
    expect(resolveSelection(s, keys)).toEqual({ start: 0, end: 2 });
    expect(commitSelection(s)).toBe(s);
  });

  it('resolves against changed rows and returns null when a key is gone', () => {
    const s = commitSelection(extendSelection(startSelection(EMPTY_SELECTION, 'c', false), 'd'));
    expect(resolveSelection(s, ['a', 'gap', 'b', 'c', 'd'])).toEqual({ start: 3, end: 4 });
    expect(resolveSelection(s, ['a', 'b'])).toBeNull();
  });
});
