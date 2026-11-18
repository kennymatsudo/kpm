import { describe, expect, it } from 'vitest';
import type { FileDiff } from '../../../shared/diffReview';
import { INITIAL_CHANGES_FETCH, changesFetchReducer } from './changesFetch';

const files = [{ rootPath: '/r', path: 'a.ts' }] as FileDiff[];

describe('changesFetchReducer', () => {
  it('start resets to loading for the new key', () => {
    const ready = changesFetchReducer(
      changesFetchReducer(INITIAL_CHANGES_FETCH, { type: 'start', key: 'k1' }),
      { type: 'success', key: 'k1', files },
    );
    expect(changesFetchReducer(ready, { type: 'start', key: 'k2' })).toEqual({ key: 'k2', load: { status: 'loading' } });
  });

  it('success and failure apply for the current key', () => {
    const started = changesFetchReducer(INITIAL_CHANGES_FETCH, { type: 'start', key: 'k1' });
    expect(changesFetchReducer(started, { type: 'success', key: 'k1', files }).load).toEqual({ status: 'ready', files });
    expect(changesFetchReducer(started, { type: 'failure', key: 'k1', error: 'Snapshot expired' }).load).toEqual({
      status: 'error',
      error: 'Snapshot expired',
    });
  });

  it('ignores a stale success or failure from an earlier key', () => {
    const started = changesFetchReducer(
      changesFetchReducer(INITIAL_CHANGES_FETCH, { type: 'start', key: 'k1' }),
      { type: 'start', key: 'k2' },
    );
    expect(changesFetchReducer(started, { type: 'success', key: 'k1', files })).toBe(started);
    expect(changesFetchReducer(started, { type: 'failure', key: 'k1', error: 'x' })).toBe(started);
  });

  it('a rejection reported as failure ends loading', () => {
    const started = changesFetchReducer(INITIAL_CHANGES_FETCH, { type: 'start', key: 'k1' });
    const state = changesFetchReducer(started, { type: 'failure', key: 'k1', error: 'Could not load changes.' });
    expect(state.load.status).toBe('error');
  });
});
