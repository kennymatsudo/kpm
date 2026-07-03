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

  it('refreshes projects after updating the Storybook URL', async () => {
    const refreshedProjects = [{
      id: 'project-1',
      name: 'Project One',
      folder_path: '/tmp/project-one',
      phase: 'discovery',
      session_tokens: 0,
      session_input_tokens: 0,
      session_output_tokens: 0,
      storybook_url: 'http://localhost:6006',
    }];
    api.storybook.updateUrl.mockResolvedValue({ success: true });
    api.projects.list.mockResolvedValue(refreshedProjects);

    const result = await store.getState().updateProjectStorybookUrl('project-1', 'http://localhost:6006');

    expect(api.storybook.updateUrl).toHaveBeenCalledWith({ projectId: 'project-1', storybookUrl: 'http://localhost:6006' });
    expect(api.projects.list).toHaveBeenCalled();
    expect(result).toEqual(refreshedProjects);
    expect(store.getState().projects).toEqual(refreshedProjects);
  });

  it('adds repos through the resource domain and tracks their branches', async () => {
    const repos = [
      { id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1' },
      { id: 'repo-2', project_id: 'project-1', path: '/tmp/repo-2' },
    ];

    api.repos.add
      .mockResolvedValueOnce(repos[0])
      .mockResolvedValueOnce(repos[1]);
    api.repos.getBranches.mockResolvedValue({
      '/tmp/repo-1': 'main',
      '/tmp/repo-2': 'develop',
    });

    const result = await store.getState().addReposToProject('project-1', repos.map((repo) => repo.path));

    expect(api.repos.add).toHaveBeenNthCalledWith(1, { projectId: 'project-1', path: '/tmp/repo-1' });
    expect(api.repos.add).toHaveBeenNthCalledWith(2, { projectId: 'project-1', path: '/tmp/repo-2' });
    expect(api.repos.getBranches).toHaveBeenCalledWith({ paths: ['/tmp/repo-1', '/tmp/repo-2'] });
    expect(api.repos.watch).toHaveBeenNthCalledWith(1, { repoId: 'repo-1', path: '/tmp/repo-1' });
    expect(api.repos.watch).toHaveBeenNthCalledWith(2, { repoId: 'repo-2', path: '/tmp/repo-2' });
    expect(result).toEqual(repos);
    expect(store.getState().repos).toEqual(repos);
    expect(store.getState().repoBranches).toEqual({
      'repo-1': 'main',
      'repo-2': 'develop',
    });
  });

  it('removes repos through the resource domain and stops watching them', async () => {
    store.setState({
      repos: [{ id: 'repo-1', project_id: 'project-1', path: '/tmp/repo-1', created_at: '' }],
      repoBranches: { 'repo-1': 'main' },
    } as Partial<ProjectState>);

    await store.getState().removeRepoFromProject('project-1', 'repo-1');

    expect(api.repos.remove).toHaveBeenCalledWith({ repoId: 'repo-1' });
    expect(api.repos.unwatch).toHaveBeenCalledWith({ path: '/tmp/repo-1' });
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
        intent: null,
        acceptance_criteria: null,
        source_document_id: null,
        created_at: '',
        updated_at: '',
      }],
    } as Partial<ProjectState>);

    await store.getState().updateStatusCategory('item-1', 'done');

    expect(api.plan.updateItem).toHaveBeenCalledWith({ itemId: 'item-1', updates: { status_category: 'done' } });
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
