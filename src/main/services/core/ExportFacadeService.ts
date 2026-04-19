import type { JiraIssueType, TrackerType } from '../../../shared/types';
import type { ExportService, TypeMappingService } from '../../db/domain';
import { failure, success, type AsyncResult, type ServiceResult } from '../result';

export interface ExportFacadeServiceDeps {
  exportService: ExportService;
  typeMappingService: TypeMappingService;
  tracker: {
    getScopeById(scopeId: string): { project_key: string; connection_id: string } | undefined;
    getConnectionById(connectionId: string): { tracker_type: TrackerType } | undefined;
  };
  trackerClientService: {
    getClient(type: TrackerType): Promise<{
      getIssueTypes(projectKey: string): Promise<JiraIssueType[]>;
    }>;
  };
}

export function createExportFacadeService(deps: ExportFacadeServiceDeps) {
  return {
    getQueue(projectId: string): ServiceResult<ReturnType<ExportService['getQueuedItems']>> {
      try {
        return success(deps.exportService.getQueuedItems(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    addToQueue(
      projectId: string,
      itemIds: string[],
      associationId?: string,
    ): ServiceResult<ReturnType<ExportService['queueItems']>> {
      try {
        return success(deps.exportService.queueItems(projectId, itemIds, 'user', associationId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    removeFromQueue(queueEntryId: string): ServiceResult<void> {
      try {
        deps.exportService.removeFromQueue(queueEntryId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    clearQueue(projectId: string): ServiceResult<void> {
      try {
        deps.exportService.clearQueue(projectId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    updateQueueStatus(queueEntryId: string, statusCategory: string | null): ServiceResult<{ removed: boolean }> {
      try {
        return success(deps.exportService.updateQueueStatus(queueEntryId, statusCategory));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    updateQueueCustomFields(queueEntryId: string, customFieldOverrides: Record<string, string> | null): ServiceResult<void> {
      try {
        deps.exportService.updateQueueCustomFieldOverrides(queueEntryId, customFieldOverrides);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getQueueCount(projectId: string): ServiceResult<number> {
      try {
        return success(deps.exportService.getQueueCount(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async generatePreview(projectId: string, associationId: string): AsyncResult<Awaited<ReturnType<ExportService['generateExportPreview']>>> {
      try {
        return success(await deps.exportService.generateExportPreview(projectId, associationId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async generateReview(projectId: string, associationId: string): AsyncResult<Awaited<ReturnType<ExportService['generateSyncReview']>>> {
      try {
        return success(await deps.exportService.generateSyncReview(projectId, associationId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async executeApproved(
      projectId: string,
      associationId: string,
      approvedItemIds: string[],
    ): AsyncResult<Awaited<ReturnType<ExportService['executeApprovedExport']>>> {
      try {
        return success(await deps.exportService.executeApprovedExport(projectId, associationId, approvedItemIds));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getMappings(projectId: string): ServiceResult<ReturnType<TypeMappingService['getMappings']>> {
      try {
        return success(deps.typeMappingService.getMappings(projectId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    getMappingsByScope(projectId: string, scopeId: string): ServiceResult<ReturnType<TypeMappingService['getMappingsByScope']>> {
      try {
        return success(deps.typeMappingService.getMappingsByScope(projectId, scopeId));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    saveMapping(
      projectId: string,
      scopeId: string,
      kpmLabel: string,
      trackerIssueTypeId: string,
      trackerIssueTypeName: string,
    ): ServiceResult<ReturnType<TypeMappingService['saveMapping']>> {
      try {
        return success(
          deps.typeMappingService.saveMapping(
            projectId,
            scopeId,
            kpmLabel,
            trackerIssueTypeId,
            trackerIssueTypeName,
          ),
        );
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    removeMapping(mappingId: string): ServiceResult<void> {
      try {
        deps.typeMappingService.removeMapping(mappingId);
        return success(undefined);
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async createDefaultMappings(projectId: string, scopeId: string): AsyncResult<ReturnType<TypeMappingService['createDefaultMappings']>> {
      try {
        const scope = deps.tracker.getScopeById(scopeId);
        if (!scope) {
          return failure('Scope not found');
        }
        const connection = deps.tracker.getConnectionById(scope.connection_id);
        if (!connection) {
          return failure('Connection not found');
        }

        const client = await deps.trackerClientService.getClient(connection.tracker_type);
        const issueTypes = await client.getIssueTypes(scope.project_key);
        return success(deps.typeMappingService.createDefaultMappings(projectId, scopeId, issueTypes));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async getIssueTypes(projectKey: string, trackerType: TrackerType = 'jira'): AsyncResult<JiraIssueType[]> {
      try {
        const client = await deps.trackerClientService.getClient(trackerType);
        return success(await client.getIssueTypes(projectKey));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export type ExportFacadeService = ReturnType<typeof createExportFacadeService>;
