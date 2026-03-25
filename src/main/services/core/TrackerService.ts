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
import { failure, success, type AsyncResult, type ServiceResult, wrapAsync } from '../result';

interface IssueSummary {
  key: string;
  title: string;
  issueType: string;
  status: string;
}

interface TrackerClientServiceLike {
  getJiraCredentialsInfo(): Promise<{ configured: boolean; siteUrl?: string; email?: string } | null>;
  saveJiraCredentials(siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }>;
  clearJiraCredentials(): Promise<void>;
  testJiraConnection(siteUrl: string, email: string, apiToken: string): Promise<{ success: boolean; error?: string }>;
  getJiraProjects(): Promise<{ success: boolean; projects?: { key: string; name: string }[]; error?: string }>;
}

export interface TrackerServiceDeps {
  tracker: ITrackerRepository;
  clientService: TrackerClientServiceLike;
}

  return issues.map((issue) => ({
    key: issue.key,
    title: issue.title,
    issueType: issue.issueType,
    status: issue.status,
  }));
}

export function createTrackerService(deps: TrackerServiceDeps) {
  return {
      const jiraInfo = await deps.clientService.getJiraCredentialsInfo();
      }
    },

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

    addAssociation(
      projectId: string,
      siteUrl: string,
      projectKey: string,
      projectName: string | undefined,
      displayName?: string
    ): ServiceResult<TrackerAssociationWithScope> {
      try {
        const scope = deps.tracker.getOrCreateScope(connection.id, projectKey, projectName);
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
      try {
        deps.tracker.deleteAssociation(associationId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
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

    getCustomFields(projectKey: string, issueTypeId: string): AsyncResult<JiraCustomField[]> {
      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
        return client.getCustomFields(projectKey, issueTypeId);
      }, 'Failed to fetch custom fields from Jira.');
    },

    listJiraProjects() {
      return deps.clientService.getJiraProjects();
    },

      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
    },

      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
    },

      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
    },

      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
    },

      return wrapAsync(async () => {
        const client = await deps.clientService.getJiraClient();
    },

      return wrapAsync(async () => {
    },

    generateImportPreview(
      projectId: string,
      associationId: string,
      onProgress?: (data: unknown) => void
    ): AsyncResult<ImportPreview> {
      return wrapAsync(async () => {
        return deps.importService.generateImportPreview(projectId, associationId, client, onProgress);
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
        return deps.syncService.generateSyncPreview(projectId, associationId, client, onProgress);
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
