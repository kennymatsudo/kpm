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


// =============================================================================
// Group Repository Interface
// =============================================================================

export interface IGroupRepository {
  /** Get all groups for a project */
  getByProjectId(projectId: string): Group[];

  /** Get a single group by ID */
  getById(id: string): Group | undefined;


  /** Update a group */
  update(id: string, updates: GroupUpdates): void;

  /** Delete a group (items remain, group_id set to null via ON DELETE SET NULL) */
  delete(id: string): void;

  /** Update group position */
  updatePosition(id: string, x: number, y: number): void;

  /** Update group size */
  updateSize(id: string, width: number, height: number): void;
}
