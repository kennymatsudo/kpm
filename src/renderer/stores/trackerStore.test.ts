import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { useTrackerStore } from './trackerStore';

describe('trackerStore', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useTrackerStore.getState().reset();
    vi.clearAllMocks();
  });

  it('updates an association epic key through the tracker domain and reloads associations', async () => {
    const association = {
      id: 'assoc-1',
      kpm_project_id: 'project-1',
      scope_id: 'scope-1',
      issue_filter: 'project = PROJ',
      display_name: 'Jira Project',
      status_mapping: null,
      custom_field_values: null,
      epic_key: null,
      last_synced_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      tracker_type: 'jira' as const,
      project_key: 'PROJ',
      project_name: 'Project',
      site_url: 'https://example.atlassian.net',
    };

    useTrackerStore.setState({
      associations: [association],
      isLoadingAssociations: false,
      isImporting: false,
      importProgress: null,
      importPreview: null,
      importError: null,
      showAssociationDialog: false,
      showImportPanel: false,
      activeAssociationId: null,
      error: null,
    });
    api.tracker.associations.updateEpicKey.mockResolvedValue({ success: true });
    api.tracker.associations.list.mockResolvedValue([{ ...association, epic_key: 'PROJ-123' }]);

    const result = await useTrackerStore.getState().updateAssociationEpicKey('assoc-1', 'PROJ-123');

    expect(api.tracker.associations.updateEpicKey).toHaveBeenCalledWith({ associationId: 'assoc-1', epicKey: 'PROJ-123' });
    expect(api.tracker.associations.list).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(result).toEqual({ success: true });
    expect(useTrackerStore.getState().associations[0]?.epic_key).toBe('PROJ-123');
  });

  it('returns associations by id from the tracker domain', () => {
    const association = {
      id: 'assoc-1',
      kpm_project_id: 'project-1',
      scope_id: 'scope-1',
      issue_filter: 'project = PROJ',
      display_name: 'Jira Project',
      status_mapping: null,
      custom_field_values: null,
      epic_key: null,
      last_synced_at: null,
      created_at: '2024-01-01T00:00:00.000Z',
      tracker_type: 'jira' as const,
      project_key: 'PROJ',
      project_name: 'Project',
      site_url: 'https://example.atlassian.net',
    };

    useTrackerStore.setState({
      associations: [association],
      isLoadingAssociations: false,
      isImporting: false,
      importProgress: null,
      importPreview: null,
      importError: null,
      showAssociationDialog: false,
      showImportPanel: false,
      activeAssociationId: null,
      error: null,
    });

    expect(useTrackerStore.getState().getAssociationById('assoc-1')).toEqual(association);
    expect(useTrackerStore.getState().getAssociationById('missing')).toBeNull();
  });
});
