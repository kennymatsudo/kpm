import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackerMetadataKey, useTrackerMetadataStore } from './useMetadataStore';

const listTrackerIssueTypes = vi.hoisted(() => vi.fn());
vi.mock('../../services/trackerService', () => ({
  listTrackerIssueTypes,
  listTrackerProjectStatuses: vi.fn(),
  listTrackerProjects: vi.fn(),
}));

const linearTypes = [{ id: 'l1', name: 'Linear label', subtask: false }];
const jiraTypes = [{ id: 'j1', name: 'Story', subtask: false }];

describe('useTrackerMetadataStore issue types', () => {
  beforeEach(() => {
    useTrackerMetadataStore.getState().reset();
    listTrackerIssueTypes.mockReset();
    listTrackerIssueTypes.mockImplementation(async (_key: string, trackerType: string) => ({
      success: true,
      issueTypes: trackerType === 'linear' ? linearTypes : jiraTypes,
    }));
  });

  it('keeps a Linear team and a Jira project with the same key apart', async () => {
    const { loadIssueTypes } = useTrackerMetadataStore.getState();

    await loadIssueTypes('ENG', 'linear');
    await loadIssueTypes('ENG', 'jira');

    expect(listTrackerIssueTypes).toHaveBeenCalledTimes(2);
    const { issueTypesByProject } = useTrackerMetadataStore.getState();
    expect(issueTypesByProject[trackerMetadataKey('linear', 'ENG')]).toEqual(linearTypes);
    expect(issueTypesByProject[trackerMetadataKey('jira', 'ENG')]).toEqual(jiraTypes);
  });
});
