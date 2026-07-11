/**
 * Tracker Domain Repository Interfaces
 *
 * Interfaces for external tracker connections, sync operations, and type mappings.
 */

import type {
  CustomFieldValues,
  StatusMapping,
  OutboundChange,
  OutboundChangeWithPlanItem,
  SyncSnapshot,
  TrackerAssociation,
  TrackerAssociationWithScope,
  TrackerConnection,
  TrackerProjectScope,
  TrackerTypeMapping,
} from '../../../shared/types';

// =============================================================================
// Tracker Repository
// =============================================================================

export interface ITrackerRepository {
  // Connections
  getConnection(trackerType: string, siteUrl: string): TrackerConnection | undefined;
  getConnectionById(id: string): TrackerConnection | undefined;
  createConnection(trackerType: string, siteUrl: string, displayName?: string): TrackerConnection;
  getOrCreateConnection(trackerType: string, siteUrl: string, displayName?: string): TrackerConnection;
  listConnections(): TrackerConnection[];
  getConnections(): TrackerConnection[];

  // Scopes
  getScopes(connectionId: string): TrackerProjectScope[];
  getScopesByConnection(connectionId: string): TrackerProjectScope[];
  getScopeById(id: string): TrackerProjectScope | undefined;
  getScopeByKey(connectionId: string, projectKey: string): TrackerProjectScope | undefined;
  createScope(connectionId: string, projectKey: string, projectName?: string): TrackerProjectScope;
  getOrCreateScope(connectionId: string, projectKey: string, projectName?: string): TrackerProjectScope;

  // Associations
  getAssociations(projectId: string): TrackerAssociation[];
  getAssociationsByProject(projectId: string): TrackerAssociationWithScope[];
  getAssociationsWithContext(projectId: string): TrackerAssociationWithScope[];
  getAssociationById(id: string): TrackerAssociationWithScope | undefined;
  createAssociation(
    projectId: string,
    scopeId: string,
    issueFilter: string,
    displayName?: string
  ): TrackerAssociation;
  deleteAssociation(id: string): void;
  updateAssociationLastSynced(id: string): void;
  updateStatusMapping(id: string, mapping: StatusMapping | null): void;
  updateCustomFieldValues(id: string, values: CustomFieldValues | null): void;
  updateEpicKey(id: string, epicKey: string | null): void;
  getCustomFieldValues(id: string): CustomFieldValues | null;
  hasAssociationItems(associationId: string): boolean;
  getItemsByAssociation(associationId: string): { id: string; external_key: string }[];
}

// =============================================================================
// Sync Repository
// =============================================================================

export interface ISyncRepository {
  getSnapshot(planItemId: string): SyncSnapshot | undefined;
  getSnapshotsByItemIds(planItemIds: string[]): Map<string, SyncSnapshot>;
  upsertSnapshot(snapshot: Omit<SyncSnapshot, 'id' | 'snapshot_at'>): void;
  bulkUpsertSnapshots(snapshots: Omit<SyncSnapshot, 'id' | 'snapshot_at'>[]): void;
  bulkDeleteSnapshots(planItemIds: string[]): void;
}

// =============================================================================
// Outbound Change Repository
// =============================================================================

export interface IOutboundChangeRepository {
  get(id: string): OutboundChange | undefined;
  getByProject(projectId: string): OutboundChange[];
  getByProjectWithPlanItems(projectId: string): OutboundChangeWithPlanItem[];
  getByPlanItem(planItemId: string): OutboundChange | undefined;
  getByItemId(planItemId: string): OutboundChange | undefined;
  getByAssociation(associationId: string): OutboundChange[];
  getQueuedItemsWithPlanData(projectId: string): OutboundChangeWithPlanItem[];
  getQueueCount(projectId: string): number;
  add(entry: Omit<OutboundChange, 'id' | 'plan_item_id' | 'operation' | 'queued_at' | 'error_message' | 'custom_field_overrides' | 'external_key' | 'external_id' | 'tracker_type'> & { plan_item_id: string; operation: 'create' | 'update'; custom_field_overrides?: CustomFieldValues | null }): OutboundChange;
  add(projectId: string, planItemId: string, associationId: string, operation: 'create' | 'update', queuedBy: 'user' | 'claude'): OutboundChange | null;
  addDelete(entry: { kpm_project_id: string; association_id: string; external_key: string; external_id: string | null; tracker_type: string; queued_by: 'user' | 'claude' }): OutboundChange;
  update(id: string, updates: Partial<Pick<OutboundChange, 'target_issue_type_id' | 'target_issue_type_name' | 'target_parent_key' | 'target_status_category' | 'custom_field_overrides' | 'error_message'>>): void;
  updateStatusCategory(id: string, statusCategory: string | null): void;
  updateResolvedType(id: string, typeId: string, typeName: string, parentKey: string | null): void;
  setError(id: string, errorMessage: string): void;
  remove(id: string): void;
  removeByProject(projectId: string): void;
  clearProject(projectId: string): void;
}

// =============================================================================
// Type Mapping Repository
// =============================================================================

export interface ITypeMappingRepository {
  getByProject(projectId: string): TrackerTypeMapping[];
  getByScope(projectId: string, scopeId: string): TrackerTypeMapping[];
  getByProjectAndScope(projectId: string, scopeId: string): TrackerTypeMapping[];
  get(projectId: string, scopeId: string, kpmLabel: string): TrackerTypeMapping | undefined;
  getMapping(projectId: string, scopeId: string, kpmLabel: string): TrackerTypeMapping | undefined;
  save(mapping: Omit<TrackerTypeMapping, 'id' | 'created_at'>): TrackerTypeMapping;
  upsert(projectId: string, scopeId: string, kpmLabel: string, trackerIssueTypeId: string, trackerIssueTypeName: string): TrackerTypeMapping;
  bulkUpsert(projectId: string, scopeId: string, mappings: { kpmLabel: string; trackerIssueTypeId: string; trackerIssueTypeName: string }[]): void;
  delete(id: string): void;
  remove(id: string): void;
}
