import { ipcMain, type BrowserWindow } from 'electron';
import { TrackerSchemas } from '../validation';
import { IPC_CHANNELS } from '../channels';
import type {
  SyncPreview,
} from '../../../shared/types';
import type { TrackerService } from '../../services/core/TrackerService';

export function registerTrackerHandlers(
  getMainWindow: () => BrowserWindow | null,
  trackerService: TrackerService
): void {
  // ============================================
  // Credentials (stored in OS keychain via keytar)
  // ============================================

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.get, async () => {
    return trackerService.getCredentialInfo();
  });

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.saveJira, async (_e, params: unknown) => {
    const { siteUrl, email, apiToken } = TrackerSchemas.saveJiraCredentials.parse(params);
    return trackerService.saveJiraCredentials(siteUrl, email, apiToken);
  });

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.delete, async () => {
    return trackerService.clearJiraCredentials();
  });

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.testJira, async (_e, params: unknown) => {
    const { siteUrl, email, apiToken } = TrackerSchemas.testJiraConnection.parse(params);
    return trackerService.testJiraConnection(siteUrl, email, apiToken);
  });

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.saveLinear, async (_e, params: unknown) => {
    const { apiToken } = TrackerSchemas.saveLinearCredentials.parse(params);
    return trackerService.saveLinearCredentials(apiToken);
  });

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.deleteLinear, async () => {
    return trackerService.clearLinearCredentials();
  });

  ipcMain.handle(IPC_CHANNELS.tracker.credentials.testLinear, async (_e, params: unknown) => {
    const { apiToken } = TrackerSchemas.testLinearConnection.parse(params);
    return trackerService.testLinearConnection(apiToken);
  });

  // ============================================
  // Three-Level Tracker Architecture (ADR-002)
  // ============================================

  // Level 1: Connections
  ipcMain.handle(IPC_CHANNELS.tracker.connections.get, async () => {
    return trackerService.getConnections();
  });

  // Level 2: Jira Project Scopes
  ipcMain.handle(IPC_CHANNELS.tracker.scopes.get, async (_e, params: unknown) => {
    const { connectionId } = TrackerSchemas.getScopes.parse(params);
    return trackerService.getScopes(connectionId);
  });

  ipcMain.handle(IPC_CHANNELS.tracker.scopes.add, async (_e, params: unknown) => {
    const { connectionId, projectKey, projectName } = TrackerSchemas.addScope.parse(params);
    const result = trackerService.addScope(connectionId, projectKey, projectName);
    return result.ok ? { success: true, scope: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.get, async (_e, params: unknown) => {
    const { projectId } = TrackerSchemas.getAssociations.parse(params);
    return trackerService.getAssociations(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.add, async (_e, params: unknown) => {
    const { trackerType, projectId, siteUrl, projectKey, projectName, jqlFilter, displayName } = TrackerSchemas.addAssociation.parse(params);
    const result = trackerService.addAssociation(trackerType, projectId, siteUrl, projectKey, projectName, jqlFilter, displayName);
    return result.ok ? { success: true, association: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.remove, async (_e, params: unknown) => {
    const { associationId } = TrackerSchemas.removeAssociation.parse(params);
    const result = trackerService.removeAssociation(associationId);
    return result.ok ? { success: true } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.hasImported, async (_e, params: unknown) => {
    const { associationId } = TrackerSchemas.hasImported.parse(params);
    return trackerService.hasAssociationItems(associationId);
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.updateStatusMapping, async (_e, params: unknown) => {
    const { associationId, statusMapping } = TrackerSchemas.updateStatusMapping.parse(params);
    const result = trackerService.updateStatusMapping(associationId, statusMapping);
    return result.ok ? { success: true } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.updateCustomFieldValues, async (_e, params: unknown) => {
    const { associationId, customFieldValues } = TrackerSchemas.updateCustomFieldValues.parse(params);
    const result = trackerService.updateCustomFieldValues(associationId, customFieldValues);
    return result.ok ? { success: true } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.associations.updateEpicKey, async (_e, params: unknown) => {
    const { associationId, epicKey } = TrackerSchemas.updateEpicKey.parse(params);
    const result = trackerService.updateEpicKey(associationId, epicKey);
    return result.ok ? { success: true } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.customFields.get, async (_e, params: unknown) => {
    const { projectKey, issueTypeId } = TrackerSchemas.getCustomFields.parse(params);
    const result = await trackerService.getCustomFields(projectKey, issueTypeId);
    return result.ok ? { success: true, fields: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.projects.listJira, async () => {
    return trackerService.listJiraProjects();
  });

  ipcMain.handle(IPC_CHANNELS.tracker.projects.listLinearTeams, async () => {
    return trackerService.listLinearTeams();
  });

  ipcMain.handle(IPC_CHANNELS.tracker.projects.listLinearProjects, async (_e, params: unknown) => {
    const { teamKey } = TrackerSchemas.listLinearProjects.parse(params);
    const result = await trackerService.listLinearProjects(teamKey);
    return result.ok ? { success: true, projects: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.project.statuses, async (_e, params: unknown) => {
    const { projectKey, trackerType } = TrackerSchemas.getProjectStatuses.parse(params);
    const result = await trackerService.getProjectStatuses(projectKey, trackerType);
    return result.ok ? { success: true, statuses: result.data } : { success: false, error: result.error };
  });

  // Issue search for JQL builder
  ipcMain.handle(IPC_CHANNELS.tracker.issues.search, async (_e, params: unknown) => {
    const { projectKey, searchText } = TrackerSchemas.searchIssues.parse(params);
    const result = await trackerService.searchIssues(projectKey, searchText);
    return result.ok ? { success: true, issues: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.issues.recent, async (_e, params: unknown) => {
    const { projectKey } = TrackerSchemas.recentIssues.parse(params);
    const result = await trackerService.getRecentIssues(projectKey);
    return result.ok ? { success: true, issues: result.data } : { success: false, error: result.error };
  });

  // Search issues by JQL (for previewing children, etc.)
  ipcMain.handle(IPC_CHANNELS.tracker.issues.searchJql, async (_e, params: unknown) => {
    const { projectKey, jql } = TrackerSchemas.searchIssuesByJql.parse(params);
    const result = await trackerService.searchIssuesByJql(projectKey, jql);
    return result.ok ? { success: true, issues: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.project.labels, async (_e, params: unknown) => {
    const { projectKey } = TrackerSchemas.projectLabels.parse(params);
    const result = await trackerService.getProjectLabels(projectKey);
    return result.ok ? { success: true, labels: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.project.components, async (_e, params: unknown) => {
    const { projectKey } = TrackerSchemas.projectComponents.parse(params);
    const result = await trackerService.getProjectComponents(projectKey);
    return result.ok ? { success: true, components: result.data } : { success: false, error: result.error };
  });

  // ============================================
  // Import (First-Time) - Now uses associations with JQL
  // ============================================

  ipcMain.handle(IPC_CHANNELS.tracker.import.preview, async (_e, params: unknown) => {
    const { projectId, associationId } = TrackerSchemas.importPreview.parse(params);
    const mainWindow = getMainWindow();
    const result = await trackerService.generateImportPreview(
      projectId,
      associationId,
      (data) => mainWindow?.webContents.send('tracker:import:progress', data)
    );
    return result.ok ? { success: true, preview: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.import.apply, async (_e, params: unknown) => {
    const { projectId, associationId, selectedTypes } = TrackerSchemas.importApply.parse(params);
    const mainWindow = getMainWindow();
    const result = await trackerService.importIssues(projectId, associationId, {
      selectedTypes,
      onProgress: (data) => mainWindow?.webContents.send('tracker:import:progress', data),
    });
    return result.ok ? { success: true, result: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.import.all, async (_e, params: unknown) => {
    const { projectId, associationId } = TrackerSchemas.importPreview.parse(params);
    const mainWindow = getMainWindow();
    const result = await trackerService.importIssues(projectId, associationId, {
      onProgress: (data) => mainWindow?.webContents.send('tracker:import:progress', data),
    });
    return result.ok ? { success: true, result: result.data } : { success: false, error: result.error };
  });

  // ============================================
  // Sync Operations (Subsequent syncs after initial import)
  // ============================================

  ipcMain.handle(IPC_CHANNELS.tracker.sync.preview, async (_e, params: unknown) => {
    const { projectId, associationId } = TrackerSchemas.syncPreview.parse(params);
    const mainWindow = getMainWindow();
    const result = await trackerService.generateSyncPreview(projectId, associationId, (phase, current, total) => {
      mainWindow?.webContents.send('tracker:sync:progress', { projectId, associationId, phase, current, total });
    });
    return result.ok ? { success: true, preview: result.data } : { success: false, error: result.error };
  });

  ipcMain.handle(IPC_CHANNELS.tracker.sync.apply, async (_e, params: unknown) => {
    const { projectId, preview, resolutions, deletedAction, deletedDecisions } = TrackerSchemas.syncApply.parse(params);
    try {
      const result = trackerService.applySyncChanges(
        projectId,
        preview as SyncPreview,
        new Map<string, 'keep' | 'delete'>(Object.entries(deletedDecisions ?? {}))
      );
      return { success: result.success, result };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed to apply sync changes. Your local data is unchanged.' };
    }
  });
}
