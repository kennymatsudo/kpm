import type {
  CustomFieldValues,
  StatusCategory,
  TrackerType,
} from '../../shared/types';
import type { EndpointPayload } from '../../shared/ipc/endpoints';
import type { TrackerEndpointName, trackerEndpoints } from '../../shared/ipc/trackerEndpoints';

type TrackerEndpointPayload<K extends TrackerEndpointName> = EndpointPayload<(typeof trackerEndpoints)[K]>;

/**
 * Thin per-endpoint forwards to `window.api.tracker.*`. Renderer code outside
 * `services/` may not touch `window.api` directly (see `no-restricted-properties`
 * in `eslint.config.ts`), so this file stays the transport boundary even
 * though each function's body is a 1:1 forward — it just takes the payload
 * object the registry's Zod schema defines instead of reshaping positional
 * arguments into one.
 */
export function listTrackerCredentials() {
  return window.api.tracker.credentials.list();
}

export function saveJiraTrackerCredentials(payload: TrackerEndpointPayload<'credentials.saveJira'>) {
  return window.api.tracker.credentials.saveJira(payload);
}

export function saveLinearTrackerCredentials(payload: TrackerEndpointPayload<'credentials.saveLinear'>) {
  return window.api.tracker.credentials.saveLinear(payload);
}

export function deleteTrackerCredentials() {
  return window.api.tracker.credentials.delete();
}

export function deleteLinearTrackerCredentials() {
  return window.api.tracker.credentials.deleteLinear();
}

export function testJiraTrackerCredentials(payload: TrackerEndpointPayload<'credentials.testJira'>) {
  return window.api.tracker.credentials.testJira(payload);
}

export function testLinearTrackerCredentials(payload: TrackerEndpointPayload<'credentials.testLinear'>) {
  return window.api.tracker.credentials.testLinear(payload);
}

export function listTrackerAssociations(payload: TrackerEndpointPayload<'associations.get'>) {
  return window.api.tracker.associations.list(payload);
}

export function addTrackerAssociation(payload: Parameters<typeof window.api.tracker.associations.add>[0]) {
  return window.api.tracker.associations.add(payload);
}

export function removeTrackerAssociation(payload: TrackerEndpointPayload<'associations.remove'>) {
  return window.api.tracker.associations.remove(payload);
}

export function trackerAssociationHasImportedItems(payload: TrackerEndpointPayload<'associations.hasImported'>) {
  return window.api.tracker.associations.hasImported(payload);
}

export function updateTrackerAssociationStatusMapping(payload: TrackerEndpointPayload<'associations.updateStatusMapping'>) {
  return window.api.tracker.associations.updateStatusMapping(payload);
}

export function updateTrackerAssociationCustomFieldValues(payload: TrackerEndpointPayload<'associations.updateCustomFieldValues'>) {
  return window.api.tracker.associations.updateCustomFieldValues(payload);
}

export function updateTrackerAssociationEpicKey(payload: TrackerEndpointPayload<'associations.updateEpicKey'>) {
  return window.api.tracker.associations.updateEpicKey(payload);
}

export function listTrackerCustomFields(payload: TrackerEndpointPayload<'customFields.get'>) {
  return window.api.tracker.customFields.getAvailable(payload);
}

export function listTrackerProjects() {
  return window.api.tracker.projects.list();
}

export function listLinearTrackerTeams() {
  return window.api.tracker.projects.listLinearTeams();
}

export function listLinearTrackerProjects(payload: TrackerEndpointPayload<'projects.listLinearProjects'>) {
  return window.api.tracker.projects.listLinearProjects(payload);
}

export function listTrackerProjectStatuses(payload: TrackerEndpointPayload<'project.statuses'>) {
  return window.api.tracker.projects.getStatuses(payload);
}

export function searchTrackerIssues(payload: TrackerEndpointPayload<'issues.search'>) {
  return window.api.tracker.issues.search(payload);
}

export function searchTrackerIssuesByJql(payload: TrackerEndpointPayload<'issues.searchJql'>) {
  return window.api.tracker.issues.searchByJql(payload);
}

export function getRecentTrackerIssues(payload: TrackerEndpointPayload<'issues.recent'>) {
  return window.api.tracker.issues.getRecent(payload);
}

export function getTrackerImportPreview(payload: TrackerEndpointPayload<'import.preview'>) {
  return window.api.tracker.import.getPreview(payload);
}

export function applyTrackerImport(payload: TrackerEndpointPayload<'import.apply'>) {
  return window.api.tracker.import.apply(payload);
}

export function importAllTrackerItems(payload: TrackerEndpointPayload<'import.all'>) {
  return window.api.tracker.import.importAll(payload);
}

export function subscribeToTrackerImportProgress(
  callback: (data: { projectId: string; associationId: string; phase?: string; fetched?: number; current?: number; total?: number }) => void
) {
  return window.api.tracker.import.onProgress(callback);
}

export function getTrackerSyncPreview(payload: TrackerEndpointPayload<'sync.preview'>) {
  return window.api.tracker.sync.getPreview(payload);
}

export function applyTrackerSyncChanges(payload: Parameters<typeof window.api.tracker.sync.applyChanges>[0]) {
  return window.api.tracker.sync.applyChanges(payload);
}

export function subscribeToTrackerSyncProgress(
  callback: (data: { projectId: string; associationId: string; phase: string; current: number; total: number }) => void
) {
  return window.api.tracker.sync.onProgress(callback);
}

export function listTrackerIssueTypes(projectKey: string, trackerType?: TrackerType) {
  return window.api.tracker.issueTypes.get({ projectKey, trackerType });
}

export function getTrackerExportQueue(projectId: string) {
  return window.api.tracker.exportQueue.get({ projectId });
}

export function addTrackerExportQueue(projectId: string, itemIds: string[]) {
  return window.api.tracker.exportQueue.add({ projectId, itemIds });
}

export function updateTrackerExportQueueStatus(
  queueEntryId: string,
  statusCategory: StatusCategory
) {
  return window.api.tracker.exportQueue.updateStatus({ queueEntryId, statusCategory });
}

export function removeTrackerExportQueueEntry(queueEntryId: string) {
  return window.api.tracker.exportQueue.remove({ queueEntryId });
}

export function updateTrackerExportQueueCustomFieldOverrides(
  queueEntryId: string,
  overrides: CustomFieldValues | null
) {
  return window.api.tracker.exportQueue.updateCustomFieldOverrides({ queueEntryId, customFieldOverrides: overrides });
}

export function clearTrackerExportQueue(projectId: string) {
  return window.api.tracker.exportQueue.clear({ projectId });
}

export function getTrackerTypeMappings(projectId: string) {
  return window.api.tracker.typeMappings.get({ projectId });
}

export function getTrackerTypeMappingsByScope(projectId: string, scopeId: string) {
  return window.api.tracker.typeMappings.getByScope({ projectId, scopeId });
}

export function saveTrackerTypeMapping(
  projectId: string,
  scopeId: string,
  kpmLabel: string,
  jiraIssueTypeId: string,
  jiraIssueTypeName: string
) {
  return window.api.tracker.typeMappings.save({
    projectId,
    scopeId,
    kpmLabel,
    trackerIssueTypeId: jiraIssueTypeId,
    trackerIssueTypeName: jiraIssueTypeName,
  });
}

export function removeTrackerTypeMapping(mappingId: string) {
  return window.api.tracker.typeMappings.remove({ mappingId });
}

export function createDefaultTrackerTypeMappings(projectId: string, scopeId: string) {
  return window.api.tracker.typeMappings.createDefaults({ projectId, scopeId });
}

export function getTrackerExportPreview(projectId: string, associationId: string) {
  return window.api.tracker.export.getPreview({ projectId, associationId });
}

export function getTrackerExportReview(projectId: string, associationId: string) {
  return window.api.tracker.export.getReview({ projectId, associationId });
}

export function executeApprovedTrackerExport(
  projectId: string,
  associationId: string,
  approvedItemIds: string[]
) {
  return window.api.tracker.export.executeApproved({ projectId, associationId, approvedItemIds });
}
