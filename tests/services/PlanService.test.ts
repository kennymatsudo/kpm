import { describe, it, expect, vi } from 'vitest';
import { createPlanService, type PlanServiceDeps } from '../../src/main/services/core/PlanService';
import type { PlanItem } from '../../src/shared/types';

const baseItem: PlanItem = {
  id: '1',
  project_id: 'project-1',
  title: 'Item 1',
  description: null,
  label: null,
  status: 'planned',
  status_category: null,
  parent_id: null,
  group_id: null,
  item_order: 0,
  code_refs: null,
  release_tag: null,
  position_x: null,
  position_y: null,
  association_id: null,
  external_key: null,
  external_id: null,
  external_type: null,
  external_issue_type: null,
  external_status: null,
  external_url: null,
  external_parent_key: null,
  external_epic_key: null,
  sync_source: 'local',
  last_synced_at: null,
  intent: null,
  acceptance_criteria: null,
  source_document_id: null,
  created_at: '',
  updated_at: '',
};

function createMocks(overrides?: Partial<PlanServiceDeps>) {
  const itemStore = new Map<string, PlanItem>([['1', baseItem]]);

  const planItems = {
    get: vi.fn((id: string) => itemStore.get(id)),
    getByProject: vi.fn(() => Array.from(itemStore.values())),
    getChildCount: vi.fn(() => 0),
    getNextOrder: vi.fn(() => 1),
    getSiblings: vi.fn(() => [] as { id: string; item_order: number }[]),
    getChildrenByParent: vi.fn(() => [] as PlanItem[]),
    getMany: vi.fn((ids: string[]) => ids.map(id => itemStore.get(id)).filter((i): i is PlanItem => !!i)),
    getExistingIds: vi.fn((ids: string[]) => new Set(ids.filter(id => itemStore.has(id)))),
    add: vi.fn(),
    delete: vi.fn((id: string) => itemStore.delete(id)),
    deleteWithDescendants: vi.fn(),
    update: vi.fn(),
    updatePosition: vi.fn(),
    batchUpdatePositions: vi.fn(),
    batchReparent: vi.fn((updates: { id: string; parentId: string | null }[]) => updates.map(u => u.id)),
    batchUpdateStatus: vi.fn(),
  };

  const queueTrackerUpdateIfNeeded = vi.fn();
  const executePlanActions = vi.fn(() => ({ success: true, createdIds: {} }));

  const deps: PlanServiceDeps = {
    planItems,
    queueTrackerUpdateIfNeeded,
    executePlanActions,
    ...overrides,
  };

  return { deps, planItems, queueTrackerUpdateIfNeeded, executePlanActions };
}

describe('PlanService', () => {
  it('queues tracker updates on updateItem for existing items', () => {
    const { deps, queueTrackerUpdateIfNeeded, planItems } = createMocks();
    const service = createPlanService(deps);

    const result = service.updateItem('1', { title: 'Updated' });

    expect(result.ok).toBe(true);
    expect(planItems.update).toHaveBeenCalledWith('1', { title: 'Updated' });
    expect(queueTrackerUpdateIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1' }),
      { title: 'Updated' },
      'user'
    );
  });

  it('returns failure when item is missing', () => {
    const baseMocks = createMocks();
    const { deps } = createMocks({
      planItems: {
        ...baseMocks.deps.planItems,
        get: vi.fn(() => undefined),
      },
    });
    const service = createPlanService(deps);

    const result = service.updateItem('missing-id', { title: 'Test' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Item not found');
    }
  });

  it('delegates executeActions through injected executor', () => {
    const { deps, executePlanActions } = createMocks();
    const service = createPlanService(deps);
    const actions = [{ type: 'create_item', title: 'New item', parent_id: null }] as const;

    const result = service.executeActions('project-1', [...actions]);

    expect(executePlanActions).toHaveBeenCalledWith('project-1', [...actions]);
    expect(result).toEqual({ success: true, createdIds: {} });
  });

  it('batch updates item positions after validating all ids', () => {
    const { deps, planItems } = createMocks();
    const service = createPlanService(deps);
    const updates = [{ id: '1', x: 12, y: 24 }];

    const result = service.updatePositions(updates);

    expect(result.ok).toBe(true);
    expect(planItems.getExistingIds).toHaveBeenCalledWith(['1']);
    expect(planItems.batchUpdatePositions).toHaveBeenCalledWith(updates);
  });

  it('does not batch update positions when any id is missing', () => {
    const { deps, planItems } = createMocks();
    const service = createPlanService(deps);

    const result = service.updatePositions([{ id: 'missing-id', x: 12, y: 24 }]);

    expect(result.ok).toBe(false);
    expect(planItems.batchUpdatePositions).not.toHaveBeenCalled();
  });
});
