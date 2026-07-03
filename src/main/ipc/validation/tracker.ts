/**
 * Tracker and Export Validation Schemas
 */

import { trackerEndpoints, trackerType, trackerProjectKey } from '../../../shared/ipc/trackerEndpoints';
import { exportEndpoints } from '../../../shared/ipc/exportEndpoints';

export { trackerType, trackerProjectKey };

// =============================================================================
// Tracker Schemas
//
// Payload schemas are owned by `shared/ipc/trackerEndpoints.ts` (one entry
// per IPC endpoint, shared with the preload bridge and the handler binding).
// This map only translates the endpoint registry's dotted keys to the names
// `TrackerService`-adjacent callers already use.
// =============================================================================

export const TrackerSchemas = {
  // Credentials
  saveJiraCredentials: trackerEndpoints['credentials.saveJira'].params,
  testJiraConnection: trackerEndpoints['credentials.testJira'].params,
  saveLinearCredentials: trackerEndpoints['credentials.saveLinear'].params,
  testLinearConnection: trackerEndpoints['credentials.testLinear'].params,

  // Scopes
  getScopes: trackerEndpoints['scopes.get'].params,
  addScope: trackerEndpoints['scopes.add'].params,

  // Associations
  getAssociations: trackerEndpoints['associations.get'].params,
  addAssociation: trackerEndpoints['associations.add'].params,
  removeAssociation: trackerEndpoints['associations.remove'].params,
  hasImported: trackerEndpoints['associations.hasImported'].params,

  // Issue operations
  searchIssues: trackerEndpoints['issues.search'].params,
  searchIssuesByJql: trackerEndpoints['issues.searchJql'].params,
  recentIssues: trackerEndpoints['issues.recent'].params,
  projectLabels: trackerEndpoints['project.labels'].params,
  projectComponents: trackerEndpoints['project.components'].params,

  // Import
  importPreview: trackerEndpoints['import.preview'].params,
  importApply: trackerEndpoints['import.apply'].params,

  // Sync
  syncPreview: trackerEndpoints['sync.preview'].params,
  syncApply: trackerEndpoints['sync.apply'].params,

  // Status Mapping (shared across trackers; trackerType defaults to Jira for legacy callers)
  getProjectStatuses: trackerEndpoints['project.statuses'].params,

  // List Linear projects within a team
  listLinearProjects: trackerEndpoints['projects.listLinearProjects'].params,

  updateStatusMapping: trackerEndpoints['associations.updateStatusMapping'].params,

  // Custom Fields
  getCustomFields: trackerEndpoints['customFields.get'].params,
  updateCustomFieldValues: trackerEndpoints['associations.updateCustomFieldValues'].params,
  updateEpicKey: trackerEndpoints['associations.updateEpicKey'].params,
};

// =============================================================================
// Export Schemas
//
// Payload schemas are owned by `shared/ipc/exportEndpoints.ts` (one entry per
// IPC endpoint, shared with the preload bridge and the handler binding).
// =============================================================================

export const ExportSchemas = {
  // Queue operations
  getQueue: exportEndpoints['queue.get'].params,
  addToQueue: exportEndpoints['queue.add'].params,
  removeFromQueue: exportEndpoints['queue.remove'].params,
  clearQueue: exportEndpoints['queue.clear'].params,
  updateQueueStatus: exportEndpoints['queue.updateStatus'].params,
  updateQueueCustomFields: exportEndpoints['queue.updateCustomFields'].params,

  // Preview and execute
  preview: exportEndpoints.preview.params,

  // Sync review (task-by-task approval)
  executeApproved: exportEndpoints.executeApproved.params,

  // Type mappings
  getMappings: exportEndpoints['mappings.get'].params,
  getMappingsByScope: exportEndpoints['mappings.getByScope'].params,
  saveMapping: exportEndpoints['mappings.save'].params,
  removeMapping: exportEndpoints['mappings.remove'].params,
  createDefaultMappings: exportEndpoints['mappings.createDefaults'].params,

  // Issue types
  getIssueTypes: exportEndpoints['issueTypes.get'].params,
};
