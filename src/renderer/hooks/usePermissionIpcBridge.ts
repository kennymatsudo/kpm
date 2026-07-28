import { useEffect } from 'react';
import {
  subscribeToPermissionRequests,
  subscribeToWriteGrantChanges,
} from '../services/permissionService';
import { usePermissionStore } from '../stores';

/**
 * Bridge hook that keeps permission IPC listeners mounted regardless of active view.
 * This prevents dropped permission prompts when Chat is unmounted (e.g. development view).
 */
export function usePermissionIpcBridge(): void {
  useEffect(() => {
    const unsubscribeRequests = subscribeToPermissionRequests((request) => {
      usePermissionStore.getState().enqueueRequest(request);
    });
    const unsubscribeWriteGrants = subscribeToWriteGrantChanges((change) => {
      usePermissionStore.getState().setWriteGrant(change.chatSessionId, change.granted);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeWriteGrants();
    };
  }, []);
}
