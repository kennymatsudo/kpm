import type { Group } from '../../shared/types';

export type GroupUpdates = Partial<
  Pick<Group, 'name' | 'color' | 'position_x' | 'position_y' | 'width' | 'height' | 'is_collapsed'>
>;

export function listGroups(projectId: string): Promise<Group[]> {
  return window.api.groups.list({ projectId });
}

export function createGroup(
  projectId: string,
  name: string,
  options?: {
    color?: string;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }
): Promise<Group> {
  return window.api.groups.create({ projectId, name, ...options });
}

export function updateGroup(id: string, updates: GroupUpdates) {
  return window.api.groups.update({ id, updates });
}

export function deleteGroup(id: string) {
  return window.api.groups.delete({ id });
}

export function updateGroupPosition(id: string, x: number, y: number) {
  return window.api.groups.updatePosition({ id, x, y });
}

export function updateGroupSize(id: string, width: number, height: number) {
  return window.api.groups.updateSize({ id, width, height });
}

export function assignItemToGroup(itemId: string, groupId: string | null) {
  return window.api.groups.assignItem({ itemId, groupId });
}
