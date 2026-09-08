import type { IProjectWriteGrantRepository } from '../../db/interfaces';
import { projectWriteGrants, type ProjectWriteGrants } from '../../chat/writeGrants';
import { wrap, type ServiceResult } from '../result';

export interface PermissionServiceDeps {
  projectWriteGrantRepository: IProjectWriteGrantRepository;
  grants?: ProjectWriteGrants;
}

/**
 * Owns the project write grant. The in-memory grant is the hot-path read (it
 * is consulted on every tool call) and the table is what makes it outlive a
 * restart, so both move together through here.
 */
export function createPermissionService(deps: PermissionServiceDeps) {
  const grants = deps.grants ?? projectWriteGrants;

  return {
    /** Load persisted grants at startup, before any session can run. */
    hydrate(): ServiceResult<void> {
      return wrap(() => {
        grants.hydrate(deps.projectWriteGrantRepository);
        const granted = deps.projectWriteGrantRepository.listGrantedProjectIds();
        console.log(`[Permissions] Writes granted in ${granted.length} project(s)`);
      });
    },

    isGranted(projectId: string): ServiceResult<boolean> {
      return wrap(() => grants.has(projectId));
    },

    grant(projectId: string): ServiceResult<void> {
      return wrap(() => grants.grant(projectId));
    },

    revoke(projectId: string): ServiceResult<void> {
      return wrap(() => grants.revoke(projectId));
    },
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;
