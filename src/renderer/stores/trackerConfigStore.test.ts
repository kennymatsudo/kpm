import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockApi, type MockApi } from '../../../tests/mocks/electron-api';
import { useTrackerConfigStore } from './tracker/useConfigStore';

describe('tracker config store', () => {
  let api: MockApi;

  beforeEach(() => {
    api = installMockApi();
    useTrackerConfigStore.getState().reset();
    vi.clearAllMocks();
  });

  it('loads and caches supported custom fields with suggested default values', async () => {
    api.tracker.customFields.getAvailable.mockResolvedValue({
      success: true,
      fields: [
        {
          id: 'unsupported-field',
          name: 'Unsupported',
          type: 'number',
          required: false,
        },
        {
          id: 'optional-select',
          name: 'Optional Select',
          type: 'option',
          required: false,
          defaultValue: 'option-1',
          allowedValues: [{ id: 'option-1', value: 'Team A' }],
        },
        {
          id: 'required-text',
          name: 'Required Text',
          type: 'string',
          required: true,
          defaultValue: 'seeded',
        },
      ],
    });

    const firstResult = await useTrackerConfigStore.getState().loadCustomFields(
      'PROJ',
      'epic',
      { 'optional-select': 'existing-value' }
    );
    const secondResult = await useTrackerConfigStore.getState().loadCustomFields(
      'PROJ',
      'epic',
      {}
    );

    expect(api.tracker.customFields.getAvailable).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({
      success: true,
      fields: [
        {
          id: 'required-text',
          name: 'Required Text',
          type: 'string',
          required: true,
          defaultValue: 'seeded',
        },
        {
          id: 'optional-select',
          name: 'Optional Select',
          type: 'option',
          required: false,
          defaultValue: 'option-1',
          allowedValues: [{ id: 'option-1', value: 'Team A' }],
        },
      ],
      suggestedValues: { 'required-text': 'seeded' },
    });
    expect(secondResult).toEqual({
      success: true,
      fields: firstResult.fields,
      suggestedValues: {
        'optional-select': 'option-1',
        'required-text': 'seeded',
      },
    });
  });

  it('saves a cleaned status mapping through the tracker association domain', async () => {
    api.tracker.associations.updateStatusMapping.mockResolvedValue({ success: true });

    const result = await useTrackerConfigStore.getState().saveStatusMapping('assoc-1', {
      not_started: 'To Do',
      in_progress: '',
      done: 'Done',
      blocked: undefined,
      canceled: undefined,
    });

    expect(api.tracker.associations.updateStatusMapping).toHaveBeenCalledWith('assoc-1', {
      not_started: 'To Do',
      done: 'Done',
    });
    expect(result).toEqual({
      success: true,
      savedMapping: {
        not_started: 'To Do',
        done: 'Done',
      },
    });
  });

  it('searches epic issues through JQL instead of leaving query construction in the UI', async () => {
    api.tracker.issues.searchByJql.mockResolvedValue({
      success: true,
      issues: [{ key: 'PROJ-1', title: 'Epic 1', issueType: 'Epic', status: 'To Do' }],
    });

    const result = await useTrackerConfigStore.getState().searchIssues('PROJ', 'roadmap', 'Epic');

    expect(api.tracker.issues.searchByJql).toHaveBeenCalledWith(
      'PROJ',
      'project = PROJ AND type = Epic AND (key ~ "roadmap" OR summary ~ "roadmap*") ORDER BY updated DESC'
    );
    expect(result).toEqual({
      success: true,
      issues: [{ key: 'PROJ-1', title: 'Epic 1', issueType: 'Epic', status: 'To Do' }],
    });
  });
});
