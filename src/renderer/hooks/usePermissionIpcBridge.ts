import { useEffect } from 'react';
import {
  subscribeToPermissionRequests,
  subscribeToPermissionSettled,
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
      usePermissionStore.getState().setWriteGrant(change.projectId, change.granted);
    });
    // Requests main gave up on (timeout, aborted turn) must leave the queue,
    // or the pending-request badge keeps advertising work nobody can unblock.
    const unsubscribeSettled = subscribeToPermissionSettled((settled) => {
      usePermissionStore.getState().settleRequest(settled.requestId);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeWriteGrants();
      unsubscribeSettled();
    };
  }, []);
}
