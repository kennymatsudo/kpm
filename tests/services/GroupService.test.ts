import { describe, expect, it, vi } from 'vitest';
import { createGroupService } from '../../src/main/services/core/GroupService';
import type { Group, PlanItem } from '../../src/shared/types';

const item: PlanItem = {
  id: 'item-1',
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
  position_x: 10,
  position_y: 20,
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

const group: Group = {
  id: 'group-1',
  project_id: 'project-1',
  name: 'Group',
  color: '#fff',
  position_x: 0,
  position_y: 0,
  width: 100,
  height: 100,
  is_collapsed: false,
  created_at: '',
  updated_at: '',
};

describe('GroupService', () => {
  it('assigns an item to a group through the shared assignment rule', () => {
    const groups = {
      getByProjectId: vi.fn(() => [group]),
      getById: vi.fn(() => group),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updatePosition: vi.fn(),
      updateSize: vi.fn(),
    };
    const planItems = {
      get: vi.fn(() => item),
      update: vi.fn(),
    };

    const service = createGroupService({
      groups: groups as never,
      planItems: planItems as never,
    });

    const result = service.assignItem(item.id, group.id);

    expect(result.ok).toBe(true);
    expect(planItems.update).toHaveBeenCalledWith(item.id, {
      group_id: group.id,
      position_x: null,
      position_y: null,
    });
  });

  it('rejects cross-project group assignment', () => {
    const groups = {
      getByProjectId: vi.fn(() => [group]),
      getById: vi.fn(() => ({ ...group, project_id: 'project-2' })),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updatePosition: vi.fn(),
      updateSize: vi.fn(),
    };
    const planItems = {
      get: vi.fn(() => item),
      update: vi.fn(),
    };

    const service = createGroupService({
      groups: groups as never,
      planItems: planItems as never,
    });

    const result = service.assignItem(item.id, group.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('another project');
    }
    expect(planItems.update).not.toHaveBeenCalled();
  });
});
