/**
 * PlanItemRepository Integration Tests
 *
 * Tests the repository implementation with an in-memory SQLite database.
 * Uses test factories for cleaner, more maintainable test data.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestRepositoryContext, createPlanItem, type TestRepositoryContext } from '../';

describe('PlanItemRepository', () => {
  let ctx: TestRepositoryContext;
  let projectId: string;

  beforeEach(() => {
    ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Test Project' });
    projectId = project.id;
  });

  describe('update — spec fields', () => {
    it('replaces acceptance_criteria in full (semantic: list replacement, not merge)', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'update-item-2',
        project_id: projectId,
        title: 'Item to update',
        acceptance_criteria: ['Original A', 'Original B', 'Original C'],
      }));

      ctx.repos.planItems.update('update-item-2', {
        acceptance_criteria: ['New A'],
      });

      const updated = ctx.repos.planItems.get('update-item-2');
      expect(updated?.acceptance_criteria).toEqual(['New A']);
    });

    it('clears acceptance_criteria when set to null', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'update-item-3',
        project_id: projectId,
        title: 'Item to clear',
        acceptance_criteria: ['Some criterion'],
      }));

      ctx.repos.planItems.update('update-item-3', {
        acceptance_criteria: null,
      });

      const updated = ctx.repos.planItems.get('update-item-3');
      expect(updated?.acceptance_criteria).toBeNull();
    });

    it('updates intent independently of acceptance_criteria', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'update-item-4',
        project_id: projectId,
        title: 'Item',
        intent: 'Original intent',
        acceptance_criteria: ['One', 'Two'],
      }));

      ctx.repos.planItems.update('update-item-4', { intent: 'Revised intent' });

      const updated = ctx.repos.planItems.get('update-item-4');
      expect(updated?.intent).toBe('Revised intent');
      expect(updated?.acceptance_criteria).toEqual(['One', 'Two']);
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent item', () => {
      const item = ctx.repos.planItems.get('non-existent');
      expect(item).toBeUndefined();
    });

    it('retrieves an existing item', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'Test Item',
      }));

      const item = ctx.repos.planItems.get('item-1');
      expect(item).toBeDefined();
      expect(item?.title).toBe('Test Item');
    });
  });

  describe('getByProject', () => {
    it('returns items for a project ordered by item_order', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-3',
        project_id: projectId,
        title: 'Third',
        item_order: 2,
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'First',
        item_order: 0,
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'item-2',
        project_id: projectId,
        title: 'Second',
        item_order: 1,
      }));

      const items = ctx.repos.planItems.getByProject(projectId);
      expect(items).toHaveLength(3);
      expect(items[0].title).toBe('First');
      expect(items[1].title).toBe('Second');
      expect(items[2].title).toBe('Third');
    });

    it('returns empty array for project with no items', () => {
      const items = ctx.repos.planItems.getByProject(projectId);
      expect(items).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates specified fields only', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'Original',
        description: 'Original desc',
        label: 'task',
      }));

      ctx.repos.planItems.update('item-1', { title: 'Updated' });

      const item = ctx.repos.planItems.get('item-1');
      expect(item?.title).toBe('Updated');
      expect(item?.description).toBe('Original desc');
      expect(item?.label).toBe('task');
    });

    it('can update status_category', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'Test',
        status: 'planned',
      }));

      ctx.repos.planItems.update('item-1', { status_category: 'in_progress' });

      const item = ctx.repos.planItems.get('item-1');
      expect(item?.status_category).toBe('in_progress');
    });
  });

  describe('delete', () => {
    it('removes the item', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'To Delete',
      }));

      ctx.repos.planItems.delete('item-1');

      const item = ctx.repos.planItems.get('item-1');
      expect(item).toBeUndefined();
    });

    it('orphans descendants when parent is deleted', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'parent',
        project_id: projectId,
        title: 'Parent',
        status: 'planned',
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'child',
        project_id: projectId,
        parent_id: 'parent',
        title: 'Child',
        status: 'planned',
      }));

      ctx.repos.planItems.delete('parent');

      expect(ctx.repos.planItems.get('parent')).toBeUndefined();

      const child = ctx.repos.planItems.get('child');
      expect(child).toBeDefined();
      expect(child?.parent_id).toBeNull();
      expect(child?.status).toBe('planned');
    });
  });

  describe('deleteWithDescendants', () => {
    it('removes the item and all descendants', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'parent',
        project_id: projectId,
        title: 'Parent',
        status: 'planned',
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'child',
        project_id: projectId,
        parent_id: 'parent',
        title: 'Child',
        status: 'planned',
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'grandchild',
        project_id: projectId,
        parent_id: 'child',
        title: 'Grandchild',
        status: 'planned',
      }));

      ctx.repos.planItems.deleteWithDescendants('parent');

      expect(ctx.repos.planItems.get('parent')).toBeUndefined();
      expect(ctx.repos.planItems.get('child')).toBeUndefined();
      expect(ctx.repos.planItems.get('grandchild')).toBeUndefined();
    });
  });

  describe('getNextOrder', () => {
    it('returns 0 for empty project', () => {
      const order = ctx.repos.planItems.getNextOrder(projectId, null);
      expect(order).toBe(0);
    });

    it('returns next order after existing items', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'First',
        item_order: 5,
      }));

      const order = ctx.repos.planItems.getNextOrder(projectId, null);
      expect(order).toBe(6);
    });
  });

  describe('getChildCount', () => {
    it('returns 0 for item with no children', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'item-1',
        project_id: projectId,
        title: 'No children',
      }));

      const count = ctx.repos.planItems.getChildCount('item-1');
      expect(count).toBe(0);
    });

    it('returns count of direct children', () => {
      ctx.repos.planItems.add(createPlanItem({
        id: 'parent',
        project_id: projectId,
        title: 'Parent',
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'child-1',
        project_id: projectId,
        parent_id: 'parent',
        title: 'Child 1',
      }));

      ctx.repos.planItems.add(createPlanItem({
        id: 'child-2',
        project_id: projectId,
        parent_id: 'parent',
        title: 'Child 2',
        item_order: 1,
      }));

      const count = ctx.repos.planItems.getChildCount('parent');
      expect(count).toBe(2);
    });
  });
});
