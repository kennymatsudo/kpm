import type { IGroupRepository, IPlanItemRepository } from '../../db/interfaces';
import { assignItemToGroup } from '../../db/domain/GroupAssignmentService';
import { failure, success, type ServiceResult } from '../result';

export interface GroupServiceDeps {
  groups: IGroupRepository;
  planItems: IPlanItemRepository;
}

export function createGroupService(deps: GroupServiceDeps) {
  return {
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
