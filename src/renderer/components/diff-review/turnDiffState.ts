import type { FileDiff } from '../../../shared/diffReview';

/**
 * Fetch state for one file's diff against one turn.
 * `identity` names the document, chat and turn; `key` also includes the saved content.
 */
export interface TurnDiffState {
  identity: string | null;
  /** Key of the latest request started. Responses for other keys are stale. */
  key: string | null;
  /** Last successful diff for this identity; kept while a refetch runs. */
  file: FileDiff | null;
  error: string | null;
  /** The latest request has finished. */
  settled: boolean;
}

export type TurnDiffAction =
  | { type: 'start'; identity: string; key: string }
  | { type: 'success'; key: string; file: FileDiff | null }
  | { type: 'failure'; key: string; error: string };

export const initialTurnDiffState: TurnDiffState = {
  identity: null,
  key: null,
  file: null,
  error: null,
  settled: false,
};

export function turnDiffReducer(state: TurnDiffState, action: TurnDiffAction): TurnDiffState {
  switch (action.type) {
    case 'start':
      return {
        identity: action.identity,
        key: action.key,
        file: state.identity === action.identity ? state.file : null,
        error: null,
        settled: false,
      };
    case 'success':
      return action.key === state.key ? { ...state, file: action.file, error: null, settled: true } : state;
    case 'failure':
      return action.key === state.key ? { ...state, file: null, error: action.error, settled: true } : state;
  }
}

export interface TurnDiffView {
  file: FileDiff | null;
  error: string | null;
  /** No diff to show yet and none has failed: show a loading state, not the text fallback. */
  loading: boolean;
}

export function viewTurnDiff(state: TurnDiffState, identity: string): TurnDiffView {
  if (state.identity !== identity) return { file: null, error: null, loading: true };
  return { file: state.file, error: state.error, loading: state.file === null && !state.settled };
}
