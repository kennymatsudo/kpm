import { useCallback, useMemo } from 'react';
import { useDiffReviewStore, type ChangesTabTarget } from '../../stores/diffReviewStore';

export type { ChangesTabTarget };

/**
 * Opens and closes the workspace Changes tab. Two store fields move together,
 * so the pair lives in one hook instead of in each caller.
 */
export function useChangesTab(): { openChanges: (target: ChangesTabTarget) => void; closeChanges: () => void } {
  const openChanges = useCallback((target: ChangesTabTarget) => {
    const state = useDiffReviewStore.getState();
    state.setChangesTab(target);
    state.setChangesTabActive(true);
  }, []);
  const closeChanges = useCallback(() => {
    const state = useDiffReviewStore.getState();
    state.setChangesTab(null);
    state.setChangesTabActive(false);
  }, []);
  return useMemo(() => ({ openChanges, closeChanges }), [openChanges, closeChanges]);
}
