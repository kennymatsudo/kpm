import { describe, expect, it, vi } from 'vitest';
import { createTrackerService } from '../../src/main/services/core/TrackerService';

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
        saveJiraCredentials: vi.fn(),
        clearJiraCredentials: vi.fn(),
        testJiraConnection: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient: vi.fn(),
        getLinearClient: vi.fn(),
        getLinearCredentialsInfo: vi.fn(),
        saveLinearCredentials: vi.fn(),
        clearLinearCredentials: vi.fn(),
        testLinearConnection: vi.fn(),
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
        saveJiraCredentials: vi.fn(),
        clearJiraCredentials: vi.fn(),
        testJiraConnection: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient: vi.fn(),
        getLinearClient: vi.fn(),
        getLinearCredentialsInfo: vi.fn(),
        saveLinearCredentials: vi.fn(),
        clearLinearCredentials: vi.fn(),
        testLinearConnection: vi.fn(),
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
    const service = createTrackerService({
      tracker: {} as never,
      clientService: {
        getClient: vi.fn(),
        getJiraCredentialsInfo: vi.fn(),
        saveJiraCredentials: vi.fn(),
        clearJiraCredentials: vi.fn(),
        testJiraConnection: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient: vi.fn(),
        getLinearClient,
        getLinearCredentialsInfo: vi.fn(),
        saveLinearCredentials: vi.fn(),
        clearLinearCredentials: vi.fn(),
        testLinearConnection: vi.fn(),
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
        saveJiraCredentials: vi.fn(),
        clearJiraCredentials: vi.fn(),
        testJiraConnection: vi.fn(),
        getJiraProjects: vi.fn(),
        getJiraClient,
        getLinearClient: vi.fn(),
        getLinearCredentialsInfo: vi.fn(),
        saveLinearCredentials: vi.fn(),
        clearLinearCredentials: vi.fn(),
        testLinearConnection: vi.fn(),
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
});
