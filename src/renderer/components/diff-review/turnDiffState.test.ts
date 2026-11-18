import { describe, expect, it } from 'vitest';
import type { FileDiff } from '../../../shared/diffReview';
import { initialTurnDiffState, turnDiffReducer, viewTurnDiff } from './turnDiffState';

const diff = (additions: number): FileDiff => ({
  rootPath: '/r',
  path: 'a.md',
  status: 'modified',
  additions,
  deletions: 0,
  binary: false,
  hunks: [],
});

const ID = 'turn-1';

describe('turnDiffState', () => {
  it('shows loading on first load', () => {
    const state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    expect(viewTurnDiff(state, ID)).toEqual({ file: null, error: null, loading: true });
  });

  it('shows loading before the first start for an identity', () => {
    expect(viewTurnDiff(initialTurnDiffState, ID).loading).toBe(true);
  });

  it('shows the diff after success', () => {
    let state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    state = turnDiffReducer(state, { type: 'success', key: 'k1', file: diff(1) });
    expect(viewTurnDiff(state, ID)).toEqual({ file: diff(1), error: null, loading: false });
  });

  it('keeps the previous diff while a save refetches', () => {
    let state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    state = turnDiffReducer(state, { type: 'success', key: 'k1', file: diff(1) });
    state = turnDiffReducer(state, { type: 'start', identity: ID, key: 'k2' });
    expect(viewTurnDiff(state, ID)).toEqual({ file: diff(1), error: null, loading: false });
    state = turnDiffReducer(state, { type: 'success', key: 'k2', file: diff(2) });
    expect(viewTurnDiff(state, ID).file).toEqual(diff(2));
  });

  it('drops the previous diff when the turn changes', () => {
    let state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    state = turnDiffReducer(state, { type: 'success', key: 'k1', file: diff(1) });
    state = turnDiffReducer(state, { type: 'start', identity: 'turn-2', key: 'j1' });
    expect(viewTurnDiff(state, 'turn-2')).toEqual({ file: null, error: null, loading: true });
  });

  it('shows the error and no diff on failure', () => {
    let state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    state = turnDiffReducer(state, { type: 'failure', key: 'k1', error: 'boom' });
    expect(viewTurnDiff(state, ID)).toEqual({ file: null, error: 'boom', loading: false });
  });

  it('falls back without loading when the file is absent from the result', () => {
    let state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    state = turnDiffReducer(state, { type: 'success', key: 'k1', file: null });
    expect(viewTurnDiff(state, ID)).toEqual({ file: null, error: null, loading: false });
  });

  it('ignores a stale response', () => {
    let state = turnDiffReducer(initialTurnDiffState, { type: 'start', identity: ID, key: 'k1' });
    state = turnDiffReducer(state, { type: 'start', identity: ID, key: 'k2' });
    state = turnDiffReducer(state, { type: 'success', key: 'k1', file: diff(1) });
    expect(viewTurnDiff(state, ID)).toEqual({ file: null, error: null, loading: true });
    state = turnDiffReducer(state, { type: 'failure', key: 'k1', error: 'late' });
    expect(viewTurnDiff(state, ID).error).toBeNull();
  });
});
