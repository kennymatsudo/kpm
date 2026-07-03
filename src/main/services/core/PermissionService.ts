import { randomUUID } from 'crypto';
import { clientManager } from '../../claude/clientManager';
import type { IToolPermissionRepository } from '../../db/interfaces';
import type { ToolPermission } from '../../../shared/types';
import { wrap, type ServiceResult } from '../result';

export interface PermissionServiceDeps {
  toolPermissions: IToolPermissionRepository;
}

export function createPermissionService(deps: PermissionServiceDeps) {
  return {
    loadPersistedPermissions(projectId: string): ServiceResult<void> {
      return wrap(() => {
        const permissions = deps.toolPermissions.listByProject(projectId);
        for (const permission of permissions) {
          clientManager.cachePermission(projectId, permission.cache_key);
        }
        console.log(`[Permissions] Loaded ${permissions.length} persisted permissions for ${projectId}`);
      });
    },

    allowAllRemaining(projectId: string): ServiceResult<void> {
      return wrap(() => {
        clientManager.setAllowAllRemaining(projectId);
      });
    },

    persistAlwaysAllowed(
      projectId: string,
      toolName: string,
      targetPath: string | null,
      preview: string,
    ): ServiceResult<void> {
      return wrap(() => {
        const cacheKey = `${toolName}:${targetPath ?? 'no-path'}`;
        deps.toolPermissions.upsert({
          id: randomUUID(),
          project_id: projectId,
          cache_key: cacheKey,
          tool_name: toolName,
          label: preview,
        });
      });
    },

    list(projectId: string): ServiceResult<ToolPermission[]> {
      return wrap(() => deps.toolPermissions.listByProject(projectId));
    },

    revoke(id: string, projectId: string, cacheKey: string): ServiceResult<void> {
      return wrap(() => {
        deps.toolPermissions.delete(id);
        clientManager.revokePermission(projectId, cacheKey);
      });
    },

    revokeAll(projectId: string): ServiceResult<void> {
      return wrap(() => {
        deps.toolPermissions.deleteByProject(projectId);
        clientManager.clearPermissionCache(projectId);
      });
    },
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;
