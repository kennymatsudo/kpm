import { exportEndpoints, type ExportEndpointName } from '../../../shared/ipc/exportEndpoints';
import type { UnwrappedHandlerFor } from '../../../shared/ipc/endpoints';
import type { ExportService, TypeMappingService } from '../../db/domain';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import { createRegistryIpcHandlers } from '../validation/utils';

/**
 * One handler per `exportEndpoints` entry. A registry entry without a
 * matching key here is a compile error, not a runtime "no handler" failure.
 */
type ExportHandlers = { [K in ExportEndpointName]: UnwrappedHandlerFor<typeof exportEndpoints, K> };

function buildExportHandlers(
  exportService: ExportService,
  typeMappingService: TypeMappingService,
): ExportHandlers {
  return {
    // ==========================================================================
    // Sync Queue Operations
    // ==========================================================================

    'queue.get': ({ projectId }) => ({ entries: exportService.getQueuedItems(projectId) }),

    'queue.add': ({ projectId, itemIds, associationId }) =>
      exportService.queueItems(projectId, itemIds, 'user', associationId),

    'queue.remove': ({ queueEntryId }) => {
      exportService.removeFromQueue(queueEntryId);
    },

    'queue.clear': ({ projectId }) => {
      exportService.clearQueue(projectId);
    },

    'queue.updateStatus': ({ queueEntryId, statusCategory }) =>
      exportService.updateQueueStatus(queueEntryId, statusCategory),

    'queue.updateCustomFields': ({ queueEntryId, customFieldOverrides }) => {
      exportService.updateQueueCustomFieldOverrides(queueEntryId, customFieldOverrides);
    },

    'queue.count': ({ projectId }) => ({ count: exportService.getQueueCount(projectId) }),

    // ==========================================================================
    // Export Preview and Execute
    // ==========================================================================

    preview: async ({ projectId, associationId }) => {
      const preview = await exportService.generateExportPreview(projectId, associationId);
      return { preview };
    },

    review: async ({ projectId, associationId }) => {
      const reviewData = await exportService.generateSyncReview(projectId, associationId);
      return { reviewData };
    },

    executeApproved: async ({ projectId, associationId, approvedItemIds }) => {
      const result = await exportService.executeApprovedExport(projectId, associationId, approvedItemIds);
      return { result };
    },

    // ==========================================================================
    // Type Mappings
    // ==========================================================================

    'mappings.get': ({ projectId }) => ({ mappings: typeMappingService.getMappings(projectId) }),

    'mappings.getByScope': ({ projectId, scopeId }) => ({
      mappings: typeMappingService.getMappingsByScope(projectId, scopeId),
    }),

    'mappings.save': ({ projectId, scopeId, kpmLabel, trackerIssueTypeId, trackerIssueTypeName }) => {
      const mapping = typeMappingService.saveMapping(
        projectId,
        scopeId,
        kpmLabel,
        trackerIssueTypeId,
        trackerIssueTypeName
      );
      return { mapping };
    },

    'mappings.remove': ({ mappingId }) => {
      typeMappingService.removeMapping(mappingId);
    },

    'mappings.createDefaults': async ({ projectId, scopeId }) => {
      const mappings = await typeMappingService.createDefaultMappingsForScope(projectId, scopeId);
      return { mappings };
    },

    // ==========================================================================
    // Tracker Issue Types
    // ==========================================================================

    'issueTypes.get': async ({ projectKey, trackerType }) => {
      const client = await TrackerClientService.getClient(trackerType ?? 'jira');
      const issueTypes = await client.getIssueTypes(projectKey);
      return { issueTypes };
    },
  };
}

export function registerExportHandlers(
  exportService: ExportService,
  typeMappingService: TypeMappingService,
): void {
  const handlers = buildExportHandlers(exportService, typeMappingService);
  createRegistryIpcHandlers(exportEndpoints, handlers, 'Export operation failed');
}
