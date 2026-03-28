import { ipcMain } from 'electron';
import type { ExportFacadeService } from '../../services/core/ExportFacadeService';
import { ExportSchemas, createIpcHandler } from '../validation';
import { IPC_CHANNELS } from '../channels';

export function registerExportHandlers(
  exportFacadeService: ExportFacadeService,
): void {
  // ==========================================================================
  // Sync Queue Operations
  // ==========================================================================

  // Get sync queue for project
  ipcMain.handle(IPC_CHANNELS.export.queue.get, createIpcHandler(
    ExportSchemas.getQueue,
    ({ projectId }) => {
      const result = exportFacadeService.getQueue(projectId);
      if (!result.ok) throw new Error(result.error);
      const entries = result.data;
      return { entries };
    },
    'Failed to get queue'
  ));

  // Add items to sync queue
  ipcMain.handle(IPC_CHANNELS.export.queue.add, createIpcHandler(
    ExportSchemas.addToQueue,
    ({ projectId, itemIds, associationId }) => {
      const result = exportFacadeService.addToQueue(projectId, itemIds, associationId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to add to queue'
  ));

  // Remove item from queue
  ipcMain.handle(IPC_CHANNELS.export.queue.remove, createIpcHandler(
    ExportSchemas.removeFromQueue,
    ({ queueEntryId }) => {
      const result = exportFacadeService.removeFromQueue(queueEntryId);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to remove from queue'
  ));

  // Clear entire queue for project
  ipcMain.handle(IPC_CHANNELS.export.queue.clear, createIpcHandler(
    ExportSchemas.clearQueue,
    ({ projectId }) => {
      const result = exportFacadeService.clearQueue(projectId);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to clear queue'
  ));

  // Update queue entry status category (or remove if reverting to synced status)
  ipcMain.handle(IPC_CHANNELS.export.queue.updateStatus, createIpcHandler(
    ExportSchemas.updateQueueStatus,
    ({ queueEntryId, statusCategory }) => {
      const result = exportFacadeService.updateQueueStatus(queueEntryId, statusCategory);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    'Failed to update queue entry status'
  ));

  // Update queue entry custom field overrides
  ipcMain.handle(IPC_CHANNELS.export.queue.updateCustomFields, createIpcHandler(
    ExportSchemas.updateQueueCustomFields,
    ({ queueEntryId, customFieldOverrides }) => {
      const result = exportFacadeService.updateQueueCustomFields(queueEntryId, customFieldOverrides);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to update queue entry custom fields'
  ));

  // Get queue count
  ipcMain.handle(IPC_CHANNELS.export.queue.count, createIpcHandler(
    ExportSchemas.getQueue,
    ({ projectId }) => {
      const result = exportFacadeService.getQueueCount(projectId);
      if (!result.ok) throw new Error(result.error);
      const count = result.data;
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
      const result = await exportFacadeService.generatePreview(projectId, associationId);
      if (!result.ok) throw new Error(result.error);
      const preview = result.data;
      return { preview };
    },
    'Failed to generate preview'
  ));

  // Get sync review data with Jira comparisons
  ipcMain.handle(IPC_CHANNELS.export.review, createIpcHandler(
    ExportSchemas.preview,
    async ({ projectId, associationId }) => {
      const result = await exportFacadeService.generateReview(projectId, associationId);
      if (!result.ok) throw new Error(result.error);
      const reviewData = result.data;
      return { reviewData };
    },
    'Failed to generate review'
  ));

  // Execute export for approved items only
  ipcMain.handle(IPC_CHANNELS.export.executeApproved, createIpcHandler(
    ExportSchemas.executeApproved,
    async ({ projectId, associationId, approvedItemIds }) => {
      const executionResult = await exportFacadeService.executeApproved(projectId, associationId, approvedItemIds);
      if (!executionResult.ok) throw new Error(executionResult.error);
      return { result: executionResult.data };
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
      const result = exportFacadeService.getMappings(projectId);
      if (!result.ok) throw new Error(result.error);
      const mappings = result.data;
      return { mappings };
    },
    'Failed to get mappings'
  ));

  // Get mappings by scope
  ipcMain.handle(IPC_CHANNELS.export.mappings.getByScope, createIpcHandler(
    ExportSchemas.getMappingsByScope,
    ({ projectId, scopeId }) => {
      const result = exportFacadeService.getMappingsByScope(projectId, scopeId);
      if (!result.ok) throw new Error(result.error);
      const mappings = result.data;
      return { mappings };
    },
    'Failed to get mappings'
  ));

  // Save a type mapping
  ipcMain.handle(IPC_CHANNELS.export.mappings.save, createIpcHandler(
    ExportSchemas.saveMapping,
    ({ projectId, scopeId, kpmLabel, trackerIssueTypeId, trackerIssueTypeName }) => {
      const result = exportFacadeService.saveMapping(
        projectId,
        scopeId,
        kpmLabel,
        trackerIssueTypeId,
        trackerIssueTypeName
      );
      if (!result.ok) throw new Error(result.error);
      const mapping = result.data;
      return { mapping };
    },
    'Failed to save mapping'
  ));

  // Remove a mapping
  ipcMain.handle(IPC_CHANNELS.export.mappings.remove, createIpcHandler(
    ExportSchemas.removeMapping,
    ({ mappingId }) => {
      const result = exportFacadeService.removeMapping(mappingId);
      if (!result.ok) throw new Error(result.error);
    },
    'Failed to remove mapping'
  ));

  // Create default mappings
  ipcMain.handle(IPC_CHANNELS.export.mappings.createDefaults, createIpcHandler(
    ExportSchemas.createDefaultMappings,
    async ({ projectId, scopeId }) => {
      const result = await exportFacadeService.createDefaultMappings(projectId, scopeId);
      if (!result.ok) throw new Error(result.error);
      const mappings = result.data;
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
      const result = await exportFacadeService.getIssueTypes(projectKey);
      if (!result.ok) throw new Error(result.error);
      const issueTypes = result.data;
      return { issueTypes };
    },
    'Failed to get issue types'
  ));
}
