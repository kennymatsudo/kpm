import type { BrowserWindow } from 'electron';
import { trackerEndpoints, type TrackerEndpointName } from '../../../shared/ipc/trackerEndpoints';
import type { HandlerFor } from '../../../shared/ipc/endpoints';
import type {
  SyncPreview,
} from '../../../shared/types';
import type { TrackerService } from '../../services/core/TrackerService';
import { bindRegistryHandlers } from '../validation/utils';
import { emitAppEvent } from '../../../shared/ipc/appEvents';
import { trackerEvents, type TrackerImportProgressEventData } from '../../../shared/ipc/trackerEvents';

/**
 * One handler per `trackerEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type TrackerHandlers = { [K in TrackerEndpointName]: HandlerFor<typeof trackerEndpoints, K> };

function buildTrackerHandlers(
  getMainWindow: () => BrowserWindow | null,
  trackerService: TrackerService
): TrackerHandlers {
  return {
    // ============================================
    // Credentials (stored in OS keychain via keytar)
    // ============================================

    'credentials.get': async () => trackerService.getCredentialInfo(),

    'credentials.saveJira': async ({ siteUrl, email, apiToken }) =>
      trackerService.saveJiraCredentials(siteUrl, email, apiToken),

    'credentials.delete': async () => trackerService.clearJiraCredentials(),

    'credentials.testJira': async ({ siteUrl, email, apiToken }) =>
      trackerService.testJiraConnection(siteUrl, email, apiToken),

    'credentials.saveLinear': async ({ apiToken }) => trackerService.saveLinearCredentials(apiToken),

    'credentials.deleteLinear': async () => trackerService.clearLinearCredentials(),

    'credentials.testLinear': async ({ apiToken }) => trackerService.testLinearConnection(apiToken),

    // ============================================
    // Three-Level Tracker Architecture (ADR-002)
    // ============================================

    // Level 1: Connections
    'connections.get': async () => trackerService.getConnections(),

    // Level 2: Jira Project Scopes
    'scopes.get': async ({ connectionId }) => trackerService.getScopes(connectionId),

    'scopes.add': async ({ connectionId, projectKey, projectName }) => {
      const result = trackerService.addScope(connectionId, projectKey, projectName);
      return result.ok ? { success: true, scope: result.data } : { success: false, error: result.error };
    },

    // Level 3: KPM-Jira Associations
    'associations.get': async ({ projectId }) => trackerService.getAssociations(projectId),

    'associations.add': async ({ trackerType, projectId, siteUrl, projectKey, projectName, jqlFilter, displayName }) => {
      const result = trackerService.addAssociation(trackerType, projectId, siteUrl, projectKey, projectName, jqlFilter, displayName);
      return result.ok ? { success: true, association: result.data } : { success: false, error: result.error };
    },

    'associations.remove': async ({ associationId }) => {
      const result = trackerService.removeAssociation(associationId);
      return result.ok ? { success: true } : { success: false, error: result.error };
    },

    'associations.hasImported': async ({ associationId }) => trackerService.hasAssociationItems(associationId),

    'associations.updateStatusMapping': async ({ associationId, statusMapping }) => {
      const result = trackerService.updateStatusMapping(associationId, statusMapping);
      return result.ok ? { success: true } : { success: false, error: result.error };
    },

    'associations.updateCustomFieldValues': async ({ associationId, customFieldValues }) => {
      const result = trackerService.updateCustomFieldValues(associationId, customFieldValues);
      return result.ok ? { success: true } : { success: false, error: result.error };
    },

    'associations.updateEpicKey': async ({ associationId, epicKey }) => {
      const result = trackerService.updateEpicKey(associationId, epicKey);
      return result.ok ? { success: true } : { success: false, error: result.error };
    },

    'customFields.get': async ({ projectKey, issueTypeId }) => {
      const result = await trackerService.getCustomFields(projectKey, issueTypeId);
      return result.ok ? { success: true, fields: result.data } : { success: false, error: result.error };
    },

    'projects.listJira': async () => trackerService.listJiraProjects(),

    'projects.listLinearTeams': async () => trackerService.listLinearTeams(),

    'projects.listLinearProjects': async ({ teamKey }) => {
      const result = await trackerService.listLinearProjects(teamKey);
      return result.ok ? { success: true, projects: result.data } : { success: false, error: result.error };
    },

    'project.statuses': async ({ projectKey, trackerType }) => {
      const result = await trackerService.getProjectStatuses(projectKey, trackerType);
      return result.ok ? { success: true, statuses: result.data } : { success: false, error: result.error };
    },

    // Issue search for JQL builder
    'issues.search': async ({ projectKey, searchText }) => {
      const result = await trackerService.searchIssues(projectKey, searchText);
      return result.ok ? { success: true, issues: result.data } : { success: false, error: result.error };
    },

    'issues.recent': async ({ projectKey }) => {
      const result = await trackerService.getRecentIssues(projectKey);
      return result.ok ? { success: true, issues: result.data } : { success: false, error: result.error };
    },

    // Search issues by JQL (for previewing children, etc.)
    'issues.searchJql': async ({ projectKey, jql }) => {
      const result = await trackerService.searchIssuesByJql(projectKey, jql);
      return result.ok ? { success: true, issues: result.data } : { success: false, error: result.error };
    },

    'project.labels': async ({ projectKey }) => {
      const result = await trackerService.getProjectLabels(projectKey);
      return result.ok ? { success: true, labels: result.data } : { success: false, error: result.error };
    },

    'project.components': async ({ projectKey }) => {
      const result = await trackerService.getProjectComponents(projectKey);
      return result.ok ? { success: true, components: result.data } : { success: false, error: result.error };
    },

    // ============================================
    // Import (First-Time) - Now uses associations with JQL
    // ============================================

    'import.preview': async ({ projectId, associationId }) => {
      const mainWindow = getMainWindow();
      const result = await trackerService.generateImportPreview(
        projectId,
        associationId,
        // TrackerService's onProgress param is typed `unknown` (see
        // TrackerService.ts); the underlying ImportService always emits the
        // shape below (mirrors shared/types.ts's TrackerProgressCallback).
        (data) => emitAppEvent(mainWindow?.webContents, trackerEvents.importProgress, data as TrackerImportProgressEventData)
      );
      return result.ok ? { success: true, preview: result.data } : { success: false, error: result.error };
    },

    'import.apply': async ({ projectId, associationId, selectedTypes }) => {
      const mainWindow = getMainWindow();
      const result = await trackerService.importIssues(projectId, associationId, {
        selectedTypes,
        onProgress: (data) => emitAppEvent(mainWindow?.webContents, trackerEvents.importProgress, data as TrackerImportProgressEventData),
      });
      return result.ok ? { success: true, result: result.data } : { success: false, error: result.error };
    },

    'import.all': async ({ projectId, associationId }) => {
      const mainWindow = getMainWindow();
      const result = await trackerService.importIssues(projectId, associationId, {
        onProgress: (data) => emitAppEvent(mainWindow?.webContents, trackerEvents.importProgress, data as TrackerImportProgressEventData),
      });
      return result.ok ? { success: true, result: result.data } : { success: false, error: result.error };
    },

    // ============================================
    // Sync Operations (Subsequent syncs after initial import)
    // ============================================

    'sync.preview': async ({ projectId, associationId }) => {
      const mainWindow = getMainWindow();
      const result = await trackerService.generateSyncPreview(projectId, associationId, (phase, current, total) => {
        emitAppEvent(mainWindow?.webContents, trackerEvents.syncProgress, { projectId, associationId, phase, current, total });
      });
      return result.ok ? { success: true, preview: result.data } : { success: false, error: result.error };
    },

    'sync.apply': async ({ projectId, preview, resolutions, deletedAction, deletedDecisions }) => {
      try {
        const result = trackerService.applySyncChanges(
          projectId,
          preview as SyncPreview,
          new Map(Object.entries(resolutions)),
          deletedAction,
          new Map<string, 'keep' | 'delete'>(Object.entries(deletedDecisions ?? {}))
        );
        return { success: result.success, result };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to apply sync changes. Your local data is unchanged.' };
      }
    },
  };
}

export function registerTrackerHandlers(
  getMainWindow: () => BrowserWindow | null,
  trackerService: TrackerService
): void {
  const handlers = buildTrackerHandlers(getMainWindow, trackerService);
  bindRegistryHandlers(trackerEndpoints, handlers);
}
