/**
 * PlanActionExecutor — spec-field integration
 *
 * Proves that a Claude-authored create_item / update_item PlanAction carrying
 * intent, acceptance_criteria, and source_document_id lands in the DB correctly
 * after going through PlanActionService.execute().
 *
 * This covers the seam where the modify_plan tool hands off to the executor —
 * the one piece of plumbing we cannot test from the Zod schema or the
 * repository alone.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPlanActionExecutor } from '../../src/main/db/domain/PlanActionService';
import { createPlanItem, createTestRepositoryContext, type TestRepositoryContext } from '../';

describe('PlanActionExecutor — create_item with spec fields', () => {
  let ctx: TestRepositoryContext;
  let projectId: string;

  beforeEach(() => {
    ctx = createTestRepositoryContext();
    const project = ctx.repos.projects.create({ name: 'Spec Field Test' });
    projectId = project.id;
  });

  function makeExecutor() {
    return createPlanActionExecutor({
      database: ctx.db,
      planItems: ctx.repos.planItems,
      planRelations: ctx.repos.planRelations,
      groups: ctx.repos.groups,
      tracker: ctx.repos.tracker,
      syncQueue: ctx.repos.syncQueue,
      queueTrackerUpdateIfNeeded: vi.fn(),
      logger: { log: vi.fn(), warn: vi.fn() },
    });
  }

  it('writes intent and acceptance_criteria to the DB on create_item', () => {
    const executor = makeExecutor();

    const result = executor.execute(projectId, [
      {
        type: 'create_item',
        title: 'Add session timeout warning',
        intent: "Warn users before their session expires so they don't lose unsaved work.",
        acceptance_criteria: [
          'Warning modal appears 5 minutes before expiry',
          'Extend Session action refreshes the token',
        ],
        source_document_id: 'doc-42',
        parent_id: null,
      },
    ]);

    expect(result.success).toBe(true);

    // The executor maps placeholders $1, $2… → real UUIDs in `createdIds`.
    const createdId = result.createdIds?.$1;
    expect(createdId).toBeDefined();

    const item = ctx.repos.planItems.get(createdId!);
    expect(item).toBeDefined();
    expect(item?.title).toBe('Add session timeout warning');
    expect(item?.intent).toBe("Warn users before their session expires so they don't lose unsaved work.");
    expect(item?.acceptance_criteria).toEqual([
      'Warning modal appears 5 minutes before expiry',
      'Extend Session action refreshes the token',
    ]);
    expect(item?.source_document_id).toBe('doc-42');
  });

  it('defaults spec fields to null when the action omits them (legacy shape still works)', () => {
    const executor = makeExecutor();

    const result = executor.execute(projectId, [
      {
        type: 'create_item',
        title: 'Legacy-shape item',
        description: 'Only title + description, like pre-sprint-1 items.',
        parent_id: null,
      },
    ]);

    expect(result.success).toBe(true);

    const createdId = result.createdIds?.$1;
    const item = ctx.repos.planItems.get(createdId!);
    expect(item?.intent).toBeNull();
    expect(item?.acceptance_criteria).toBeNull();
    expect(item?.source_document_id).toBeNull();
  });

  it('updates spec fields on an existing item via update_item', () => {
    const executor = makeExecutor();

    // Create
    const create = executor.execute(projectId, [
      {
        type: 'create_item',
        title: 'Item to refine',
        parent_id: null,
      },
    ]);
    const itemId = create.createdIds!.$1;

    // Update — add criteria after the fact (simulates refinement in chat)
    const update = executor.execute(projectId, [
      {
        type: 'update_item',
        item_id: itemId,
        updates: {
          intent: 'Make X reliable',
          acceptance_criteria: ['X never throws under condition Y'],
        },
      },
    ]);
    expect(update.success).toBe(true);

    const refetched = ctx.repos.planItems.get(itemId);
    expect(refetched?.intent).toBe('Make X reliable');
    expect(refetched?.acceptance_criteria).toEqual(['X never throws under condition Y']);
  });

  it('persists acceptance_criteria for a batch of create_item actions', () => {
    const executor = makeExecutor();

    const result = executor.execute(projectId, [
      {
        type: 'create_item',
        title: 'First',
        acceptance_criteria: ['A1', 'A2'],
        parent_id: null,
      },
      {
        type: 'create_item',
        title: 'Second',
        acceptance_criteria: ['B1'],
        parent_id: null,
      },
    ]);

    expect(result.success).toBe(true);
    const firstId = result.createdIds!.$1;
    const secondId = result.createdIds!.$2;

    expect(ctx.repos.planItems.get(firstId)?.acceptance_criteria).toEqual(['A1', 'A2']);
    expect(ctx.repos.planItems.get(secondId)?.acceptance_criteria).toEqual(['B1']);
  });

  it('preserves current board status when queue_for_tracker adds an item', () => {
    const connection = ctx.repos.tracker.createConnection('linear', 'linear.app', 'Linear');
    const scope = ctx.repos.tracker.createScope(connection.id, 'ENG', 'Engineering');
    const association = ctx.repos.tracker.createAssociation(
      projectId,
      scope.id,
      JSON.stringify({ teamKey: 'ENG' }),
      'Engineering'
    );
    ctx.repos.planItems.add(createPlanItem({
      id: 'plan-queue',
      project_id: projectId,
      title: 'Queue from action',
      status_category: 'done',
    }));
    const executor = makeExecutor();

    const result = executor.execute(projectId, [
      { type: 'queue_for_tracker', item_ids: ['plan-queue'] },
    ]);

    expect(result.success).toBe(true);
    const entry = ctx.repos.syncQueue.getByPlanItem('plan-queue');
    expect(entry?.association_id).toBe(association.id);
    expect(entry?.target_status_category).toBe('done');
  });
});
