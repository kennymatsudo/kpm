import { diffWords } from 'diff';
import type {
  SyncQueueEntryWithPlanItem,
  PlanItem,
  ExportPreview,
  ExportPreviewItem,
  ExportResult,
  JiraIssueType,
  SyncReviewData,
  SyncReviewItem,
  FieldDiff,
  DiffHunk,
/**
 * Manages the sync queue and executes the export.
 */
  /**
   * Add items to the sync queue.
   * Determines operation type (create vs update) based on external_key.
   */
  queueItems(
    kpmProjectId: string,
    itemIds: string[],
  ): { queued: string[]; skipped: { id: string; reason: string }[] } {
    const queued: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    const associations = TrackerRepository.getAssociationsByProject(kpmProjectId);
    if (associations.length === 0) {
      // Skip all items if no association
      for (const id of itemIds) {
      }
      return { queued, skipped };
    }


    for (const itemId of itemIds) {
      if (!item) {
        skipped.push({ id: itemId, reason: 'Item not found' });
        continue;
      }

      // Determine operation: create if no external_key, update otherwise
      const operation = item.external_key ? 'update' : 'create';

      // Try to add to queue
        operation,

      if (entry) {
        queued.push(itemId);
      }
    }

    return { queued, skipped };
  },

  /**
   * Get all queued items for a project with plan item data.
   */
  getQueuedItems(kpmProjectId: string): SyncQueueEntryWithPlanItem[] {
    return SyncQueueRepository.getQueuedItemsWithPlanData(kpmProjectId);
  },

  /**
   * Get queue count for a project.
   */
  getQueueCount(kpmProjectId: string): number {
    return SyncQueueRepository.getQueueCount(kpmProjectId);
  },

  /**
   * Remove an item from the queue.
   */
  removeFromQueue(queueEntryId: string): void {
    SyncQueueRepository.remove(queueEntryId);
  },

  /**
   * Clear the entire queue for a project.
   */
  clearQueue(kpmProjectId: string): void {
    SyncQueueRepository.removeByProject(kpmProjectId);
  },

  /**
   * Generate export preview with validation.
   * Resolves issue types, validates parent relationships, and identifies issues.
   */
  async generateExportPreview(
    kpmProjectId: string,
    associationId: string
  ): Promise<ExportPreview> {
    const items: ExportPreviewItem[] = [];
    const warnings: string[] = [];
    let canProceed = true;

    // Get association context
    const association = TrackerRepository.getAssociationById(associationId);
    if (!association) {
      return {
        items: [],
        warnings: ['Association not found'],
        canProceed: false,
      };
    }

    try {
      availableTypes = await client.getIssueTypes(association.project_key);
    } catch (e) {
      return {
        items: [],
        canProceed: false,
      };
    }

    // Get all queued items for this association
    const queueEntries = SyncQueueRepository.getByAssociation(associationId);
    if (queueEntries.length === 0) {
      return {
        items: [],
        warnings: ['No items in queue'],
        canProceed: false,
      };
    }

    // Build map of all plan items for depth calculation
    const allItems = PlanItemRepository.getByProject(kpmProjectId);
    const itemMap = new Map<string, PlanItem>();
    for (const item of allItems) {
      itemMap.set(item.id, item);
    }


    // Set of items being created (for parent resolution)
    const creatingItemIds = new Set(
      queueEntries.filter(e => e.operation === 'create').map(e => e.plan_item_id)
    );

    // Process each queued item
    for (const entry of queueEntries) {
      const planItem = itemMap.get(entry.plan_item_id);
      if (!planItem) {
        items.push({
          queueEntry: entry,
          planItem: { id: entry.plan_item_id } as PlanItem, // Minimal placeholder
          resolvedType: null,
          resolvedParent: null,
          validationErrors: ['Plan item not found'],
        });
        canProceed = false;
        continue;
      }

      const validationErrors: string[] = [];

      let resolvedParent: string | null = null;
      if (entry.operation === 'create' && planItem.parent_id) {
        const parent = itemMap.get(planItem.parent_id);
        if (parent) {
            resolvedParent = parent.external_key;
          } else if (creatingItemIds.has(parent.id)) {
            resolvedParent = `(pending: ${parent.title})`;
          }
        }
      }

      }

      if (resolvedType && entry.operation === 'create') {
      }

      items.push({
        queueEntry: { ...entry, target_issue_type_id: resolvedType?.id ?? null, target_issue_type_name: resolvedType?.name ?? null },
        planItem,
        resolvedType,
        resolvedParent,
        validationErrors,
      });
    }

    // Add warnings for items using depth fallback
    const itemsWithoutLabel = items.filter(i => !i.planItem.label && i.resolvedType);
    if (itemsWithoutLabel.length > 0) {
      warnings.push(`${itemsWithoutLabel.length} item(s) using depth-based type fallback (no label set)`);
    }

    return { items, warnings, canProceed };
  },

  /**
   * Generate sync review data with Jira comparisons for task-by-task review.
   * Fetches current Jira state for update operations and computes character-level diffs.
   */
  async generateSyncReview(
    kpmProjectId: string,
    associationId: string
  ): Promise<SyncReviewData> {
    // First get the base export preview

    if (!preview.canProceed && preview.items.length === 0) {
      return {
        items: [],
        warnings: preview.warnings,
        canProceed: false,
      };
    }

    }




          );


        }
      }

        ...item,
        jiraCurrent,
        diffs,
        hasConflict,

    return {
      items: reviewItems,
      warnings: preview.warnings,
      canProceed: preview.canProceed,
    };
  },

  /**
   * Execute export for only approved items.
   * Takes item IDs that were approved in the review flow.
   */
  async executeApprovedExport(
    kpmProjectId: string,
    associationId: string,
    approvedItemIds: string[]
  ): Promise<ExportResult> {
    const result: ExportResult = {
      success: true,
      created: [],
      updated: [],
      errors: [],
    };

    if (approvedItemIds.length === 0) {
      return result;
    }

    // Get association
    if (!association) {
      return { success: false, created: [], updated: [], errors: [{ plan_item_id: '', error: 'Association not found' }] };
    }

    try {
    } catch (e) {
    }

    const allQueueEntries = SyncQueueRepository.getByAssociation(associationId);
    const approvedSet = new Set(approvedItemIds);
    const queueEntries = allQueueEntries.filter(e => approvedSet.has(e.plan_item_id));

    if (queueEntries.length === 0) {
      return result;
    }

      return depthA - depthB;
    });

    // Map to track newly created external keys for parent resolution
    const createdKeys = new Map<string, string>();

      const planItem = itemMap.get(entry.plan_item_id);
      if (!planItem) {
        result.errors.push({ plan_item_id: entry.plan_item_id, error: 'Plan item not found' });
        SyncQueueRepository.setError(entry.id, 'Plan item not found');
        continue;
      }

      try {
          }


        }
      }


    return result;
  },
};

/**
 */

}

/**
 * Compute character-level diff between two strings.
 */
function computeFieldDiff(oldValue: string, newValue: string): FieldDiff {
  if (oldValue === newValue) {
    return { hunks: [], hasChanges: false };
  }

  const changes = diffWords(oldValue, newValue);
  const hunks: DiffHunk[] = changes.map(change => ({
    type: change.added ? 'insert' : change.removed ? 'delete' : 'equal',
    value: change.value,
  }));

  return { hunks, hasChanges: true };
}
