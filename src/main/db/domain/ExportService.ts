import type { Database } from 'better-sqlite3';
import type {
  IPlanItemRepository,
  ISyncQueueRepository,
  ISyncRepository,
  ITrackerRepository,
  ITypeMappingRepository,
} from '../interfaces';
import { createTypeMappingService } from './TypeMappingService';
import { diffWords } from 'diff';
import type {
  SyncQueueEntryWithPlanItem,
  PlanItem,
  PlanItemSyncUpdates,
  ExportPreview,
  ExportPreviewItem,
  ExportResult,
  JiraIssueType,
  SyncReviewData,
  SyncReviewItem,
  FieldDiff,
  DiffHunk,
  StatusTransitionInfo,
  CustomFieldValues,
  TrackerType,
} from '../../../shared/types';
import type { JiraClient, TrackerClient } from '../../tracker-clients';
import { parseLinearFilter } from '../../tracker-clients/linear/filter-types';
import {
  findTransitionWithMapping,
  generateTransitionWarning,
  inferCategoryWithMapping,
} from '../../trackers/statusTransitions';

interface TrackerClientServiceLike {
  /** Polymorphic factory — preferred for any code path that handles both trackers. */
  getClient(type: TrackerType): Promise<TrackerClient>;
  /** Back-compat for Jira-only call sites that haven't been migrated yet. */
  getJiraClient(): Promise<JiraClient>;
}

export interface ExportServiceDeps {
  database: Database;
  syncQueue: ISyncQueueRepository;
  planItems: IPlanItemRepository;
  tracker: ITrackerRepository;
  sync: ISyncRepository;
  typeMappings: ITypeMappingRepository;
  trackerClientService: TrackerClientServiceLike;
}

/**
 * Merge per-item custom field overrides with association-level defaults.
 * Overrides take precedence over defaults.
 */
function mergeCustomFieldValues(
  overrides: CustomFieldValues | null,
  defaults: CustomFieldValues | null
): CustomFieldValues | null {
  if (!defaults && !overrides) return null;
  return {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
  };
}

function readLinearProjectId(filter: string): string | undefined {
  try {
    return parseLinearFilter(filter).projectId;
  } catch {
    return undefined;
  }
}

/**
 * Manages the sync queue and executes the export.
 */
export function createExportService(deps: ExportServiceDeps) {
  const getDatabase = () => deps.database;
  const SyncQueueRepository = deps.syncQueue;
  const PlanItemRepository = deps.planItems;
  const TrackerRepository = deps.tracker;
  const SyncRepository = deps.sync;
  const TypeMappingService = createTypeMappingService({ typeMappings: deps.typeMappings });
  const TrackerClientService = deps.trackerClientService;

  const service = {
  /**
   * Add items to the sync queue.
   * Determines operation type (create vs update) based on external_key.
   * @param associationId - Optional association ID. If not provided and multiple
   *                        associations exist, all items will be skipped with an error.
   */
  queueItems(
    kpmProjectId: string,
    itemIds: string[],
    queuedBy: 'user' | 'claude',
    associationId?: string
  ): { queued: string[]; skipped: { id: string; reason: string }[] } {
    const queued: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    // Get associations for the project
    const associations = TrackerRepository.getAssociationsByProject(kpmProjectId);
    if (associations.length === 0) {
      // Skip all items if no association
      for (const id of itemIds) {
      }
      return { queued, skipped };
    }

    // Resolve association
    let association;
    if (associationId) {
      // Use specified association
      association = associations.find(a => a.id === associationId);
      if (!association) {
        for (const id of itemIds) {
        }
        return { queued, skipped };
      }
    } else if (associations.length === 1) {
      // Single association - use it
      association = associations[0];
    } else {
      // Multiple associations - require explicit selection
      for (const id of itemIds) {
      }
      return { queued, skipped };
    }

    // Build item cache and collect all items to queue (including unsynced parents)
    const allItems = PlanItemRepository.getByProject(kpmProjectId);
    const itemMap = new Map(allItems.map(item => [item.id, item]));

    // Collect all items to queue, walking up parent chains to include unsynced parents
    const itemsToQueue = new Set<string>(itemIds);
    const processedParents = new Set<string>();

    for (const itemId of itemIds) {
      let currentId: string | null = itemMap.get(itemId)?.parent_id ?? null;

      // Walk up the parent chain
      while (currentId && !processedParents.has(currentId)) {
        processedParents.add(currentId);
        const parent = itemMap.get(currentId);

        if (parent) {
          // Only auto-queue parents that don't already have an external_key (not synced)
          if (!parent.external_key) {
            itemsToQueue.add(currentId);
          }
          currentId = parent.parent_id;
        } else {
          break;
        }
      }
    }

    for (const itemId of itemsToQueue) {
      const item = itemMap.get(itemId);
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
   * Update queue entry status category.
   * If the new status matches what's synced to Jira, removes from queue instead.
   * @returns { removed: true } if removed, { removed: false } if updated
   */
  updateQueueStatus(
    queueEntryId: string,
    statusCategory: string | null
  ): { removed: boolean } {
    const queueEntry = SyncQueueRepository.get(queueEntryId);
    if (queueEntry && statusCategory) {
      const planItem = PlanItemRepository.get(queueEntry.plan_item_id);
      if (planItem?.external_status) {
        if (syncedCategory === statusCategory) {
          // Status matches what's in Jira - remove from queue
          console.log(`[ExportService] Removing ${planItem.external_key} from queue - status reverted to synced value (${statusCategory})`);
          SyncQueueRepository.remove(queueEntryId);
          return { removed: true };
        }
      }
    }
    // Otherwise, update the target status category
    SyncQueueRepository.updateStatusCategory(queueEntryId, statusCategory);
    return { removed: false };
  },

  /**
   * Update custom field overrides for a queue entry.
   */
  updateQueueCustomFieldOverrides(
    queueEntryId: string,
    customFieldOverrides: CustomFieldValues | null
  ): void {
    const cleaned = customFieldOverrides && Object.keys(customFieldOverrides).length > 0
      ? customFieldOverrides
      : null;
    SyncQueueRepository.update(queueEntryId, { custom_field_overrides: cleaned });
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

    // Issue types are a Jira concept; Linear returns a synthetic "Issue" entry.
    // Either way we defer to the tracker-specific client.
    let availableTypes: JiraIssueType[];
    try {
      const client = await TrackerClientService.getClient(association.tracker_type);
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

    // Create lazy depth calculator (only computes depth when requested)
    const getDepth = createDepthCalculator(itemMap);

    // Set of items being created (for parent resolution)
    const creatingItemIds = new Set(
      queueEntries.filter(e => e.operation === 'create').map(e => e.plan_item_id)
    );

    // Collect queue updates for batch transaction
    const queueUpdates: { id: string; typeId: string; typeName: string; parentKey: string | null }[] = [];

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
      const depth = getDepth(planItem.id);

      // Determine if item has a syncable parent (for subtask resolution)
      // Check this BEFORE resolving type so we can use it as a hint
      let hasSyncableParent = false;
      let resolvedParent: string | null = null;

      if (entry.operation === 'create' && planItem.parent_id) {
        const parent = itemMap.get(planItem.parent_id);
        if (parent) {
          if (parent.external_key) {
            resolvedParent = parent.external_key;
            hasSyncableParent = true;
          } else if (creatingItemIds.has(parent.id)) {
            resolvedParent = `(pending: ${parent.title})`;
            hasSyncableParent = true;
          }
        }
      }

      // Resolve issue type - pass hasSyncableParent to prefer subtask type when nested
      // Also pass hasEpicKey to shift depth mapping (root = Story instead of Epic)
      const resolvedType = TypeMappingService.resolveIssueType(
        planItem,
        kpmProjectId,
        association.scope_id,
        depth,
        availableTypes,
        hasSyncableParent,
        !!association.epic_key
      );

      if (!resolvedType) {
        canProceed = false;
      }

      const isSubtaskType = resolvedType?.name.toLowerCase().includes('sub-task');

      // Sub-tasks in Jira require a parent - validate this
      if (isSubtaskType) {
        if (!planItem.parent_id) {
          validationErrors.push('Sub-task type requires a parent item');
          canProceed = false;
        } else if (!resolvedParent) {
          canProceed = false;
        }
      }

      // Collect queue entry update for batch processing
      if (resolvedType && entry.operation === 'create') {
        queueUpdates.push({
          id: entry.id,
          typeId: resolvedType.id,
          typeName: resolvedType.name,
          parentKey: resolvedParent?.startsWith('(pending') ? null : resolvedParent,
        });
      }

      items.push({
        queueEntry: { ...entry, target_issue_type_id: resolvedType?.id ?? null, target_issue_type_name: resolvedType?.name ?? null },
        planItem,
        resolvedType,
        resolvedParent,
        validationErrors,
      });
    }

    // Batch update queue entries in a single transaction
    if (queueUpdates.length > 0) {
      const db = getDatabase();
      db.transaction(() => {
        for (const update of queueUpdates) {
          SyncQueueRepository.updateResolvedType(update.id, update.typeId, update.typeName, update.parentKey);
        }
      })();
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
   * Optimized: Parallel Jira API calls for better performance.
   */
  async generateSyncReview(
    kpmProjectId: string,
    associationId: string
  ): Promise<SyncReviewData> {
    // First get the base export preview
    const preview = await service.generateExportPreview(kpmProjectId, associationId);

    if (!preview.canProceed && preview.items.length === 0) {
      return {
        items: [],
        warnings: preview.warnings,
        canProceed: false,
      };
    }

    // Get association for status mapping
    const association = TrackerRepository.getAssociationById(associationId);

    // Get tracker client for fetching current state.
    let client: TrackerClient | null = null;
    if (association) {
      try {
        client = await TrackerClientService.getClient(association.tracker_type);
      } catch {
        // Continue without client - diffs won't be available for updates
      }
    }

    // Identify items that need tracker fetches (updates with external_key)
    const itemsNeedingFetch = client
      ? preview.items.filter(
          item => item.queueEntry.operation === 'update' && item.planItem.external_key
        )
      : [];

    // Parallel fetch all tracker issues
    const jiraFetchResults = await Promise.allSettled(
      itemsNeedingFetch.map(item => client!.fetchIssue(item.planItem.external_key!))
    );

    itemsNeedingFetch.forEach((item, index) => {
      const result = jiraFetchResults[index];
      if (result.status === 'fulfilled') {
        const jiraIssue = result.value;
        jiraDataMap.set(item.planItem.external_key!, {
          summary: jiraIssue.title,
          description: jiraIssue.description,
          status: jiraIssue.status,
          updated: jiraIssue.updatedAt,
        });
      }
    });

    // Identify items that need transitions (have jira data + target status)
    const itemsNeedingTransitions = client
      ? preview.items.filter(item => {
          const jiraData = jiraDataMap.get(item.planItem.external_key ?? '');
          return (
            item.queueEntry.target_status_category &&
            item.planItem.external_key &&
            jiraData &&
          );
        })
      : [];

    // Parallel fetch all transitions
    const transitionResults = await Promise.allSettled(
      itemsNeedingTransitions.map(item => client!.getTransitions(item.planItem.external_key!))
    );

    // Build a map of external_key -> transitions
    const transitionsMap = new Map<string, Awaited<ReturnType<JiraClient['getTransitions']>>>();
    itemsNeedingTransitions.forEach((item, index) => {
      const result = transitionResults[index];
      if (result.status === 'fulfilled') {
        transitionsMap.set(item.planItem.external_key!, result.value);
      }
    });

    // Build review items using the pre-fetched data
    const reviewItems: SyncReviewItem[] = preview.items.map(item => {
      const jiraCurrent = jiraDataMap.get(item.planItem.external_key ?? '') ?? null;
      let diffs = null;
      let hasConflict = false;

      if (jiraCurrent) {
        const summaryDiff = computeFieldDiff(jiraCurrent.summary, item.planItem.title);
        const descriptionDiff = computeFieldDiff(
        );

        diffs = {
          summary: summaryDiff.hasChanges ? summaryDiff : null,
          description: descriptionDiff.hasChanges ? descriptionDiff : null,
        };

        if (item.planItem.last_synced_at && jiraCurrent.updated) {
          const lastSynced = new Date(item.planItem.last_synced_at).getTime();
          const jiraUpdated = new Date(jiraCurrent.updated).getTime();
        }
      }

      // Check for status transition
      let statusTransition: StatusTransitionInfo | null = null;
      const targetStatusCategory = item.queueEntry.target_status_category;

        const transitions = transitionsMap.get(item.planItem.external_key ?? '');
        if (transitions) {
          const bestTransition = findTransitionWithMapping(targetStatusCategory, transitions, statusMapping);
          statusTransition = {
            currentStatus: jiraCurrent.status,
            targetCategory: targetStatusCategory,
            availableTransition: bestTransition,
            warning: bestTransition
              ? null
          };
        } else {
          statusTransition = {
            currentStatus: jiraCurrent.status,
            targetCategory: targetStatusCategory,
            availableTransition: null,
            warning: 'Failed to fetch available transitions',
          };
        }
      }

      return {
        ...item,
        jiraCurrent,
        diffs,
        statusTransition,
        decision: 'pending' as const,
        hasConflict,
      };
    });

    return {
      items: reviewItems,
      warnings: preview.warnings,
      canProceed: preview.canProceed,
    };
  },

  /**
   * Execute export for only approved items.
   * Takes item IDs that were approved in the review flow.
   * Optimized: Creates run sequentially (parent→child), updates run in parallel.
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

    // Get tracker client for this association's tracker type.
    let client: TrackerClient;
    try {
      client = await TrackerClientService.getClient(association.tracker_type);
    } catch (e) {
      return { success: false, created: [], updated: [], errors: [{ plan_item_id: '', error: `Failed to get ${association.tracker_type} client: ${e instanceof Error ? e.message : 'Unknown'}` }] };
    }

    // Get queued items - filter to approved ones, but force-include unsynced
    // parents so subtasks don't get orphaned under the epic fallback.
    const allQueueEntries = SyncQueueRepository.getByAssociation(associationId);
    const allItems = PlanItemRepository.getByProject(kpmProjectId);
    const itemMap = new Map<string, PlanItem>();
    for (const item of allItems) {
      itemMap.set(item.id, item);
    }

    const approvedSet = new Set(approvedItemIds);

    // Walk parent chains of approved creates to ensure unsynced parents are included
    const queuedItemIds = new Set(allQueueEntries.map(e => e.plan_item_id));
    const processedParents = new Set<string>();
    for (const itemId of approvedItemIds) {
      let currentId: string | null = itemMap.get(itemId)?.parent_id ?? null;
      while (currentId && !processedParents.has(currentId)) {
        processedParents.add(currentId);
        const parent = itemMap.get(currentId);
        if (parent) {
          // Force-include unsynced parents that are in the queue
          if (!parent.external_key && queuedItemIds.has(currentId)) {
            approvedSet.add(currentId);
          }
          currentId = parent.parent_id;
        } else {
          break;
        }
      }
    }

    const queueEntries = allQueueEntries.filter(e => approvedSet.has(e.plan_item_id));

    if (queueEntries.length === 0) {
      return result;
    }

    // Separate creates (need sequential for parent resolution) from updates (can parallelize)
    const createEntries = queueEntries.filter(e => e.operation === 'create');
    const updateEntries = queueEntries.filter(e => e.operation === 'update');

    // Sort creates by depth (parents first) - use lazy calculator
    const getDepth = createDepthCalculator(itemMap);
    const sortedCreateEntries = [...createEntries].sort((a, b) => {
      const depthA = getDepth(a.plan_item_id);
      const depthB = getDepth(b.plan_item_id);
      return depthA - depthB;
    });

    // Map to track newly created external keys for parent resolution
    const createdKeys = new Map<string, string>();

    // Linear-only: if the association was scoped to a Linear Project at link time,
    // mirror that scoping on export so new issues land in the same Project. The
    // association's filter is stored as `JSON.stringify(LinearFilter)`; we treat
    // a malformed filter as "no project scope" rather than failing the export.
    const linearProjectId = association.tracker_type === 'linear'
      ? readLinearProjectId(association.jql_filter)
      : undefined;

    // Process creates sequentially (parent must exist before child)
    for (const entry of sortedCreateEntries) {
      const planItem = itemMap.get(entry.plan_item_id);
      if (!planItem) {
        result.errors.push({ plan_item_id: entry.plan_item_id, error: 'Plan item not found' });
        SyncQueueRepository.setError(entry.id, 'Plan item not found');
        continue;
      }

      try {
        let parentKey: string | undefined;
        if (planItem.parent_id) {
          const parent = itemMap.get(planItem.parent_id);
          if (parent?.external_key) {
            parentKey = parent.external_key;
          } else if (createdKeys.has(planItem.parent_id)) {
            parentKey = createdKeys.get(planItem.parent_id);
          }
        }

        if (!parentKey && association.epic_key) {
          parentKey = association.epic_key;
        }

        // Format custom fields via the client-native helper (Jira wraps option
        // IDs, Linear returns {} since it has no equivalent concept).
        const rawCustomFields = mergeCustomFieldValues(
          entry.custom_field_overrides,
          association.custom_field_values
        );
        const customFields = rawCustomFields && Object.keys(rawCustomFields).length > 0
          ? client.formatCustomFieldsForApi(rawCustomFields)
          : undefined;

        // Sync boundary: only title/description cross to the external tracker.
        // Spec fields (`intent`, `acceptance_criteria`, `source_document_id`) are
        // and must not leak to Jira/Linear without an explicit product decision.
        // If you add new spec-like fields, default them to local-only and require sign-off
        // before adding to this payload. See `src/main/claude/CLAUDE.md` (Sync boundary).
        //
        // Labels: `planItem.label` is intentionally not forwarded. Jira would accept the
        // raw string, but Linear requires label UUIDs (not names) — wiring would need a
        const created = await client.createIssue({
          projectKey: association.project_key,
          issueTypeId: entry.target_issue_type_id!,
          summary: planItem.title,
          parentKey,
          customFields,
          linearProjectId,
        });

        // Fetch the created issue so we record the tracker-assigned status.
        // Prevents sync from showing spurious status updates on the next pass.
        const trackerStatus = createdIssue.status;
        const inferredCategory = inferCategoryWithMapping(
          trackerStatus,
          association.status_mapping,
          { stateType: createdIssue.statusType ?? null }
        );

        // Jira's CreatedIssue.self is a REST API URL, not the browse URL, so
        // we build the browse URL from siteUrl. Linear's `self` is already the
        // user-facing URL; prefer it when present.
        const externalUrl = client.type === 'linear' && created.self
          ? created.self
          : `https://${association.site_url}/browse/${created.key}`;

        const syncUpdate: PlanItemSyncUpdates = {
          external_key: created.key,
          external_id: created.id,
          external_type: association.tracker_type,
          external_status: trackerStatus,
          external_url: externalUrl,
          association_id: associationId,
          sync_source: 'local',
          last_synced_at: new Date().toISOString(),
          status_category: inferredCategory,
        };
        console.log('[ExportService] Updating plan item with external_key:', { planItemId: planItem.id, external_key: created.key, external_url: syncUpdate.external_url });
        PlanItemRepository.update(planItem.id, syncUpdate);

        // Create sync snapshot using the actual Jira data (after ADF roundtrip)
        // This ensures subsequent syncs don't show false changes due to markdown conversion
        SyncRepository.upsertSnapshot({
          plan_item_id: planItem.id,
          snapshot_title: createdIssue.title,
          snapshot_description: createdIssue.description,
          snapshot_label: planItem.label, // Label is not synced from Jira
          snapshot_release_tag: planItem.release_tag, // Not synced from Jira
          external_updated_at: createdIssue.updatedAt,
        });

        createdKeys.set(planItem.id, created.key);
        result.created.push({ plan_item_id: planItem.id, jira_key: created.key });
        SyncQueueRepository.remove(entry.id);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        result.errors.push({ plan_item_id: planItem.id, error: errorMsg });
        SyncQueueRepository.setError(entry.id, errorMsg);
        result.success = false;
      }
    }

    // Process updates in parallel (they are independent)
    const updatePromises = updateEntries.map(async (entry) => {
      const planItem = itemMap.get(entry.plan_item_id);
      if (!planItem) {
        return { success: false, entry, planItem: null, error: 'Plan item not found' };
      }

      try {
        // Update fields - pass title and description directly.
        const overrideFields = entry.custom_field_overrides && Object.keys(entry.custom_field_overrides).length > 0
          ? client.formatCustomFieldsForApi(entry.custom_field_overrides)
          : undefined;

        // Sync boundary: same rule as createIssue above — spec fields are local-only.
        // Do not add `intent`, `acceptance_criteria`, or `source_document_id` to this payload.
        await client.updateIssue(planItem.external_key!, {
          summary: planItem.title,
          customFields: overrideFields,
        });

        // Fetch the updated issue to get actual Jira data (after ADF roundtrip)

        // Execute status transition if queued
          try {
          } catch (transitionError) {
            console.error(`Failed to transition ${planItem.external_key}:`, transitionError);
          }
        }

        return { success: true, entry, planItem, newExternalStatus, updatedIssue };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        return { success: false, entry, planItem, error: errorMsg, updatedIssue: null };
      }
    });

    const updateResults = await Promise.all(updatePromises);

    // Batch all database updates in a single transaction for performance
    const db = getDatabase();
    db.transaction(() => {
      const now = new Date().toISOString();

      for (const updateResult of updateResults) {
        const errorMessage = updateResult.error ?? 'Unknown error';

        if (!updateResult.planItem) {
          result.errors.push({ plan_item_id: updateResult.entry.plan_item_id, error: errorMessage });
          SyncQueueRepository.setError(updateResult.entry.id, errorMessage);
          continue;
        }

        if (updateResult.success) {
          const updateSyncFields: PlanItemSyncUpdates = {
            last_synced_at: now,
          };
          if (updateResult.newExternalStatus) {
            updateSyncFields.external_status = updateResult.newExternalStatus;
          }
          PlanItemRepository.update(updateResult.planItem.id, updateSyncFields);

          // Create sync snapshot using the actual Jira data (after ADF roundtrip)
          // This ensures subsequent syncs don't show false changes due to markdown conversion
          if (updateResult.updatedIssue) {
            SyncRepository.upsertSnapshot({
              plan_item_id: updateResult.planItem.id,
              snapshot_title: updateResult.updatedIssue.title,
              snapshot_description: updateResult.updatedIssue.description,
              snapshot_label: updateResult.planItem.label, // Label is not synced from Jira
              snapshot_release_tag: updateResult.planItem.release_tag, // Not synced from Jira
              external_updated_at: updateResult.updatedIssue.updatedAt,
            });
          }

          result.updated.push({
            plan_item_id: updateResult.planItem.id,
            jira_key: updateResult.planItem.external_key ?? '',
          });
          SyncQueueRepository.remove(updateResult.entry.id);
        } else {
          result.errors.push({ plan_item_id: updateResult.planItem.id, error: errorMessage });
          SyncQueueRepository.setError(updateResult.entry.id, errorMessage);
          result.success = false;
        }
      }

      if (result.created.length > 0 || result.updated.length > 0) {
        TrackerRepository.updateAssociationLastSynced(associationId);
      }
    })();

    return result;
  },
};

  return service;
}

export type ExportService = ReturnType<typeof createExportService>;

/**
 * Create a lazy depth calculator that memoizes results.
 * Only calculates depth for requested items (and their ancestors as a side effect).
 * Much more efficient for large projects with small queues.
 */
function createDepthCalculator(itemMap: Map<string, PlanItem>): (itemId: string) => number {
  const cache = new Map<string, number>();

  return function getDepth(itemId: string): number {
    // Check cache first
    const cached = cache.get(itemId);
    if (cached !== undefined) {
      return cached;
    }

    const item = itemMap.get(itemId);
    if (!item) {
      cache.set(itemId, 0);
      return 0;
    }

    // Calculate depth by walking up the tree
    let depth = 0;
    let current = item;
    const visited = new Set<string>();

    while (current.parent_id && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = itemMap.get(current.parent_id);
      if (!parent) break;
      depth++;
      current = parent;
    }

    cache.set(itemId, depth);
    return depth;
  };
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
