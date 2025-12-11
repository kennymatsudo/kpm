import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProjectStore, type ProjectState } from './projectStore';
import { createMockApi } from '../../../tests/mocks/electron-api';
import type { API } from '../../preload/api';

function createStore() {
  const api = createMockApi();
  const emit = vi.fn();
  const store = createProjectStore({ api: api as unknown as API, emit });
  return { store, api, emit };
}

describe('projectStore slices', () => {
  let store: ReturnType<typeof createStore>['store'];
  let api: ReturnType<typeof createStore>['api'];
  let emit: ReturnType<typeof createStore>['emit'];

  beforeEach(() => {
    ({ store, api, emit } = createStore());
  });

  it('removes repo branches when removing a repo', () => {
    const repoId = 'repo-1';
    store.setState({
      repos: [{ id: repoId, project_id: 'p1', path: '/tmp/repo', created_at: '' }],
      repoBranches: { [repoId]: 'main' },
    } as Partial<ProjectState>);

    store.getState().removeRepo(repoId);

    expect(store.getState().repos).toEqual([]);
    expect(store.getState().repoBranches).toEqual({});
  });

  it('queues tracker status change event when updating status category on external items', async () => {
    api.plan.updateItem.mockResolvedValue({ success: true });

    store.setState({
      currentProjectId: 'project-1',
      planItems: [{
        id: 'item-1',
        project_id: 'project-1',
        title: 'External item',
        description: null,
        label: 'task',
        status: 'planned',
        status_category: 'not_started',
        parent_id: null,
        item_order: 0,
        code_refs: null,
        release_tag: null,
        position_x: null,
        position_y: null,
        association_id: 'assoc-1',
        external_key: 'EXT-123',
        external_id: 'ext-id',
        external_type: 'jira',
        external_issue_type: 'Story',
        external_status: 'To Do',
        external_url: 'https://example.com',
        external_parent_key: null,
        external_epic_key: null,
        sync_source: 'local',
        last_synced_at: null,
        created_at: '',
        updated_at: '',
      }],
    } as Partial<ProjectState>);

    await store.getState().updateStatusCategory('item-1', 'done');

    expect(api.plan.updateItem).toHaveBeenCalledWith('item-1', { status_category: 'done' });
    expect(emit).toHaveBeenCalledWith({
      type: 'status-changed',
      payload: {
        projectId: 'project-1',
        itemId: 'item-1',
        statusCategory: 'done',
        externalKey: 'EXT-123',
        associationId: 'assoc-1',
      },
    });
    expect(store.getState().planItems[0].status_category).toBe('done');
  });
});
