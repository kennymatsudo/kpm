import { describe, expect, it, vi } from 'vitest';
import {
  createTrackerService,
  FULL_SYNC_CHECK_INTERVAL_MS,
  SYNC_CHECK_SAFETY_MARGIN_MS,
} from '../../src/main/services/core/TrackerService';

describe('TrackerService', () => {
  it('hydrates associations through connection and scope orchestration', () => {
    const tracker = {
      getConnections: vi.fn(() => []),
      getScopesByConnection: vi.fn(() => []),
      getAssociationsByProject: vi.fn(() => []),
      getOrCreateConnection: vi.fn(() => ({ id: 'conn-1' })),
      getOrCreateScope: vi.fn(() => ({ id: 'scope-1' })),
      createAssociation: vi.fn(() => ({ id: 'assoc-1' })),
      getAssociationById: vi.fn(() => ({ id: 'assoc-1', project_key: 'PROJ' })),
      deleteAssociation: vi.fn(),
      hasAssociationItems: vi.fn(() => false),
      updateStatusMapping: vi.fn(),
      updateCustomFieldValues: vi.fn(),
      updateEpicKey: vi.fn(),
    };

    const service = createTrackerService({
      tracker: tracker as never,
      clientService: {
        getClient: vi.fn(),
        getJiraCredentialsInfo: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient: vi.fn(),
        getLinearClient: vi.fn(),
        getLinearCredentialsInfo: vi.fn(),
        getLinearTeams: vi.fn(),
      },
      importService: {
        generateImportPreview: vi.fn(),
        importIssues: vi.fn(),
      },
      syncService: {
        generateSyncPreview: vi.fn(),
        applySyncChanges: vi.fn(),
      },
    });

    const result = service.addAssociation('jira', 'project-1', 'site.atlassian.net', 'PROJ', 'Sample Project', 'project = PROJ', 'Main');

    expect(result.ok).toBe(true);
    expect(tracker.getOrCreateConnection).toHaveBeenCalledWith('jira', 'site.atlassian.net');
    expect(tracker.getOrCreateScope).toHaveBeenCalledWith('conn-1', 'PROJ', 'Sample Project');
    expect(tracker.createAssociation).toHaveBeenCalledWith('project-1', 'scope-1', 'project = PROJ', 'Main');
  });

  it('rejects linking a second tracker type to the same project', () => {
    const tracker = {
      getConnections: vi.fn(() => []),
      getScopesByConnection: vi.fn(() => []),
      // Project already linked to Jira — attempting to add Linear must fail.
      getAssociationsByProject: vi.fn(() => [
        { id: 'assoc-existing', tracker_type: 'jira', kpm_project_id: 'project-1' },
      ]),
      getOrCreateConnection: vi.fn(() => ({ id: 'conn-1' })),
      getOrCreateScope: vi.fn(() => ({ id: 'scope-1' })),
      createAssociation: vi.fn(() => ({ id: 'assoc-new' })),
      getAssociationById: vi.fn(),
      deleteAssociation: vi.fn(),
      hasAssociationItems: vi.fn(() => false),
      updateStatusMapping: vi.fn(),
      updateCustomFieldValues: vi.fn(),
      updateEpicKey: vi.fn(),
    };

    const service = createTrackerService({
      tracker: tracker as never,
      clientService: {
        getClient: vi.fn(),
        getJiraCredentialsInfo: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient: vi.fn(),
        getLinearClient: vi.fn(),
        getLinearCredentialsInfo: vi.fn(),
        getLinearTeams: vi.fn(),
      },
      importService: { generateImportPreview: vi.fn(), importIssues: vi.fn() },
      syncService: { generateSyncPreview: vi.fn(), applySyncChanges: vi.fn() },
    });

    const result = service.addAssociation('linear', 'project-1', 'linear.app', 'ENG', 'Engineering', '{}');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already linked to Jira/i);
    }
    expect(tracker.getOrCreateConnection).not.toHaveBeenCalled();
    expect(tracker.createAssociation).not.toHaveBeenCalled();
  });

  it('loads Linear projects through the Linear client', async () => {
    const getProjectsForTeam = vi.fn().mockResolvedValue([{ id: 'proj-1', name: 'Roadmap' }]);
    const getLinearClient = vi.fn().mockResolvedValue({ getProjectsForTeam });
    const service = createTrackerService({
      tracker: {} as never,
      clientService: {
        getClient: vi.fn(),
        getJiraCredentialsInfo: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient: vi.fn(),
        getLinearClient,
        getLinearCredentialsInfo: vi.fn(),
        getLinearTeams: vi.fn(),
      },
      importService: { generateImportPreview: vi.fn(), importIssues: vi.fn() },
      syncService: { generateSyncPreview: vi.fn(), applySyncChanges: vi.fn() },
    });

    const result = await service.listLinearProjects('ENG');

    expect(result).toEqual({ ok: true, data: [{ id: 'proj-1', name: 'Roadmap' }] });
    expect(getLinearClient).toHaveBeenCalledTimes(1);
    expect(getProjectsForTeam).toHaveBeenCalledWith('ENG');
  });

  it('fails sync preview early when the association is missing', async () => {
    const getJiraClient = vi.fn();
    const service = createTrackerService({
      tracker: {
        getConnections: vi.fn(() => []),
        getScopesByConnection: vi.fn(() => []),
        getOrCreateConnection: vi.fn(),
        getOrCreateScope: vi.fn(),
        createAssociation: vi.fn(),
        getAssociationById: vi.fn(() => undefined),
        deleteAssociation: vi.fn(),
        hasAssociationItems: vi.fn(() => false),
        updateStatusMapping: vi.fn(),
        updateCustomFieldValues: vi.fn(),
        updateEpicKey: vi.fn(),
      } as never,
      clientService: {
        getClient: vi.fn(),
        getJiraCredentialsInfo: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient,
        getLinearClient: vi.fn(),
        getLinearCredentialsInfo: vi.fn(),
        getLinearTeams: vi.fn(),
      },
      importService: {
        generateImportPreview: vi.fn(),
        importIssues: vi.fn(),
      },
      syncService: {
        generateSyncPreview: vi.fn(),
        applySyncChanges: vi.fn(),
      },
    });

    const result = await service.generateSyncPreview('project-1', 'assoc-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Association not found');
    }
    expect(getJiraClient).not.toHaveBeenCalled();
  });

  describe('checkSyncChanges', () => {
    const CLEAN_STATS = { total: 3, new: 0, updated: 0, conflicts: 0, deleted: 0, unchanged: 3 };

    function setup(stats = CLEAN_STATS) {
      let nowMs = 1_000_000;
      const hasIssuesUpdatedSince = vi.fn(async () => false);
      const generateSyncPreview = vi.fn(async () => ({ link_id: 'assoc-1', stats }));
      const service = createTrackerService({
        tracker: {
          getAssociationById: vi.fn(() => ({ id: 'assoc-1', tracker_type: 'linear', issue_filter: '{"teamKey":"ENG"}' })),
        } as never,
        clientService: { getClient: vi.fn(async () => ({ hasIssuesUpdatedSince })) } as never,
        importService: { generateImportPreview: vi.fn(), importIssues: vi.fn() },
        syncService: { generateSyncPreview, applySyncChanges: vi.fn() } as never,
        now: () => nowMs,
      });
      return {
        service,
        hasIssuesUpdatedSince,
        generateSyncPreview,
        advance: (ms: number) => { nowMs += ms; },
        nowMs: () => nowMs,
      };
    }

    it('does a full preview when there is no earlier clean check', async () => {
      const { service, hasIssuesUpdatedSince, generateSyncPreview } = setup();

      const result = await service.checkSyncChanges('project-1', 'assoc-1');

      expect(result).toMatchObject({ ok: true, data: { unchanged: false } });
      expect(hasIssuesUpdatedSince).not.toHaveBeenCalled();
      expect(generateSyncPreview).toHaveBeenCalledTimes(1);
      expect(generateSyncPreview.mock.calls[0]).toHaveLength(3);
    });

    it('skips the full fetch when nothing was updated since the last clean check', async () => {
      const { service, hasIssuesUpdatedSince, generateSyncPreview, advance, nowMs } = setup();
      await service.checkSyncChanges('project-1', 'assoc-1');
      const firstCheckStart = nowMs();
      advance(120_000);

      const result = await service.checkSyncChanges('project-1', 'assoc-1');

      expect(result).toMatchObject({ ok: true, data: { unchanged: true } });
      expect(generateSyncPreview).toHaveBeenCalledTimes(1);
      expect(hasIssuesUpdatedSince).toHaveBeenCalledWith(
        '{"teamKey":"ENG"}',
        new Date(firstCheckStart - SYNC_CHECK_SAFETY_MARGIN_MS)
      );
    });

    it('builds the full preview when the tracker reports an updated issue', async () => {
      const { service, hasIssuesUpdatedSince, generateSyncPreview, advance } = setup();
      await service.checkSyncChanges('project-1', 'assoc-1');
      advance(120_000);
      hasIssuesUpdatedSince.mockResolvedValueOnce(true);

      const result = await service.checkSyncChanges('project-1', 'assoc-1');

      expect(result).toMatchObject({ ok: true, data: { unchanged: false } });
      expect(generateSyncPreview).toHaveBeenCalledTimes(2);
    });

    it('does a full preview again once the last full fetch is older than the interval', async () => {
      const { service, hasIssuesUpdatedSince, generateSyncPreview, advance } = setup();
      await service.checkSyncChanges('project-1', 'assoc-1');
      advance(FULL_SYNC_CHECK_INTERVAL_MS - 1000);
      await service.checkSyncChanges('project-1', 'assoc-1');
      expect(generateSyncPreview).toHaveBeenCalledTimes(1);
      advance(2000);

      await service.checkSyncChanges('project-1', 'assoc-1');

      expect(generateSyncPreview).toHaveBeenCalledTimes(2);
      expect(hasIssuesUpdatedSince).toHaveBeenCalledTimes(1);
    });

    it('keeps fetching in full while the previous preview still has changes to review', async () => {
      const { service, hasIssuesUpdatedSince, generateSyncPreview, advance } = setup({ ...CLEAN_STATS, deleted: 1 });
      await service.checkSyncChanges('project-1', 'assoc-1');
      advance(120_000);

      await service.checkSyncChanges('project-1', 'assoc-1');

      expect(hasIssuesUpdatedSince).not.toHaveBeenCalled();
      expect(generateSyncPreview).toHaveBeenCalledTimes(2);
    });
  });
});
