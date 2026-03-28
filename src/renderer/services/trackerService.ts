import type {
  ConflictResolution,
  CustomFieldValues,
  DeletedItemAction,
  StatusCategory,
  SyncPreview,
} from '../../shared/types';

export function listTrackerAssociations(projectId: string) {
  return window.api.tracker.associations.list(projectId);
}

export function addTrackerAssociation(
  projectId: string,
  siteUrl: string,
  projectKey: string,
  projectName: string | undefined,
  jqlFilter: string,
  displayName?: string
) {
  return window.api.tracker.associations.add(
    projectId,
    siteUrl,
    projectKey,
    projectName,
    jqlFilter,
    displayName
  );
}

export function updateTrackerAssociationEpicKey(associationId: string, epicKey: string | null) {
  return window.api.tracker.associations.updateEpicKey(associationId, epicKey);
}

export function removeTrackerAssociation(associationId: string) {
  return window.api.tracker.associations.remove(associationId);
}

export function trackerAssociationHasImportedItems(associationId: string) {
  return window.api.tracker.associations.hasImported(associationId);
}

export function updateTrackerAssociationStatusMapping(
  associationId: string,
  statusMapping: object | null
) {
  return window.api.tracker.associations.updateStatusMapping(associationId, statusMapping);
}

export function updateTrackerAssociationCustomFieldValues(
  associationId: string,
  customFieldValues: CustomFieldValues | null
) {
  return window.api.tracker.associations.updateCustomFieldValues(associationId, customFieldValues);
}

export function getTrackerImportPreview(projectId: string, associationId: string) {
  return window.api.tracker.import.getPreview(projectId, associationId);
}

export function applyTrackerImport(
  projectId: string,
  associationId: string,
  selectedTypes: string[]
) {
  return window.api.tracker.import.apply(projectId, associationId, selectedTypes);
}

export function importAllTrackerItems(projectId: string, associationId: string) {
  return window.api.tracker.import.importAll(projectId, associationId);
}

export function subscribeToTrackerImportProgress(
  callback: (data: {
    projectId: string;
    associationId: string;
    phase?: string;
    fetched?: number;
    current?: number;
    total?: number;
  }) => void
) {
  return window.api.tracker.import.onProgress(callback);
}

export function testJiraTrackerCredentials(siteUrl: string, email: string, apiToken: string) {
  return window.api.tracker.credentials.testJira(siteUrl, email, apiToken);
}

export function listTrackerCredentials() {
  return window.api.tracker.credentials.list();
}

export function saveJiraTrackerCredentials(siteUrl: string, email: string, apiToken: string) {
  return window.api.tracker.credentials.saveJira(siteUrl, email, apiToken);
}

export function deleteTrackerCredentials() {
  return window.api.tracker.credentials.delete();
}

export function listTrackerProjects() {
  return window.api.tracker.projects.list();
}

}

export function listTrackerIssueTypes(projectKey: string) {
  return window.api.tracker.issueTypes.get(projectKey);
}

export function searchTrackerIssuesByJql(projectKey: string, jql: string) {
  return window.api.tracker.issues.searchByJql(projectKey, jql);
}

export function getRecentTrackerIssues(projectKey: string) {
  return window.api.tracker.issues.getRecent(projectKey);
}

export function searchTrackerIssues(projectKey: string, query: string) {
  return window.api.tracker.issues.search(projectKey, query);
}

export function listTrackerCustomFields(projectKey: string, issueTypeId: string) {
  return window.api.tracker.customFields.getAvailable(projectKey, issueTypeId);
}

export function getTrackerSyncPreview(projectId: string, associationId: string) {
  return window.api.tracker.sync.getPreview(projectId, associationId);
}

export function applyTrackerSyncChanges(
  projectId: string,
  syncPreview: SyncPreview,
  resolutions: Record<string, ConflictResolution>,
  deletedAction: DeletedItemAction,
  deletedDecisions: Record<string, 'keep' | 'delete'>
) {
  return window.api.tracker.sync.applyChanges(
    projectId,
    syncPreview,
    resolutions,
    deletedAction,
    deletedDecisions
  );
}

export function subscribeToTrackerSyncProgress(
  callback: (data: {
    projectId: string;
    associationId: string;
    phase: string;
    current: number;
    total: number;
  }) => void
) {
  return window.api.tracker.sync.onProgress(callback);
}

export function getTrackerExportQueue(projectId: string) {
  return window.api.tracker.exportQueue.get(projectId);
}

export function addTrackerExportQueue(projectId: string, itemIds: string[]) {
  return window.api.tracker.exportQueue.add(projectId, itemIds);
}

export function updateTrackerExportQueueStatus(
  queueEntryId: string,
  statusCategory: StatusCategory
) {
  return window.api.tracker.exportQueue.updateStatus(queueEntryId, statusCategory);
}

export function removeTrackerExportQueueEntry(queueEntryId: string) {
  return window.api.tracker.exportQueue.remove(queueEntryId);
}

export function updateTrackerExportQueueCustomFieldOverrides(
  queueEntryId: string,
  overrides: CustomFieldValues | null
) {
  return window.api.tracker.exportQueue.updateCustomFieldOverrides(queueEntryId, overrides);
}

export function clearTrackerExportQueue(projectId: string) {
  return window.api.tracker.exportQueue.clear(projectId);
}

export function getTrackerTypeMappings(projectId: string) {
  return window.api.tracker.typeMappings.get(projectId);
}

export function getTrackerTypeMappingsByScope(projectId: string, scopeId: string) {
  return window.api.tracker.typeMappings.getByScope(projectId, scopeId);
}

export function saveTrackerTypeMapping(
  projectId: string,
  scopeId: string,
  kpmLabel: string,
  jiraIssueTypeId: string,
  jiraIssueTypeName: string
) {
  return window.api.tracker.typeMappings.save(
    projectId,
    scopeId,
    kpmLabel,
    jiraIssueTypeId,
    jiraIssueTypeName
  );
}

export function removeTrackerTypeMapping(mappingId: string) {
  return window.api.tracker.typeMappings.remove(mappingId);
}

export function createDefaultTrackerTypeMappings(projectId: string, scopeId: string) {
  return window.api.tracker.typeMappings.createDefaults(projectId, scopeId);
}

export function getTrackerExportPreview(projectId: string, associationId: string) {
  return window.api.tracker.export.getPreview(projectId, associationId);
}

export function getTrackerExportReview(projectId: string, associationId: string) {
  return window.api.tracker.export.getReview(projectId, associationId);
}

export function executeApprovedTrackerExport(
  projectId: string,
  associationId: string,
  approvedItemIds: string[]
) {
  return window.api.tracker.export.executeApproved(projectId, associationId, approvedItemIds);
}
