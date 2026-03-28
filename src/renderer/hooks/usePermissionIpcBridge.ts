import { useEffect } from 'react';
import { subscribeToPermissionRequests } from '../services/permissionService';
import { usePermissionStore } from '../stores';

/**
 * Bridge hook that keeps permission IPC listeners mounted regardless of active view.
 * This prevents dropped permission prompts when Chat is unmounted (e.g. development view).
 */
export function usePermissionIpcBridge(): void {
  useEffect(() => {
    const unsubscribe = subscribeToPermissionRequests((request) => {
      usePermissionStore.getState().setPendingRequest(request);
    });

    return unsubscribe;
  }, []);
}
