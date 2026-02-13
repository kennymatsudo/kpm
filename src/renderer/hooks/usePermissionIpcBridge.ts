import { useEffect } from 'react';
import { usePermissionStore } from '../stores';

/**
 * Bridge hook that keeps permission IPC listeners mounted regardless of active view.
 * This prevents dropped permission prompts when Chat is unmounted (e.g. development view).
 */
export function usePermissionIpcBridge(): void {
  useEffect(() => {
      usePermissionStore.getState().setPendingRequest(request);
    });

    return unsubscribe;
  }, []);
}
