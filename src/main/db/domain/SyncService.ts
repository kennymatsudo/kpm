import type { TrackerClient, ExternalIssue } from '../../trackers';
import type {
  PlanItem,
  SyncPreview,
  SyncUpdatedItem,
  SyncConflict,
  SyncResult,
  SyncSnapshot,
  ConflictResolution,
  DeletedItemAction,
} from '../../../shared/types';

type SyncProgressCallback = (phase: string, current: number, total: number) => void;

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

    onProgress?.('fetching', 0, 0);
    preview.stats.total = externalIssues.length;

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

      if (!existing) {
        preview.new_items.push({
          external_key: issue.key,
          title: issue.title,
          description: issue.description,
          external_status: issue.status,
          external_parent_key: issue.parentKey,
          external_epic_key: issue.epicKey,
        });
        preview.stats.new++;
      } else {
        // Existing item - check for changes/conflicts
        const snapshot = snapshots.get(existing.id) ?? null;

        if (analysis.conflicts.length > 0) {
          preview.conflicts.push({
            plan_item_id: existing.id,
            external_key: issue.key,
            title: existing.title,
            fields: analysis.conflicts,
          });
          preview.stats.conflicts++;
        } else if (analysis.updates.length > 0) {
          preview.updated_items.push({
            plan_item_id: existing.id,
            external_key: issue.key,
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
   */
  analyzeChanges(
    kpmItem: PlanItem,
    external: ExternalIssue,
  ): { updates: SyncUpdatedItem['changes']; conflicts: SyncConflict['fields'] } {
    const updates: SyncUpdatedItem['changes'] = [];
    const conflicts: SyncConflict['fields'] = [];

      kpm: string | null;
      external: string | null;
      snapshot: string | null;
    ];


      if (snap === null) {
        // No snapshot - first sync after import, external wins if different
          updates.push({ field, old_value: kpm, new_value: ext });
        }
        // Both changed differently - conflict
        conflicts.push({ field, your_value: kpm, tracker_value: ext });
      } else if (extChanged && !kpmChanged) {
        // Only external changed - auto-update
        updates.push({ field, old_value: kpm, new_value: ext });
      }
    }

    if (kpmItem.external_status !== external.status) {
      updates.push({ field: 'external_status', old_value: kpmItem.external_status, new_value: external.status });
    }

    return { updates, conflicts };
  },

  /**
   * Create new plan items from external tracker.
   * Returns snapshots to be upserted.
   */
  applyNewItems(
    projectId: string,
    preview: SyncPreview,
    result: SyncResult

    for (const item of preview.new_items) {
      try {
        const created = ExternalPlanItemRepository.createFromExternal({
          project_id: projectId,
          association_id: preview.link_id,
          title: item.title,
          description: item.description,
          external_key: item.external_key,
          external_type: preview.tracker_type,
          external_status: item.external_status,
          external_parent_key: item.external_parent_key,
          external_epic_key: item.external_epic_key,
        });

        snapshotsToUpsert.push({
          plan_item_id: created.id,
          snapshot_title: item.title,
          snapshot_description: item.description,
          snapshot_release_tag: null,
          external_updated_at: new Date().toISOString(),
        });

        result.created++;
      } catch (e) {
        result.errors.push({ external_key: item.external_key, error: String(e) });
      }
    }

    return snapshotsToUpsert;
  },

  /**
   * Returns snapshots to be upserted.
   */
  applyUpdates(
    preview: SyncPreview,

    for (const item of preview.updated_items) {
      try {
        const updates: {
          title?: string;
          description?: string | null;
          label?: string | null;
          release_tag?: string | null;
          external_status?: string | null;
        } = {};

        for (const change of item.changes) {
          if (change.field === 'title') updates.title = change.new_value ?? undefined;
          else if (change.field === 'description') updates.description = change.new_value;
          else if (change.field === 'label') updates.label = change.new_value;
          else if (change.field === 'release_tag') updates.release_tag = change.new_value;
        }

        ExternalPlanItemRepository.updateFromExternal(item.plan_item_id, updates);

          snapshotsToUpsert.push({
            plan_item_id: item.plan_item_id,
          });
        }

        result.updated++;
      } catch (e) {
        result.errors.push({ external_key: item.external_key, error: String(e) });
      }
    }

    return snapshotsToUpsert;
  },

  /**
   * Apply user conflict resolutions.
   * Returns snapshots to be upserted.
   */
  applyConflictResolutions(
    preview: SyncPreview,
    resolutions: Map<string, ConflictResolution>,

    for (const conflict of preview.conflicts) {
      const resolution = resolutions.get(conflict.plan_item_id);


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

        snapshotsToUpsert.push({
          plan_item_id: conflict.plan_item_id,
        });
      }
    }

    return snapshotsToUpsert;
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
        ExternalPlanItemRepository.unlinkFromExternal(item.id);
        snapshotsToDelete.push(item.id);
      }
    }

    return snapshotsToDelete;
  },

  /**
   * Apply sync changes within a transaction.
   * Coordinates all sync operations and manages snapshots.
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
        // Apply all operations


        // Bulk update snapshots
        const allSnapshots = [...snapshots1, ...snapshots2, ...snapshots3];
        if (allSnapshots.length > 0) {
          SyncRepository.bulkUpsertSnapshots(allSnapshots);
        }
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
