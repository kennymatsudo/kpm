import type { FileDiff } from '../../../shared/diffReview';

export type ChangesLoad =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; files: FileDiff[] };

/** `key` names the request the result belongs to; a result for an older key is dropped. */
export interface ChangesFetchState {
  key: string | null;
  load: ChangesLoad;
}

export type ChangesFetchAction =
  | { type: 'start'; key: string }
  | { type: 'success'; key: string; files: FileDiff[] }
  | { type: 'failure'; key: string; error: string };

export const INITIAL_CHANGES_FETCH: ChangesFetchState = { key: null, load: { status: 'loading' } };

export function changesFetchReducer(state: ChangesFetchState, action: ChangesFetchAction): ChangesFetchState {
  if (action.type === 'start') return { key: action.key, load: { status: 'loading' } };
  if (action.key !== state.key) return state;
  if (action.type === 'success') return { key: state.key, load: { status: 'ready', files: action.files } };
  return { key: state.key, load: { status: 'error', error: action.error } };
}
