/**
 * Group Repository Interface
 *
 * Interface for managing visual group containers (Figma-style frames).
 * Groups are purely visual - they don't affect plan item hierarchy.
 */

import type { Group } from '../../../shared/types';

// =============================================================================
// Group Updates Type
// =============================================================================

export type GroupUpdates = Partial<Pick<Group, 'name' | 'color' | 'position_x' | 'position_y' | 'width' | 'height' | 'is_collapsed'>>;

// =============================================================================
// Group Repository Interface
// =============================================================================

export interface IGroupRepository {
  /** Get all groups for a project */
  getByProjectId(projectId: string): Group[];

  /** Get a single group by ID */
  getById(id: string): Group | undefined;

  /** Create a new group. If id is provided, use it; otherwise generate a new UUID. */
  create(group: Omit<Group, 'id' | 'created_at' | 'updated_at'>, id?: string): Group;

  /** Update a group */
  update(id: string, updates: GroupUpdates): void;

  /** Delete a group (items remain, group_id set to null via ON DELETE SET NULL) */
  delete(id: string): void;

  /** Update group position */
  updatePosition(id: string, x: number, y: number): void;

  /** Update group size */
  updateSize(id: string, width: number, height: number): void;
}
