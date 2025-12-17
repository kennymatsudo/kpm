import { describe, it, expect, vi } from 'vitest';
import type { PlanItem, PlanRelation } from '../../src/shared/types';

const baseItem: PlanItem = {
  id: '1',
  project_id: 'project-1',
  title: 'Item 1',
  description: null,
  label: null,
  status: 'planned',
  status_category: null,
  parent_id: null,
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
    add: vi.fn(),
    delete: vi.fn((id: string) => itemStore.delete(id)),
    deleteWithDescendants: vi.fn(),
    update: vi.fn(),
    updatePosition: vi.fn(),
    batchReparent: vi.fn((updates: { id: string; parentId: string | null }[]) => updates.map(u => u.id)),
  };

  const planRelations = {
    add: vi.fn((relation: Omit<PlanRelation, 'id'>) => ({ ...relation, id: 'r1' })),
    getByProject: vi.fn(() => [] as PlanRelation[]),
    remove: vi.fn(),
    delete: vi.fn(),
    deleteByItem: vi.fn(),
  };

  const queueTrackerUpdateIfNeeded = vi.fn();

  const deps: PlanServiceDeps = {
    planItems,
    planRelations,
    queueTrackerUpdateIfNeeded,
    ...overrides,
  };

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


    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Item not found');
    }
  });
});
