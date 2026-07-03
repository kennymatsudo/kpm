import { ipcMain } from 'electron';
import type { ExportService, TypeMappingService } from '../../db/domain';
import { TrackerClientService } from '../../trackers/TrackerClientService';
import { ExportSchemas, createIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerExportHandlers(
  exportService: ExportService,
  typeMappingService: TypeMappingService,
): void {
  // ==========================================================================
  // Sync Queue Operations
  // ==========================================================================

  // Get sync queue for project
  ipcMain.handle(IPC_CHANNELS.export.queue.get, createIpcHandler(
    ExportSchemas.getQueue,
    ({ projectId }) => {
      const entries = exportService.getQueuedItems(projectId);
      return { entries };
    },
    'Failed to get queue'
  ));

  // Add items to sync queue
  ipcMain.handle(IPC_CHANNELS.export.queue.add, createIpcHandler(
    ExportSchemas.addToQueue,
    ({ projectId, itemIds, associationId }) => {
      return exportService.queueItems(projectId, itemIds, 'user', associationId);
    },
    'Failed to add to queue'
  ));

  // Remove item from queue
  ipcMain.handle(IPC_CHANNELS.export.queue.remove, createIpcHandler(
    ExportSchemas.removeFromQueue,
    ({ queueEntryId }) => {
      exportService.removeFromQueue(queueEntryId);
    },
    'Failed to remove from queue'
  ));

  // Clear entire queue for project
  ipcMain.handle(IPC_CHANNELS.export.queue.clear, createIpcHandler(
    ExportSchemas.clearQueue,
    ({ projectId }) => {
      exportService.clearQueue(projectId);
    },
    'Failed to clear queue'
  ));

  // Update queue entry status category (or remove if reverting to synced status)
  ipcMain.handle(IPC_CHANNELS.export.queue.updateStatus, createIpcHandler(
    ExportSchemas.updateQueueStatus,
    ({ queueEntryId, statusCategory }) => {
      return exportService.updateQueueStatus(queueEntryId, statusCategory);
    },
    'Failed to update queue entry status'
  ));

  // Update queue entry custom field overrides
  ipcMain.handle(IPC_CHANNELS.export.queue.updateCustomFields, createIpcHandler(
    ExportSchemas.updateQueueCustomFields,
    ({ queueEntryId, customFieldOverrides }) => {
      exportService.updateQueueCustomFieldOverrides(queueEntryId, customFieldOverrides);
    },
    'Failed to update queue entry custom fields'
  ));

  // Get queue count
  ipcMain.handle(IPC_CHANNELS.export.queue.count, createIpcHandler(
    ExportSchemas.getQueue,
    ({ projectId }) => {
      const count = exportService.getQueueCount(projectId);
      return { count };
    },
    'Failed to get queue count'
  ));

  // ==========================================================================
  // Export Preview and Execute
  // ==========================================================================

  // Get export preview with validation
  ipcMain.handle(IPC_CHANNELS.export.preview, createIpcHandler(
    ExportSchemas.preview,
    async ({ projectId, associationId }) => {
      const preview = await exportService.generateExportPreview(projectId, associationId);
      return { preview };
    },
    'Failed to generate preview'
  ));

  // Get sync review data with Jira comparisons
  ipcMain.handle(IPC_CHANNELS.export.review, createIpcHandler(
    ExportSchemas.preview,
    async ({ projectId, associationId }) => {
      const reviewData = await exportService.generateSyncReview(projectId, associationId);
      return { reviewData };
    },
    'Failed to generate review'
  ));

  // Execute export for approved items only
  ipcMain.handle(IPC_CHANNELS.export.executeApproved, createIpcHandler(
    ExportSchemas.executeApproved,
    async ({ projectId, associationId, approvedItemIds }) => {
      const result = await exportService.executeApprovedExport(projectId, associationId, approvedItemIds);
      return { result };
    },
    'Export failed'
  ));

  // ==========================================================================
  // Type Mappings
  // ==========================================================================

  // Get all type mappings for project
  ipcMain.handle(IPC_CHANNELS.export.mappings.get, createIpcHandler(
    ExportSchemas.getMappings,
    ({ projectId }) => {
      const mappings = typeMappingService.getMappings(projectId);
      return { mappings };
    },
    'Failed to get mappings'
  ));

  // Get mappings by scope
  ipcMain.handle(IPC_CHANNELS.export.mappings.getByScope, createIpcHandler(
    ExportSchemas.getMappingsByScope,
    ({ projectId, scopeId }) => {
      const mappings = typeMappingService.getMappingsByScope(projectId, scopeId);
      return { mappings };
    },
    'Failed to get mappings'
  ));

  // Save a type mapping
  ipcMain.handle(IPC_CHANNELS.export.mappings.save, createIpcHandler(
    ExportSchemas.saveMapping,
    ({ projectId, scopeId, kpmLabel, trackerIssueTypeId, trackerIssueTypeName }) => {
      const mapping = typeMappingService.saveMapping(
        projectId,
        scopeId,
        kpmLabel,
        trackerIssueTypeId,
        trackerIssueTypeName
      );
      return { mapping };
    },
    'Failed to save mapping'
  ));

  // Remove a mapping
  ipcMain.handle(IPC_CHANNELS.export.mappings.remove, createIpcHandler(
    ExportSchemas.removeMapping,
    ({ mappingId }) => {
      typeMappingService.removeMapping(mappingId);
    },
    'Failed to remove mapping'
  ));

  // Create default mappings
  ipcMain.handle(IPC_CHANNELS.export.mappings.createDefaults, createIpcHandler(
    ExportSchemas.createDefaultMappings,
    async ({ projectId, scopeId }) => {
      const mappings = await typeMappingService.createDefaultMappingsForScope(projectId, scopeId);
      return { mappings };
    },
    'Failed to create default mappings'
  ));

  // ==========================================================================
  // Jira Issue Types
  // ==========================================================================

  // Get available Jira issue types for a project
  ipcMain.handle(IPC_CHANNELS.export.issueTypes.get, createIpcHandler(
    ExportSchemas.getIssueTypes,
    async ({ projectKey }) => {
      const client = await TrackerClientService.getClient('jira');
      const issueTypes = await client.getIssueTypes(projectKey);
      return { issueTypes };
    },
    'Failed to get issue types'
  ));
}
