import { useCallback } from 'react';
import { useLatestRef } from '../../hooks/useLatestRef';

/**
 * A function with a fixed identity that always calls the latest `fn`. Lets the
 * board hand memoized columns and cards handlers that never change, even when
 * the parent's callbacks do.
 */
export function useStableCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  const ref = useLatestRef(fn);
  return useCallback((...args: Args) => ref.current(...args), [ref]);
}
