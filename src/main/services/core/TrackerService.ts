import type {
  ConflictResolution,
  CustomFieldValues,
  DeletedItemAction,
  ImportPreview,
  ImportResult,
  JiraCustomField,
  StatusMapping,
  SyncPreview,
  SyncResult,
  TrackerAssociationWithScope,
  TrackerConnection,
  TrackerProjectScope,
  TrackerType,
} from '../../../shared/types';
import type { ITrackerRepository } from '../../db/interfaces';
import { failure, success, wrap, type AsyncResult, type ServiceResult, wrapAsync } from '../result';
import type { ImportService, SyncService } from '../../db/domain';
import type { JiraClient, LinearClient, TrackerClient } from '../../tracker-clients';

interface IssueSummary {
  key: string;
  title: string;
  issueType: string;
  status: string;
}

interface TrackerClientServiceLike {
  // Multi-tracker
  getClient(type: TrackerType): Promise<TrackerClient>;
  // Jira
  getJiraClient(): Promise<JiraClient>;
  getJiraCredentialsInfo(): Promise<{ configured: boolean; siteUrl?: string; email?: string } | null>;
  saveJiraCredentials(siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }>;
  clearJiraCredentials(): Promise<void>;
  testJiraConnection(siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }>;
  getJiraProjects(): Promise<{ success: boolean; projects?: { key: string; name: string }[]; error?: string }>;
  // Linear
  getLinearClient(): Promise<LinearClient>;
  getLinearCredentialsInfo(): Promise<{ configured: boolean } | null>;
  saveLinearCredentials(apiToken: string): Promise<{ success: boolean; error?: string }>;
  clearLinearCredentials(): Promise<void>;
  testLinearConnection(apiToken: string): Promise<{ success: boolean; error?: string }>;
  getLinearTeams(): Promise<{ success: boolean; teams?: { key: string; name: string }[]; error?: string }>;
}

export interface TrackerServiceDeps {
  tracker: ITrackerRepository;
  clientService: TrackerClientServiceLike;
  importService: Pick<ImportService, 'generateImportPreview' | 'importIssues'>;
  syncService: Pick<SyncService, 'generateSyncPreview' | 'applySyncChanges'>;
}

function mapIssues(issues: Awaited<ReturnType<TrackerClient['searchIssues']>>): IssueSummary[] {
  return issues.map((issue) => ({
    key: issue.key,
    title: issue.title,
    issueType: issue.issueType,
    status: issue.status,
  }));
}

/**
 * Shape of the aggregated credential info list returned to the renderer.
 * Jira rows include site_url and email; Linear rows omit them.
 */
export type CredentialInfoRow =
  | { type: 'jira'; site_url: string; email: string; configured: true }
  | { type: 'linear'; configured: true };

export function createTrackerService(deps: TrackerServiceDeps) {
  const getClientForAssociation = async (associationId: string): Promise<TrackerClient> => {
    const association = deps.tracker.getAssociationById(associationId);
    if (!association) {
      throw new Error('Association not found. It may have been deleted.');
    }
    return deps.clientService.getClient(association.tracker_type);
  };

  return {
    async getCredentialInfo(): Promise<CredentialInfoRow[]> {
      const rows: CredentialInfoRow[] = [];
      const jiraInfo = await deps.clientService.getJiraCredentialsInfo();
      if (jiraInfo?.siteUrl && jiraInfo.email) {
        rows.push({ type: 'jira', site_url: jiraInfo.siteUrl, email: jiraInfo.email, configured: true });
      }
      const linearInfo = await deps.clientService.getLinearCredentialsInfo();
      if (linearInfo?.configured) {
        rows.push({ type: 'linear', configured: true });
      }
      return rows;
    },

    // ---- Jira credentials -------------------------------------------------
    saveJiraCredentials(siteUrl: string, email: string, apiToken: string) {
      return deps.clientService.saveJiraCredentials(siteUrl, email, apiToken);
    },
    async clearJiraCredentials(): Promise<{ success: true }> {
      await deps.clientService.clearJiraCredentials();
      return { success: true };
    },
    testJiraConnection(siteUrl: string, email: string, apiToken: string) {
      return deps.clientService.testJiraConnection(siteUrl, email, apiToken);
    },

    // ---- Linear credentials -----------------------------------------------
    saveLinearCredentials(apiToken: string) {
      return deps.clientService.saveLinearCredentials(apiToken);
    },
    async clearLinearCredentials(): Promise<{ success: true }> {
      await deps.clientService.clearLinearCredentials();
      return { success: true };
    },
    testLinearConnection(apiToken: string) {
      return deps.clientService.testLinearConnection(apiToken);
    },
    listLinearTeams() {
      return deps.clientService.getLinearTeams();
    },

    // ---- Connections / scopes / associations ------------------------------
    getConnections(): TrackerConnection[] {
      return deps.tracker.getConnections();
    },

    getScopes(connectionId: string): TrackerProjectScope[] {
      return deps.tracker.getScopesByConnection(connectionId);
    },

    addScope(connectionId: string, projectKey: string, projectName?: string): ServiceResult<TrackerProjectScope> {
      try {
        return success(deps.tracker.getOrCreateScope(connectionId, projectKey, projectName));
      } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to add scope');
      }
    },

    getAssociations(projectId: string): TrackerAssociationWithScope[] {
      return deps.tracker.getAssociationsByProject(projectId);
    },

    /**
     * Create an KPM ↔ tracker association.
     * @param trackerType Which tracker this association points at.
     * @param siteUrl For Jira: the hostname (e.g., "company.atlassian.net"). For
     *                Linear: "linear.app" (constant — Linear has no per-site URLs,
     *                but the connection model requires a string).
     * @param filter Tracker-native filter. Jira = JQL; Linear = JSON.stringify(LinearFilter).
     */
    addAssociation(
      trackerType: TrackerType,
      projectId: string,
      siteUrl: string,
      projectKey: string,
      projectName: string | undefined,
      filter: string,
      displayName?: string
    ): ServiceResult<TrackerAssociationWithScope> {
      try {
        const existing = deps.tracker.getAssociationsByProject(projectId);
        const conflict = existing.find((a) => a.tracker_type !== trackerType);
        if (conflict) {
          const existingLabel = conflict.tracker_type === 'jira' ? 'Jira' : 'Linear';
          const incomingLabel = trackerType === 'jira' ? 'Jira' : 'Linear';
          return failure(
            `This project is already linked to ${existingLabel}. Remove the ${existingLabel} link before connecting ${incomingLabel}.`
          );
        }
        const connection = deps.tracker.getOrCreateConnection(trackerType, siteUrl);
        const scope = deps.tracker.getOrCreateScope(connection.id, projectKey, projectName);
        const association = deps.tracker.createAssociation(projectId, scope.id, filter, displayName);
        const hydrated = deps.tracker.getAssociationById(association.id);
        if (!hydrated) {
          return failure('Association was created but could not be reloaded');
        }
        return success(hydrated);
      } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to add association');
      }
    },

    removeAssociation(associationId: string): ServiceResult<void> {
      return wrap(() => {
        deps.tracker.deleteAssociation(associationId);
      });
    },

    hasAssociationItems(associationId: string): boolean {
      return deps.tracker.hasAssociationItems(associationId);
    },

    updateStatusMapping(associationId: string, statusMapping: StatusMapping | null): ServiceResult<void> {
      try {
        deps.tracker.updateStatusMapping(associationId, statusMapping);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to update status mapping');
      }
    },

    updateCustomFieldValues(associationId: string, customFieldValues: CustomFieldValues | null): ServiceResult<void> {
      try {
        deps.tracker.updateCustomFieldValues(associationId, customFieldValues);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to update custom field values');
      }
    },

    updateEpicKey(associationId: string, epicKey: string | null): ServiceResult<void> {
      try {
        deps.tracker.updateEpicKey(associationId, epicKey);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to update epic key');
      }
    },

    // ---- Jira-specific project queries (no Linear equivalent) -------------
    getCustomFields(projectKey: string, issueTypeId: string): AsyncResult<JiraCustomField[]> {
      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
        return client.getCustomFields(projectKey, issueTypeId);
      }, 'Failed to fetch custom fields from Jira.');
    },

    listJiraProjects() {
      return deps.clientService.getJiraProjects();
    },

    // ---- Linear-specific project queries ----------------------------------
    listLinearProjects(teamKey: string): AsyncResult<{ id: string; name: string }[]> {
      return wrapAsync(async () => {
        const client = await deps.clientService.getLinearClient();
        return client.getProjectsForTeam(teamKey);
      }, 'Failed to load Linear projects for the selected team.');
    },

    getProjectLabels(projectKey: string): AsyncResult<string[]> {
      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
        return client.getProjectLabels(projectKey);
      }, 'Failed to load project labels. Check project permissions.');
    },

    getProjectComponents(projectKey: string): AsyncResult<{ id: string; name: string }[]> {
      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
        return client.getProjectComponents(projectKey);
      }, 'Failed to load project components. Check project permissions.');
    },

    // ---- Cross-tracker project queries ------------------------------------
    getProjectStatuses(
      projectKey: string,
      trackerType: TrackerType = 'jira'
    ): AsyncResult<{ id: string; name: string; categoryKey: string }[]> {
      return wrapAsync(async () => {
        if (trackerType === 'linear') {
          const client = await deps.clientService.getLinearClient();
          return client.getProjectStatuses(projectKey);
        }
        const client = await deps.clientService.getJiraClient();
        return client.getProjectStatuses(projectKey);
      }, 'Failed to load project statuses.');
    },

    searchIssues(
      projectKey: string,
      searchText: string,
      trackerType: TrackerType = 'jira'
    ): AsyncResult<IssueSummary[]> {
      return wrapAsync(async () => {
        if (trackerType === 'linear') {
          const client = await deps.clientService.getLinearClient();
          return mapIssues(await client.searchIssues(projectKey));
        }
        const client = await deps.clientService.getJiraClient();
        return mapIssues(await client.searchIssuesByText(projectKey, searchText));
      }, 'Issue search failed. Check your tracker connection.');
    },

    getRecentIssues(
      projectKey: string,
      trackerType: TrackerType = 'jira'
    ): AsyncResult<IssueSummary[]> {
      return wrapAsync(async () => {
        if (trackerType === 'linear') {
          const client = await deps.clientService.getLinearClient();
          return mapIssues(await client.searchIssues(projectKey));
        }
        const client = await deps.clientService.getJiraClient();
        return mapIssues(await client.getRecentIssues(projectKey));
      }, 'Failed to load recent issues. Verify your tracker credentials.');
    },

    searchIssuesByJql(
      projectKey: string,
      filter: string,
      trackerType: TrackerType = 'jira'
    ): AsyncResult<IssueSummary[]> {
      return wrapAsync(async () => {
        const client = await deps.clientService.getClient(trackerType);
        return mapIssues(await client.searchIssues(projectKey, filter));
      }, 'Filter search failed.');
    },

    generateImportPreview(
      projectId: string,
      associationId: string,
      onProgress?: (data: unknown) => void
    ): AsyncResult<ImportPreview> {
      return wrapAsync(async () => {
        const client = await getClientForAssociation(associationId);
        return deps.importService.generateImportPreview(projectId, associationId, client, onProgress);
      }, 'Failed to fetch issues from tracker. Check your filter syntax.');
    },

    importIssues(
      projectId: string,
      associationId: string,
      options: {
        selectedTypes?: string[];
        onProgress?: (data: unknown) => void;
      }
    ): AsyncResult<ImportResult> {
      return wrapAsync(async () => {
        const client = await getClientForAssociation(associationId);
        return deps.importService.importIssues(projectId, associationId, client, options);
      }, 'Import failed. Some issues may not have been imported.');
    },

    generateSyncPreview(
      projectId: string,
      associationId: string,
      onProgress?: (phase: string, current: number, total: number) => void
    ): AsyncResult<SyncPreview> {
      const association = deps.tracker.getAssociationById(associationId);
      if (!association) {
        return Promise.resolve(failure('Association not found. It may have been deleted.'));
      }

      return wrapAsync(async () => {
        const client = await deps.clientService.getClient(association.tracker_type);
        return deps.syncService.generateSyncPreview(projectId, associationId, client, onProgress);
      }, 'Failed to generate sync preview. Check your tracker connection.');
    },

    applySyncChanges(
      projectId: string,
      preview: SyncPreview,
      resolutions: Map<string, ConflictResolution>,
      deletedAction: DeletedItemAction,
      deletedDecisions: Map<string, 'keep' | 'delete'>
    ): SyncResult {
      return deps.syncService.applySyncChanges(
        projectId,
        preview,
        resolutions,
        deletedAction,
        deletedDecisions
      );
    },
  };
}

export type TrackerService = ReturnType<typeof createTrackerService>;
