import { randomUUID } from 'crypto';
import { clientManager } from '../../claude/clientManager';
import type { IToolPermissionRepository } from '../../db/interfaces';
import type { ToolPermission } from '../../../shared/types';
import { failure, success, type ServiceResult } from '../result';

export interface PermissionServiceDeps {
  toolPermissions: IToolPermissionRepository;
}

export function createPermissionService(deps: PermissionServiceDeps) {
  return {
    loadPersistedPermissions(projectId: string): ServiceResult<void> {
      try {
        const permissions = deps.toolPermissions.listByProject(projectId);
        for (const permission of permissions) {
          clientManager.cachePermission(projectId, permission.cache_key);
        }
        console.log(`[Permissions] Loaded ${permissions.length} persisted permissions for ${projectId}`);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    allowAllRemaining(projectId: string): ServiceResult<void> {
      try {
        clientManager.setAllowAllRemaining(projectId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    persistAlwaysAllowed(
      projectId: string,
      toolName: string,
      targetPath: string | null,
      preview: string,
    ): ServiceResult<void> {
      try {
        const cacheKey = `${toolName}:${targetPath ?? 'no-path'}`;
        deps.toolPermissions.upsert({
          id: randomUUID(),
          project_id: projectId,
          cache_key: cacheKey,
          tool_name: toolName,
          label: preview,
        });
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    list(projectId: string): ServiceResult<ToolPermission[]> {
      try {
        return success(deps.toolPermissions.listByProject(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    revoke(id: string, projectId: string, cacheKey: string): ServiceResult<void> {
      try {
        deps.toolPermissions.delete(id);
        clientManager.revokePermission(projectId, cacheKey);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    revokeAll(projectId: string): ServiceResult<void> {
      try {
        deps.toolPermissions.deleteByProject(projectId);
        clientManager.clearPermissionCache(projectId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;
