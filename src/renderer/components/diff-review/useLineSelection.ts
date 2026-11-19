import { useCallback, useEffect, useReducer } from 'react';

export interface LineRange {
  start: number;
  end: number;
}

/** Selection held by row key, so expanding a gap cannot move it to other lines. */
export interface SelectionState {
  anchorKey: string | null;
  headKey: string | null;
  dragging: boolean;
  /** True once a drag or shift-click finished, which opens the comment box. */
  committed: boolean;
}

export const EMPTY_SELECTION: SelectionState = { anchorKey: null, headKey: null, dragging: false, committed: false };

export function startSelection(state: SelectionState, key: string, shift: boolean): SelectionState {
  if (shift && state.anchorKey !== null) return { ...state, headKey: key, dragging: false, committed: true };
  return { anchorKey: key, headKey: key, dragging: true, committed: false };
}

export function extendSelection(state: SelectionState, key: string): SelectionState {
  return state.dragging ? { ...state, headKey: key } : state;
}

export function commitSelection(state: SelectionState): SelectionState {
  if (!state.dragging) return state;
  return { ...state, dragging: false, committed: true };
}

/** Row-index range for the current rows, or null when empty or a key no longer exists. */
export function resolveSelection(state: SelectionState, rowKeys: readonly string[]): LineRange | null {
  if (state.anchorKey === null || state.headKey === null) return null;
  const a = rowKeys.indexOf(state.anchorKey);
  const b = rowKeys.indexOf(state.headKey);
  if (a < 0 || b < 0) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

type Action =
  | { type: 'start'; key: string; shift: boolean }
  | { type: 'extend'; key: string }
  | { type: 'commit' }
  | { type: 'clear' };

function reduce(state: SelectionState, action: Action): SelectionState {
  switch (action.type) {
    case 'start':
      return startSelection(state, action.key, action.shift);
    case 'extend':
      return extendSelection(state, action.key);
    case 'commit':
      return commitSelection(state);
    case 'clear':
      return EMPTY_SELECTION;
  }
}

/** Row range selection: drag across rows, or shift-click to extend. */
export function useLineSelection(rowKeys: readonly string[]) {
  const [state, dispatch] = useReducer(reduce, EMPTY_SELECTION);
  const selection = resolveSelection(state, rowKeys);
  const stale = state.anchorKey !== null && selection === null;

  useEffect(() => {
    if (stale) dispatch({ type: 'clear' });
  }, [stale]);

  const finish = useCallback(() => dispatch({ type: 'commit' }), []);

  useEffect(() => {
    if (!state.dragging) return;
    window.addEventListener('mouseup', finish);
    return () => window.removeEventListener('mouseup', finish);
  }, [state.dragging, finish]);

  const start = useCallback((key: string, shift: boolean) => dispatch({ type: 'start', key, shift }), []);
  const extend = useCallback((key: string) => dispatch({ type: 'extend', key }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return { selection, committed: state.committed ? selection : null, start, extend, finish, clear };
}
