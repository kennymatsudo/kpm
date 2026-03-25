import type { Group } from '../../../shared/base-types';
import type { IGroupRepository, IPlanItemRepository, GroupUpdates } from '../../db/interfaces';
import { assignItemToGroup } from '../../db/domain/GroupAssignmentService';
import { failure, success, type ServiceResult } from '../result';

export interface GroupServiceDeps {
  groups: IGroupRepository;
  planItems: IPlanItemRepository;
}

function withGroup<T>(
  deps: GroupServiceDeps,
  groupId: string,
  fn: () => T
): ServiceResult<T> {
  const group = deps.groups.getById(groupId);
  if (!group) {
    return failure(`Group not found: ${groupId}`);
  }

  try {
    return success(fn());
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export function createGroupService(deps: GroupServiceDeps) {
  return {
    list(projectId: string): Group[] {
      return deps.groups.getByProjectId(projectId);
    },

    get(id: string): Group | undefined {
      return deps.groups.getById(id);
    },

    create(group: Omit<Group, 'id' | 'created_at' | 'updated_at'>): ServiceResult<Group> {
      try {
        return success(deps.groups.create(group));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    update(id: string, updates: GroupUpdates): ServiceResult<void> {
      return withGroup(deps, id, () => deps.groups.update(id, updates));
    },

    delete(id: string): ServiceResult<void> {
      return withGroup(deps, id, () => deps.groups.delete(id));
    },

    updatePosition(id: string, x: number, y: number): ServiceResult<void> {
      return withGroup(deps, id, () => deps.groups.updatePosition(id, x, y));
    },

    updateSize(id: string, width: number, height: number): ServiceResult<void> {
      return withGroup(deps, id, () => deps.groups.updateSize(id, width, height));
    },

    assignItem(itemId: string, groupId: string | null): ServiceResult<void> {
      const result = assignItemToGroup(itemId, groupId, {
        groups: deps.groups,
        planItems: deps.planItems,
      });
      return result.ok ? success(undefined) : failure(result.error);
    },
  };
}

export type GroupService = ReturnType<typeof createGroupService>;
