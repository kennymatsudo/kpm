import { useCallback, useEffect } from 'react';
import {
  getProjectWriteGrant,
  grantProjectWriteGrant,
  revokeProjectWriteGrant,
} from '../../services/permissionService';
import { usePermissionStore } from '../../stores';

/**
 * The project's standing write consent. Main pushes every change over
 * `permission:write-grant-changed`, so answering a prompt in chat updates this
 * without a refetch.
 */
export function useProjectWriteGrant(projectId: string | null): {
  writesEnabled: boolean;
  grant: () => void;
  revoke: () => void;
} {
  const writesEnabled = usePermissionStore((state) =>
    projectId ? state.writeGrants.get(projectId) ?? false : false
  );

  useEffect(() => {
    if (!projectId || usePermissionStore.getState().writeGrants.has(projectId)) return;

    let current = true;
    void getProjectWriteGrant(projectId).then((granted) => {
      if (current && !usePermissionStore.getState().writeGrants.has(projectId)) {
        usePermissionStore.getState().setWriteGrant(projectId, granted);
      }
    });

    return () => {
      current = false;
    };
  }, [projectId]);

  const grant = useCallback(() => {
    if (!projectId) return;
    void grantProjectWriteGrant(projectId);
  }, [projectId]);

  const revoke = useCallback(() => {
    if (!projectId) return;
    void revokeProjectWriteGrant(projectId);
  }, [projectId]);

  return { writesEnabled, grant, revoke };
}
