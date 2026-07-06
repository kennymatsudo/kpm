/**
 * Plan Domain Repository Interfaces
 *
 * Interfaces for plan items, relations, and external (tracker-linked) items.
 */

import type {
  PlanItem,
  PlanRelation,
  PlanItemUpdates,
  PlanItemSyncUpdates,
  NewPlanItem,
} from '../../../shared/types';

// =============================================================================
// Plan Item Repository
// =============================================================================

export interface IPlanItemRepository {
  getByProject(projectId: string): PlanItem[];
  get(id: string): PlanItem | undefined;
  add(item: NewPlanItem): PlanItem;
  getMany(ids: string[]): PlanItem[];
  /**
   * Existence-only batch check. Returns the subset of `ids` that exist in
   * `plan_items`. Cheaper than `getMany` when callers don't need the row data.
   */
  getExistingIds(ids: string[]): Set<string>;
  update(id: string, updates: PlanItemUpdates | PlanItemSyncUpdates): void;
  delete(id: string): void;
  deleteWithDescendants(id: string): void;
  getChildCount(itemId: string): number;
  updatePosition(itemId: string, x: number, y: number): void;
  batchUpdatePositions(updates: { id: string; x: number; y: number }[]): void;
  getNextOrder(projectId: string, parentId: string | null): number;
  /** Get children of a specific parent, optionally filtered by external issue types */
  getChildrenByParent(projectId: string, parentId: string, externalIssueTypes?: string[]): PlanItem[];
  /** Get siblings (same parent) with minimal data for reorder operations */
  getSiblings(projectId: string, parentId: string | null, excludeId?: string): { id: string; item_order: number }[];
  /**
   * Batch reparent multiple items efficiently using a single prepared statement.
   * Each update sets parent_id and resets status to 'planned'.
   * @returns Array of item IDs that were successfully updated
   */
  batchReparent(updates: { id: string; parentId: string | null }[]): string[];
  /** Batch update status for multiple items in a single transaction. */
  batchUpdateStatus(ids: string[], status: string): void;
}

// =============================================================================
// Plan Relation Repository
// =============================================================================

export interface IPlanRelationRepository {
  getByProject(projectId: string): PlanRelation[];
  getByItemIds(itemIds: string[]): PlanRelation[];
  add(relation: Omit<PlanRelation, 'id' | 'created_at'>): PlanRelation;
  delete(id: string): void;
  remove(id: string): void;
  deleteByItem(itemId: string): void;
}

// =============================================================================
// External Plan Item Repository
// =============================================================================

export interface IExternalPlanItemRepository {
  getLinkedItems(projectId: string, externalType: string): PlanItem[];
  createFromExternal(input: {
    project_id: string;
    association_id: string;
    title: string;
    description: string | null;
    label?: string | null; // Optional - we now use external_issue_type directly
    external_key: string;
    external_id?: string;
    external_type: string;
    external_issue_type: string;
    external_status: string;
    status_category: string;
    external_url?: string;
    external_parent_key: string | null;
    external_epic_key: string | null;
    external_assignee_id?: string | null;
    external_assignee_name?: string | null;
    external_assignee_avatar_url?: string | null;
    external_creator_id?: string | null;
    external_creator_name?: string | null;
    external_creator_avatar_url?: string | null;
  }): PlanItem;
  importExternalIssues(items: {
    project_id: string;
    external_key: string;
    external_id: string;
    external_type: string;
    external_status: string;
    status_category: string;
    external_url: string;
    external_parent_key: string | null;
    external_epic_key: string | null;
    external_issue_type: string;
    external_assignee_id?: string | null;
    external_assignee_name?: string | null;
    external_assignee_avatar_url?: string | null;
    external_creator_id?: string | null;
    external_creator_name?: string | null;
    external_creator_avatar_url?: string | null;
    title: string;
    description: string | null;
    label?: string | null; // Optional - we now use external_issue_type directly
    association_id: string;
  }[]): PlanItem[];
  updateFromExternal(
    planItemId: string,
    updates: {
      title?: string;
      description?: string | null;
      label?: string | null;
      release_tag?: string | null;
      external_status?: string | null;
      status_category?: string | null;
      external_assignee_id?: string | null;
      external_assignee_name?: string | null;
      external_assignee_avatar_url?: string | null;
      external_creator_id?: string | null;
      external_creator_name?: string | null;
      external_creator_avatar_url?: string | null;
    }
  ): void;
  linkSubtasksToParentIssues(projectId: string, externalType: string): void;
  unlinkFromExternal(id: string): void;
}
