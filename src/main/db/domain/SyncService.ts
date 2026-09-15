import type { Database } from 'better-sqlite3';
import type {
  IExternalPlanItemRepository,
  IPlanItemRepository,
  ISyncRepository,
  ITrackerRepository,
} from '../interfaces';
import type { TrackerClient, ExternalIssue } from '../../trackers';
import { fetchIssuesWithSubtasks } from '../../trackers';
import { inferCategoryWithMapping } from '../../trackers/statusTransitions';
import { normalizeMarkdown } from '../../documents';
import { classifyFieldChange } from './trackerReconciliation';
import { recordTrackerAgreement } from './trackerAgreement';
import { externalPeopleFields } from './externalPeopleFields';
import type {
  PlanItem,
  SyncPreview,
  SyncUpdatedItem,
  SyncConflict,
  SyncResult,
  SyncSnapshot,
  TrackerAgreementState,
  ConflictResolution,
  DeletedItemAction,
  StatusMapping,
} from '../../../shared/types';

type SyncProgressCallback = (phase: string, current: number, total: number) => void;

export interface SyncServiceDeps {
  database: Database;
  planItems: IPlanItemRepository;
  externalPlanItems: IExternalPlanItemRepository;
  sync: ISyncRepository;
  tracker: ITrackerRepository;
}

export function createSyncService(deps: SyncServiceDeps) {
  const getDatabase = () => deps.database;
  const PlanItemRepository = deps.planItems;
  const ExternalPlanItemRepository = deps.externalPlanItems;
  const SyncRepository = deps.sync;
  const TrackerRepository = deps.tracker;

  const service = {
  /**
   * Generate preview of changes without applying.
   * Returns diff for user review.
   */
  async generateSyncPreview(
    projectId: string,
    associationId: string,
    client: TrackerClient,
    onProgress?: SyncProgressCallback
  ): Promise<SyncPreview> {
    const association = TrackerRepository.getAssociationById(associationId);
    if (!association) throw new Error('Association not found');

    const preview: SyncPreview = {
      tracker_type: client.type,
      link_id: associationId,
      external_project_key: association.project_key,
      new_items: [],
      updated_items: [],
      conflicts: [],
      deleted_in_tracker: [],
      stats: { total: 0, new: 0, updated: 0, conflicts: 0, deleted: 0, unchanged: 0 },
    };

    // Fetch external issues including subtasks recursively
    onProgress?.('fetching', 0, 0);
    const externalIssues = await fetchIssuesWithSubtasks(
      client,
      association.issue_filter,
      (count) => onProgress?.('fetching', count, 0)
    );
    preview.stats.total = externalIssues.length;

    // Load existing KPM items with external keys
    const existingItems = ExternalPlanItemRepository.getLinkedItems(projectId, client.type);
    const existingByKey = new Map(existingItems.map(item => [item.external_key!, item]));
    const seenKeys = new Set<string>();

    // Load snapshots for existing items
    const snapshots = SyncRepository.getSnapshotsByItemIds(existingItems.map(i => i.id));

    // Analyze each external issue
    onProgress?.('analyzing', 0, externalIssues.length);
    for (let i = 0; i < externalIssues.length; i++) {
      const issue = externalIssues[i];
      seenKeys.add(issue.key);

      const existing = existingByKey.get(issue.key);
      const tracker_state: TrackerAgreementState = {
        title: issue.title,
        description: issue.description,
        updatedAt: issue.updatedAt,
      };

      if (!existing) {
        // New item - label not set, we use external_issue_type directly
        preview.new_items.push({
          external_key: issue.key,
          external_id: issue.id,
          title: issue.title,
          description: issue.description,
          tracker_state,
          label: null,
          external_issue_type: issue.issueType,
          external_status: issue.status,
          status_category: inferCategoryWithMapping(
            issue.status,
            association.status_mapping,
            { trackerType: client.type, stateType: issue.statusType ?? null }
          ),
          external_url: issue.url,
          external_parent_key: issue.parentKey,
          external_epic_key: issue.epicKey,
          ...externalPeopleFields(issue),
        });
        preview.stats.new++;
      } else {
        // Existing item - check for changes/conflicts
        const snapshot = snapshots.get(existing.id) ?? null;
        const analysis = service.analyzeChanges(existing, issue, snapshot, association.status_mapping);

        if (analysis.conflicts.length > 0) {
          preview.conflicts.push({
            plan_item_id: existing.id,
            external_key: issue.key,
            title: existing.title,
            tracker_state,
            fields: analysis.conflicts,
          });
          preview.stats.conflicts++;
        } else if (analysis.updates.length > 0) {
          preview.updated_items.push({
            plan_item_id: existing.id,
            external_key: issue.key,
            title: existing.title,
            tracker_state,
            changes: analysis.updates,
          });
          preview.stats.updated++;
        } else {
          preview.stats.unchanged++;
        }
      }

      onProgress?.('analyzing', i + 1, externalIssues.length);
    }

    // Find items deleted from tracker
    for (const item of existingItems) {
      if (!seenKeys.has(item.external_key!)) {
        preview.deleted_in_tracker.push(item);
        preview.stats.deleted++;
      }
    }

    return preview;
  },

  /**
   * Analyze changes between KPM item, external issue, and snapshot.
   * Returns updates (tracker changed, KPM didn't) and conflicts (both changed).
   * Note: label is no longer synced - we use external_issue_type directly.
   */
  analyzeChanges(
    kpmItem: PlanItem,
    external: ExternalIssue,
    snapshot: SyncSnapshot | null,
    statusMapping: StatusMapping | null
  ): { updates: SyncUpdatedItem['changes']; conflicts: SyncConflict['fields'] } {
    const updates: SyncUpdatedItem['changes'] = [];
    const conflicts: SyncConflict['fields'] = [];

    // Note: label is not synced anymore - we use external_issue_type directly.
    // `normalize` canonicalizes cosmetic markdown so a `*` bullet KPM stored does
    // not read as drift against the `-` bullet Linear stores. Descriptions are
    // markdown on both sides; titles are plain text and compared verbatim.
    const identity = (v: string | null) => v;
    const fields: {
      field: 'title' | 'description' | 'release_tag';
      kpm: string | null;
      external: string | null;
      snapshot: string | null;
      normalize: (v: string | null) => string | null;
    }[] = [
      { field: 'title', kpm: kpmItem.title, external: external.title, snapshot: snapshot?.snapshot_title ?? null, normalize: identity },
      { field: 'description', kpm: kpmItem.description, external: external.description, snapshot: snapshot?.snapshot_description ?? null, normalize: normalizeMarkdown },
    ];

    for (const { field, kpm, external: ext, snapshot: snap, normalize } of fields) {
      // Carry the raw values into the resulting update/conflict so KPM
      // imports exactly what the tracker holds.
      const classification = classifyFieldChange({ local: kpm, remote: ext, snapshot: snap, normalize });

      if (classification.status === 'remoteChanged') {
        updates.push({ field, old_value: kpm, new_value: ext });
      } else if (classification.status === 'conflict') {
        conflicts.push({ field, your_value: kpm, tracker_value: ext });
      }
      // 'localChanged' - KPM wins, no action needed
      // 'unchanged' - nothing to do
    }

    // Always update tracker metadata (no conflict, just display/filtering).
    if (kpmItem.external_status !== external.status) {
      updates.push({ field: 'external_status', old_value: kpmItem.external_status, new_value: external.status });
    }
    const trackerPeopleFields = [
      { field: 'external_assignee_id' as const, kpm: kpmItem.external_assignee_id ?? null, external: external.assignee?.id ?? null },
      { field: 'external_assignee_name' as const, kpm: kpmItem.external_assignee_name ?? null, external: external.assignee?.name ?? null },
      { field: 'external_assignee_avatar_url' as const, kpm: kpmItem.external_assignee_avatar_url ?? null, external: external.assignee?.avatarUrl ?? null },
      { field: 'external_creator_id' as const, kpm: kpmItem.external_creator_id ?? null, external: external.creator?.id ?? null },
      { field: 'external_creator_name' as const, kpm: kpmItem.external_creator_name ?? null, external: external.creator?.name ?? null },
      { field: 'external_creator_avatar_url' as const, kpm: kpmItem.external_creator_avatar_url ?? null, external: external.creator?.avatarUrl ?? null },
    ];
    for (const { field, kpm, external: ext } of trackerPeopleFields) {
      if (kpm !== ext) {
        updates.push({ field, old_value: kpm, new_value: ext });
      }
    }

    // Check if status_category is out of sync with what the tracker status implies.
    // Catches cases where a failed export left status_category in a wrong state.
    const expectedCategory = inferCategoryWithMapping(
      external.status,
      statusMapping,
      { stateType: external.statusType ?? null }
    );
    if (kpmItem.status_category !== expectedCategory) {
      updates.push({ field: 'status_category', old_value: kpmItem.status_category, new_value: expectedCategory });
    }

    return { updates, conflicts };
  },

  /**
   * Create new plan items from external tracker.
   */
  applyNewItems(
    projectId: string,
    preview: SyncPreview,
    result: SyncResult
  ): void {
    for (const item of preview.new_items) {
      try {
        const created = ExternalPlanItemRepository.createFromExternal({
          project_id: projectId,
          association_id: preview.link_id,
          title: item.title,
          description: item.description,
          external_key: item.external_key,
          external_id: item.external_id,
          external_type: preview.tracker_type,
          external_issue_type: item.external_issue_type,
          external_status: item.external_status,
          status_category: item.status_category,
          external_url: item.external_url,
          external_parent_key: item.external_parent_key,
          external_epic_key: item.external_epic_key,
          external_assignee_id: item.external_assignee_id,
          external_assignee_name: item.external_assignee_name,
          external_assignee_avatar_url: item.external_assignee_avatar_url,
          external_creator_id: item.external_creator_id,
          external_creator_name: item.external_creator_name,
          external_creator_avatar_url: item.external_creator_avatar_url,
        });

        recordTrackerAgreement(created.id, item.tracker_state, {}, deps);

        result.created++;
      } catch (e) {
        result.errors.push({ external_key: item.external_key, error: String(e) });
      }
    }
  },

  /**
   * Apply auto-resolved updates (tracker changed, KPM didn't).
   */
  applyUpdates(preview: SyncPreview, result: SyncResult): void {
    for (const item of preview.updated_items) {
      try {
        const updates: {
          title?: string;
          description?: string | null;
          label?: string | null;
          release_tag?: string | null;
          external_status?: string | null;
          status_category?: string | null;
          external_assignee_id?: string | null;
          external_assignee_name?: string | null;
          external_assignee_avatar_url?: string | null;
          external_creator_id?: string | null;
          external_creator_name?: string | null;
          external_creator_avatar_url?: string | null;
        } = {};

        for (const change of item.changes) {
          if (change.field === 'title') updates.title = change.new_value ?? undefined;
          else if (change.field === 'description') updates.description = change.new_value;
          else if (change.field === 'label') updates.label = change.new_value;
          else if (change.field === 'release_tag') updates.release_tag = change.new_value;
          else if (change.field === 'external_status') {
            updates.external_status = change.new_value;
          } else if (change.field === 'status_category') {
            // Direct status_category update (e.g., fixing out-of-sync state)
            updates.status_category = change.new_value;
          } else if (change.field === 'external_assignee_id') updates.external_assignee_id = change.new_value;
          else if (change.field === 'external_assignee_name') updates.external_assignee_name = change.new_value;
          else if (change.field === 'external_assignee_avatar_url') updates.external_assignee_avatar_url = change.new_value;
          else if (change.field === 'external_creator_id') updates.external_creator_id = change.new_value;
          else if (change.field === 'external_creator_name') updates.external_creator_name = change.new_value;
          else if (change.field === 'external_creator_avatar_url') updates.external_creator_avatar_url = change.new_value;
        }

        ExternalPlanItemRepository.updateFromExternal(item.plan_item_id, updates);
        recordTrackerAgreement(item.plan_item_id, item.tracker_state, {}, deps);

        result.updated++;
      } catch (e) {
        result.errors.push({ external_key: item.external_key, error: String(e) });
      }
    }
  },

  /**
   * Apply user conflict resolutions. Either way the tracker's current values
   * become the new snapshot: keeping the local edit means it reads as a local
   * change on the next pass, not as tracker drift to be pulled back in.
   */
  applyConflictResolutions(
    preview: SyncPreview,
    resolutions: Map<string, ConflictResolution>,
    result: SyncResult
  ): void {
    for (const conflict of preview.conflicts) {
      const resolution = resolutions.get(conflict.plan_item_id);

      if (resolution === 'use_theirs') {
        const updates: {
          title?: string;
          description?: string | null;
          label?: string | null;
          release_tag?: string | null;
        } = {};
        for (const field of conflict.fields) {
          if (field.field === 'title') updates.title = field.tracker_value ?? undefined;
          else if (field.field === 'description') updates.description = field.tracker_value;
          else if (field.field === 'label') updates.label = field.tracker_value;
          else if (field.field === 'release_tag') updates.release_tag = field.tracker_value;
        }

        ExternalPlanItemRepository.updateFromExternal(conflict.plan_item_id, updates);
        result.updated++;
      }
      // 'keep_mine' - no database change to item

      recordTrackerAgreement(conflict.plan_item_id, conflict.tracker_state, {}, deps);
    }
  },

  /**
   * Handle items deleted in external tracker.
   * Returns snapshot IDs to be deleted.
   */
  handleDeletedItems(
    preview: SyncPreview,
    deletedAction: DeletedItemAction,
    deletedDecisions: Map<string, 'keep' | 'delete'>,
    result: SyncResult
  ): string[] {
    const snapshotsToDelete: string[] = [];

    for (const item of preview.deleted_in_tracker) {
      let shouldDelete = false;

      if (deletedAction === 'delete') {
        shouldDelete = true;
      } else if (deletedAction === 'decide_each') {
        shouldDelete = deletedDecisions.get(item.id) === 'delete';
      }
      // 'keep_local' - unlink but keep

      if (shouldDelete) {
        PlanItemRepository.delete(item.id);
        snapshotsToDelete.push(item.id);
        result.deleted++;
      } else {
        // Unlink from tracker (keep in KPM)
        ExternalPlanItemRepository.unlinkFromExternal(item.id);
        snapshotsToDelete.push(item.id);
      }
    }

    return snapshotsToDelete;
  },

  /**
   * Apply sync changes within a transaction.
   */
  applySyncChanges(
    projectId: string,
    preview: SyncPreview,
    resolutions: Map<string, ConflictResolution>,
    deletedAction: DeletedItemAction,
    deletedDecisions: Map<string, 'keep' | 'delete'>
  ): SyncResult {
    const result: SyncResult = {
      success: true,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
    };

    const database = getDatabase();

    try {
      database.transaction(() => {
        service.applyNewItems(projectId, preview, result);
        ExternalPlanItemRepository.linkSubtasksToParentIssues(projectId, preview.tracker_type);

        service.applyUpdates(preview, result);
        service.applyConflictResolutions(preview, resolutions, result);
        const snapshotsToDelete = service.handleDeletedItems(preview, deletedAction, deletedDecisions, result);

        if (snapshotsToDelete.length > 0) {
          SyncRepository.bulkDeleteSnapshots(snapshotsToDelete);
        }
      })();

      // Update last synced timestamp on the association
      TrackerRepository.updateAssociationLastSynced(preview.link_id);
    } catch (e) {
      result.success = false;
      result.errors.push({ external_key: 'transaction', error: String(e) });
    }

    return result;
  },
};

  return service;
}

export type SyncService = ReturnType<typeof createSyncService>;
