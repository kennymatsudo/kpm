import type { IGroupRepository, IPlanItemRepository } from '../interfaces';

export interface GroupAssignmentDeps {
  groups: IGroupRepository;
  planItems: IPlanItemRepository;
}

export type GroupAssignmentResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Shared group assignment rule used by both direct UI actions and batch plan actions.
 * Group membership always clears manual positioning so the grid layout can place the item.
 */
export function assignItemToGroup(
  itemId: string,
  groupId: string | null,
): GroupAssignmentResult {
  const item = deps.planItems.get(itemId);
  if (!item) {
    return { ok: false, error: `Item not found: ${itemId}` };
  }

  if (groupId) {
    const group = deps.groups.getById(groupId);
    if (!group) {
      return { ok: false, error: `Group not found: ${groupId}` };
    }
    if (group.project_id !== item.project_id) {
      return { ok: false, error: 'Cannot assign item to a group in another project' };
    }
  }

  deps.planItems.update(itemId, { group_id: groupId, position_x: null, position_y: null });
  return { ok: true };
}
