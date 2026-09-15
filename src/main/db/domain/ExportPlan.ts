import type { Database } from 'better-sqlite3';
import { diffWords } from 'diff';
import type {
  IPlanItemRepository,
  IOutboundChangeRepository,
  ISyncRepository,
  ITrackerRepository,
  ITypeMappingRepository,
} from '../interfaces';
import { createTypeMappingService } from './TypeMappingService';
import { getConfig } from '../../config';
import type {
  CustomFieldValues,
  DiffHunk,
  ExportPreview,
  ExportResult,
  FieldDiff,
  OutboundDeletion,
  OutboundItemChange,
  PlanItem,
  PlanItemSyncUpdates,
  StatusCategory,
  StatusMapping,
  StatusTransitionInfo,
  SyncReviewData,
  SyncReviewItem,
  TrackerAssociationWithScope,
  TrackerIssueType,
  TrackerTransition,
  TrackerType,
} from '../../../shared/types';
import { isOutboundDeletion, isOutboundItemChange } from '../../../shared/types';
import { describeDeletions, drainDeletions } from './TrackerDeletionDrain';
import type { JiraClient, TrackerClient } from '../../tracker-clients';
import {
  findTransitionWithMapping,
  generateTransitionWarning,
  isTransitionNeededWithMapping,
} from '../../trackers/statusTransitions';
import { createStatusReconciler } from '../../trackers/StatusReconciler';
import type { ExternalDestination, ExternalMarkdown } from '../../documents/exportBoundary';
import { normalizeMarkdown } from '../../documents';
import { workBriefFromPlanItem } from '../../../shared/workBrief';
import { projectWorkBriefToTracker, projectWorkBriefToTrackerUpdate } from '../../workBrief/projections';
import { hasRemoteFieldDrifted } from './trackerReconciliation';
import { externalPeopleFields } from './externalPeopleFields';
import { suggestStatusMapping } from '../../../shared/statusMappingSuggest';

interface TrackerClientServiceLike {
  /** Polymorphic factory — preferred for any code path that handles both trackers. */
  getClient(type: TrackerType): Promise<TrackerClient>;
  /** Back-compat for Jira-only call sites that haven't been migrated yet. */
  getJiraClient(): Promise<JiraClient>;
}

export interface ExportPlanDeps {
  database: Database;
  outboundChanges: IOutboundChangeRepository;
  planItems: IPlanItemRepository;
  tracker: ITrackerRepository;
  sync: ISyncRepository;
  typeMappings: ITypeMappingRepository;
  trackerClientService: TrackerClientServiceLike;
  /**
   * Whether newly created tracker issues should be assigned to the user. Read
   * per export rather than captured, so a settings change takes effect without
   * a restart.
   */
  shouldAssignExportsToMe: () => boolean;
}

/**
 * Where a created issue's parent key comes from. A parent created earlier in
 * the same batch has no tracker key while the plan is being resolved, so the
 * plan names the item and execution substitutes the key the create returned.
 */
export type ExportParent =
  | { kind: 'none' }
  | { kind: 'externalKey'; key: string }
  | { kind: 'batchItem'; planItemId: string; title: string };

/** What pushing this entry to the tracker takes, once resolution has succeeded. */
export type ExportExecution =
  | { operation: 'create'; issueTypeId: string }
  | { operation: 'update'; externalKey: string };

export interface ExportPlanEntry {
  queueEntry: OutboundItemChange;
  planItem: PlanItem;
  issueType: { id: string; name: string } | null;
  parent: ExportParent;
  /** Export-boundary projection of the Work Brief — what the tracker payload will carry. */
  description: ExternalMarkdown | null;
  targetStatusCategory: StatusCategory | null;
  validationErrors: string[];
  /** Null when the entry cannot be pushed; `executePlan` refuses it and reports why. */
  execution: ExportExecution | null;
}

/**
 * One resolved answer to "what would exporting this association do", shared by
 * the preview, the review, and the push. Everything an entry needs is decided
 * here, so nothing downstream re-derives an issue type or a parent and no
 * queue column has to carry a resolution between two calls.
 */
export interface ExportPlan {
  kpmProjectId: string;
  associationId: string;
  association: TrackerAssociationWithScope | null;
  /** Null when no tracker client could be created. */
  client: TrackerClient | null;
  entries: ExportPlanEntry[];
  deletions: OutboundDeletion[];
  /** Every plan item in the project, for parent lookup and `@plan` ref resolution. */
  itemsById: Map<string, PlanItem>;
  warnings: string[];
  canProceed: boolean;
}

const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  canceled: 'Canceled',
};

function trackerLabelFor(type: TrackerType): string {
  return type === 'linear' ? 'Linear' : 'Jira';
}

function refDestinationForTracker(type: TrackerType): ExternalDestination {
  return type === 'jira' ? 'jira' : 'linear';
}

function projectForTracker(
  planItem: PlanItem,
  planItems: readonly PlanItem[],
  trackerType: TrackerType
): { title: string; description: ExternalMarkdown | null } {
  return projectWorkBriefToTracker(
    workBriefFromPlanItem(planItem),
    planItems,
    refDestinationForTracker(trackerType),
  );
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

/**
 * The initial status *name* a new issue should be created in, resolved from the
 * association's status mapping. Returns undefined for a default (not-started)
 * create with no mapping; throws when a non-default target has no mapping so the
 * export fails before any external issue is created. Clients that can create in
 * a chosen state (Linear) apply this; others (Jira) reach it via a transition.
 */
function resolveInitialStatusName(
  statusMapping: StatusMapping | null | undefined,
  targetCategory: StatusCategory | null
): string | undefined {
  if (!targetCategory) return undefined;
  const mappedName = statusMapping?.[targetCategory];
  if (!mappedName) {
    if (targetCategory === 'not_started') return undefined;
    throw new Error(`No status mapping configured for "${STATUS_CATEGORY_LABELS[targetCategory]}"`);
  }
  return mappedName;
}

/**
 * Without this, the user opens the Mappings panel and sees suggestions with
 * AUTO badges that look configured but were never persisted — closing the panel
 * drops them and the export silently skips the state transition.
 */
async function bootstrapStatusMapping(
  association: TrackerAssociationWithScope,
  queueEntries: readonly OutboundItemChange[],
  client: TrackerClient,
  tracker: ITrackerRepository
): Promise<TrackerAssociationWithScope> {
  if (association.status_mapping || !queueEntries.some((entry) => entry.target_status_category)) {
    return association;
  }

  try {
    const statuses = await client.getProjectStatuses(association.project_key);
    const { mapping: suggested } = suggestStatusMapping(statuses);
    if (Object.keys(suggested).length > 0) {
      tracker.updateStatusMapping(association.id, suggested);
      return { ...association, status_mapping: suggested };
    }
  } catch (e) {
    console.warn(`[ExportPlan] Failed to bootstrap status mapping for ${association.id}:`, e);
  }

  return association;
}

/**
 * Create a lazy depth calculator that memoizes results.
 * Only calculates depth for requested items (and their ancestors as a side effect).
 */
function createDepthCalculator(itemMap: Map<string, PlanItem>): (itemId: string) => number {
  const cache = new Map<string, number>();

  return function getDepth(itemId: string): number {
    const cached = cache.get(itemId);
    if (cached !== undefined) return cached;

    const item = itemMap.get(itemId);
    if (!item) {
      cache.set(itemId, 0);
      return 0;
    }

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

function emptyPlan(
  kpmProjectId: string,
  associationId: string,
  warnings: string[]
): ExportPlan {
  return {
    kpmProjectId,
    associationId,
    association: null,
    client: null,
    entries: [],
    deletions: [],
    itemsById: new Map(),
    warnings,
    canProceed: false,
  };
}

/**
 * Resolve every queued change for an association into a plan: issue type,
 * parent, projected description, target status, and validation errors per
 * entry. Staged deletions survive a tracker failure here — they need none of
 * the above, so a type-fetch failure leaves them reviewable and drainable.
 */
export async function resolveExportPlan(
  kpmProjectId: string,
  associationId: string,
  deps: ExportPlanDeps
): Promise<ExportPlan> {
  let association = deps.tracker.getAssociationById(associationId);
  if (!association) {
    return emptyPlan(kpmProjectId, associationId, ['Association not found']);
  }

  const allQueueEntries = deps.outboundChanges.getByAssociation(associationId);
  const deletions = allQueueEntries.filter(isOutboundDeletion);
  const queueEntries = allQueueEntries.filter(isOutboundItemChange);

  if (queueEntries.length === 0 && deletions.length === 0) {
    return { ...emptyPlan(kpmProjectId, associationId, ['No items in queue']), association };
  }

  const trackerLabel = trackerLabelFor(association.tracker_type);
  const warnings: string[] = [];

  let client: TrackerClient | null = null;
  let clientError: string | null = null;
  try {
    client = await deps.trackerClientService.getClient(association.tracker_type);
  } catch (e) {
    clientError = `Failed to reach ${trackerLabel}: ${e instanceof Error ? e.message : 'Unknown error'}`;
  }

  // Issue types are a Jira concept; Linear returns a synthetic "Issue" entry.
  let availableTypes: TrackerIssueType[] = [];
  let typeError: string | null = clientError;
  if (client && queueEntries.length > 0) {
    association = await bootstrapStatusMapping(association, queueEntries, client, deps.tracker);
    try {
      availableTypes = await client.getIssueTypes(association.project_key);
    } catch (e) {
      typeError = `Failed to fetch issue types from ${trackerLabel}: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
  }
  if (typeError && queueEntries.length > 0) warnings.push(typeError);

  const allItems = deps.planItems.getByProject(kpmProjectId);
  const itemsById = new Map<string, PlanItem>(allItems.map((item) => [item.id, item]));
  const getDepth = createDepthCalculator(itemsById);

  const typeMappings = createTypeMappingService({
    typeMappings: deps.typeMappings,
    tracker: deps.tracker,
    trackerClientService: deps.trackerClientService,
  });

  const creatingItemIds = new Set(
    queueEntries.filter((e) => e.operation === 'create').map((e) => e.plan_item_id)
  );

  const entries: ExportPlanEntry[] = [];
  let canProceed = true;

  for (const queueEntry of queueEntries) {
    const planItem = itemsById.get(queueEntry.plan_item_id);
    if (!planItem) {
      entries.push({
        queueEntry,
        planItem: { id: queueEntry.plan_item_id } as PlanItem,
        issueType: null,
        parent: { kind: 'none' },
        description: null,
        targetStatusCategory: queueEntry.target_status_category,
        validationErrors: ['Plan item not found'],
        execution: null,
      });
      canProceed = false;
      continue;
    }

    const validationErrors: string[] = [];
    if (typeError) validationErrors.push(typeError);

    // Resolve the parent before the type: nesting is the hint that decides
    // whether a sub-task type applies.
    let parent: ExportParent = { kind: 'none' };
    if (queueEntry.operation === 'create' && planItem.parent_id) {
      const parentItem = itemsById.get(planItem.parent_id);
      if (parentItem?.external_key) {
        parent = { kind: 'externalKey', key: parentItem.external_key };
      } else if (parentItem && creatingItemIds.has(parentItem.id)) {
        parent = { kind: 'batchItem', planItemId: parentItem.id, title: parentItem.title };
      }
    }

    const issueType = typeError
      ? null
      : typeMappings.resolveIssueType(
          planItem,
          kpmProjectId,
          association.scope_id,
          getDepth(planItem.id),
          availableTypes,
          parent.kind !== 'none',
          !!association.epic_key
        );

    if (!issueType && !typeError) {
      validationErrors.push(`Could not resolve ${trackerLabel} issue type`);
    }

    if (issueType?.name.toLowerCase().includes('sub-task')) {
      if (!planItem.parent_id) {
        validationErrors.push('Sub-task type requires a parent item');
      } else if (parent.kind === 'none') {
        validationErrors.push(`Parent item must be queued or already synced to ${trackerLabel}`);
      }
    }

    if (queueEntry.operation === 'update' && !planItem.external_key) {
      validationErrors.push(`Item is queued as an update but is not linked to ${trackerLabel}`);
    }

    let execution: ExportExecution | null = null;
    if (validationErrors.length === 0) {
      execution = queueEntry.operation === 'create'
        ? { operation: 'create', issueTypeId: issueType!.id }
        : { operation: 'update', externalKey: planItem.external_key! };
    } else {
      canProceed = false;
    }

    entries.push({
      queueEntry,
      planItem,
      issueType,
      parent,
      description: projectForTracker(planItem, allItems, association.tracker_type).description,
      targetStatusCategory: queueEntry.target_status_category,
      validationErrors,
      execution,
    });
  }

  const itemsWithoutLabel = entries.filter((e) => !e.planItem.label && e.issueType);
  if (itemsWithoutLabel.length > 0) {
    warnings.push(`${itemsWithoutLabel.length} item(s) using depth-based type fallback (no label set)`);
  }

  return {
    kpmProjectId,
    associationId,
    association,
    client,
    entries,
    deletions,
    itemsById,
    warnings,
    canProceed: canProceed && (entries.length > 0 || deletions.length > 0),
  };
}

function describeParent(parent: ExportParent): string | null {
  switch (parent.kind) {
    case 'externalKey':
      return parent.key;
    case 'batchItem':
      return `(pending: ${parent.title})`;
    case 'none':
      return null;
  }
}

/** Render the plan for the export preview surface. */
export function previewOf(plan: ExportPlan): ExportPreview {
  return {
    items: plan.entries.map((entry) => ({
      queueEntry: {
        ...entry.queueEntry,
        target_issue_type_id: entry.issueType?.id ?? null,
        target_issue_type_name: entry.issueType?.name ?? null,
      },
      planItem: entry.planItem,
      resolvedType: entry.issueType,
      resolvedParent: describeParent(entry.parent),
      resolvedDescription: entry.description,
      validationErrors: entry.validationErrors,
    })),
    deleteItems: plan.deletions.map((queueEntry) => ({ queueEntry })),
    warnings: plan.warnings,
    canProceed: plan.canProceed,
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

/**
 * Render the plan for the task-by-task review: current tracker state,
 * character-level diffs, and the status transition each entry would need.
 */
export async function reviewOf(plan: ExportPlan, deps: ExportPlanDeps): Promise<SyncReviewData> {
  const preview = previewOf(plan);
  const { association, client } = plan;

  if (!plan.canProceed && preview.items.length === 0 && preview.deleteItems.length === 0) {
    return { items: [], deleteItems: [], warnings: preview.warnings, canProceed: false };
  }

  const statusMapping = association?.status_mapping ?? null;

  const itemsNeedingFetch = client
    ? preview.items.filter(
        item => item.queueEntry.operation === 'update' && item.planItem.external_key
      )
    : [];

  // Snapshots record what the tracker held at the last sync. We use them to
  // tell a real external edit apart from the tracker re-rendering markdown:
  // a bumped `updated` timestamp alone is not a conflict if the stored content
  // still matches the snapshot.
  const snapshotMap = deps.sync.getSnapshotsByItemIds(
    itemsNeedingFetch.map(item => item.planItem.id)
  );

  const fetchResults = await Promise.allSettled(
    itemsNeedingFetch.map(item => client!.fetchIssue(item.planItem.external_key!))
  );

  const trackerDataMap = new Map<string, {
    summary: string;
    description: string | null;
    status: string;
    statusType?: string | null;
    updated: string;
  }>();
  itemsNeedingFetch.forEach((item, index) => {
    const result = fetchResults[index];
    if (result.status === 'fulfilled') {
      const issue = result.value;
      trackerDataMap.set(item.planItem.external_key!, {
        summary: issue.title,
        description: issue.description,
        status: issue.status,
        statusType: issue.statusType ?? null,
        updated: issue.updatedAt,
      });
    }
  });

  const itemsNeedingTransitions = client
    ? preview.items.filter(item => {
        const current = trackerDataMap.get(item.planItem.external_key ?? '');
        return (
          item.queueEntry.target_status_category &&
          item.planItem.external_key &&
          current &&
          isTransitionNeededWithMapping(
            current.status,
            item.queueEntry.target_status_category,
            statusMapping,
            { trackerType: association?.tracker_type, stateType: current.statusType ?? null }
          )
        );
      })
    : [];

  const transitionResults = await Promise.allSettled(
    itemsNeedingTransitions.map(item => client!.getTransitions(item.planItem.external_key!))
  );

  const transitionsMap = new Map<string, TrackerTransition[]>();
  itemsNeedingTransitions.forEach((item, index) => {
    const result = transitionResults[index];
    if (result.status === 'fulfilled') {
      transitionsMap.set(item.planItem.external_key!, result.value);
    }
  });

  const reviewItems: SyncReviewItem[] = preview.items.map(item => {
    const trackerCurrent = trackerDataMap.get(item.planItem.external_key ?? '') ?? null;
    let diffs = null;
    let hasConflict = false;

    if (trackerCurrent) {
      // Descriptions compare on the normalized form so the tracker's
      // bullet/whitespace canonicalization (e.g. Linear rewriting `*` to `-`)
      // does not render as a change the user never made.
      const summaryDiff = computeFieldDiff(trackerCurrent.summary, item.planItem.title);
      const descriptionDiff = computeFieldDiff(
        normalizeMarkdown(trackerCurrent.description) ?? '',
        normalizeMarkdown(item.resolvedDescription) ?? ''
      );

      diffs = {
        summary: summaryDiff.hasChanges ? summaryDiff : null,
        description: descriptionDiff.hasChanges ? descriptionDiff : null,
      };

      // Flag a conflict only when the tracker was edited after our last sync
      // AND its current content actually drifted from the snapshot we stored
      // at that sync. The timestamp alone trips on cosmetic re-rendering.
      if (item.planItem.last_synced_at && trackerCurrent.updated) {
        const lastSynced = new Date(item.planItem.last_synced_at).getTime();
        const remoteUpdated = new Date(trackerCurrent.updated).getTime();
        const updatedAfterSync = remoteUpdated > lastSynced;

        const snapshot = snapshotMap.get(item.planItem.id);
        if (snapshot) {
          const descriptionDrifted = hasRemoteFieldDrifted({
            remote: trackerCurrent.description,
            snapshot: snapshot.snapshot_description,
            normalize: normalizeMarkdown,
          });
          const titleDrifted = hasRemoteFieldDrifted({
            remote: trackerCurrent.summary,
            snapshot: snapshot.snapshot_title,
          });
          hasConflict = updatedAfterSync && (descriptionDrifted || titleDrifted);
        } else {
          hasConflict = updatedAfterSync;
        }
      }
    }

    let statusTransition: StatusTransitionInfo | null = null;
    const targetStatusCategory = item.queueEntry.target_status_category;

    if (
      targetStatusCategory &&
      trackerCurrent &&
      isTransitionNeededWithMapping(
        trackerCurrent.status,
        targetStatusCategory,
        statusMapping,
        { trackerType: association?.tracker_type, stateType: trackerCurrent.statusType ?? null }
      )
    ) {
      const transitions = transitionsMap.get(item.planItem.external_key ?? '');
      if (transitions) {
        const bestTransition = findTransitionWithMapping(targetStatusCategory, transitions, statusMapping);
        statusTransition = {
          currentStatus: trackerCurrent.status,
          targetCategory: targetStatusCategory,
          availableTransition: bestTransition,
          warning: bestTransition
            ? null
            : generateTransitionWarning(trackerCurrent.status, targetStatusCategory, transitions, statusMapping),
        };
      } else {
        statusTransition = {
          currentStatus: trackerCurrent.status,
          targetCategory: targetStatusCategory,
          availableTransition: null,
          warning: 'Failed to fetch available transitions',
        };
      }
    }

    // A queued status transition that can't resolve to a tracker state is a
    // hard failure: silently exporting would push title/description but drop
    // the state change — exactly the partial-update we saw burn users.
    const validationErrors = statusTransition?.warning
      ? [...item.validationErrors, statusTransition.warning]
      : item.validationErrors;

    return {
      ...item,
      validationErrors,
      jiraCurrent: trackerCurrent,
      diffs,
      statusTransition,
      decision: 'pending' as const,
      hasConflict,
    };
  });

  const reviewDeleteItems = await describeDeletions(plan.deletions, client);

  return {
    items: reviewItems,
    deleteItems: reviewDeleteItems,
    warnings: preview.warnings,
    canProceed: plan.canProceed,
  };
}

/** Which of a plan's entries and deletions the user approved. */
export interface ExportApproval {
  itemIds: string[];
  deleteIds: string[];
}

function failedExport(error: string): ExportResult {
  return {
    success: false,
    created: [],
    updated: [],
    deleted: [],
    errors: [{ plan_item_id: '', error }],
    deleteErrors: [],
    warnings: [],
  };
}

/**
 * Push the approved part of a plan. Creates run sequentially so a child sees
 * its parent's tracker key; updates run in parallel. An entry whose resolution
 * failed is refused rather than half-pushed.
 */
export async function executePlan(
  plan: ExportPlan,
  approval: ExportApproval,
  deps: ExportPlanDeps
): Promise<ExportResult> {
  const result: ExportResult = {
    success: true,
    created: [],
    updated: [],
    deleted: [],
    errors: [],
    deleteErrors: [],
    warnings: [],
  };

  if (approval.itemIds.length === 0 && approval.deleteIds.length === 0) {
    return result;
  }

  const { association, client } = plan;
  if (!association) return failedExport('Association not found');
  if (!client) {
    return failedExport(plan.warnings[0] ?? 'Failed to reach the tracker');
  }

  const itemMap = new Map(plan.itemsById);
  const approvedSet = new Set(approval.itemIds);

  // Force-include unsynced parents so children don't get orphaned under the
  // epic fallback when only the child was approved.
  const queuedItemIds = new Set(plan.entries.map((e) => e.planItem.id));
  const processedParents = new Set<string>();
  for (const itemId of approval.itemIds) {
    let currentId: string | null = itemMap.get(itemId)?.parent_id ?? null;
    while (currentId && !processedParents.has(currentId)) {
      processedParents.add(currentId);
      const parent = itemMap.get(currentId);
      if (!parent) break;
      if (!parent.external_key && queuedItemIds.has(currentId)) {
        approvedSet.add(currentId);
      }
      currentId = parent.parent_id;
    }
  }

  const approvedEntries = plan.entries.filter((e) => approvedSet.has(e.planItem.id));
  const approvedDeletions = plan.deletions.filter((d) => approval.deleteIds.includes(d.id));

  if (approvedEntries.length === 0 && approvedDeletions.length === 0) {
    return result;
  }

  for (const entry of approvedEntries.filter((e) => !e.execution)) {
    const error = entry.validationErrors[0] ?? 'Entry could not be resolved for export';
    result.errors.push({ plan_item_id: entry.planItem.id, error });
    deps.outboundChanges.setError(entry.queueEntry.id, error);
    result.success = false;
  }

  const executable = approvedEntries.filter((e) => e.execution !== null);
  const getDepth = createDepthCalculator(itemMap);
  const createEntries = executable
    .filter((e) => e.execution!.operation === 'create')
    .sort((a, b) => getDepth(a.planItem.id) - getDepth(b.planItem.id));
  const updateEntries = executable.filter((e) => e.execution!.operation === 'update');

  const createdKeys = new Map<string, string>();
  // Keep the initial projection for each created item. A reference to a
  // sibling created later in this batch has no tracker key during the first
  // create call, so it is exported as plain title text. Once every create has
  // returned its tracker linkage, we update only those descriptions whose
  // projection gained a real tracker reference.
  const createdDescriptions = new Map<string, ExternalMarkdown | null>();

  // The transition-and-verify flow is identical across trackers; the reconciler
  // owns it so neither this function nor the adapters branch on tracker type.
  const reconciler = createStatusReconciler(client, association.status_mapping);

  for (const entry of createEntries) {
    const planItem = entry.planItem;
    const execution = entry.execution as Extract<ExportExecution, { operation: 'create' }>;

    try {
      let parentKey: string | undefined;
      if (entry.parent.kind === 'externalKey') {
        parentKey = entry.parent.key;
      } else if (entry.parent.kind === 'batchItem') {
        parentKey = createdKeys.get(entry.parent.planItemId);
      }

      // With no parent from the KPM hierarchy, hang the issue off the
      // association's epic so it doesn't land loose in the tracker.
      if (!parentKey && association.epic_key) {
        parentKey = association.epic_key;
      }

      // Format custom fields via the client-native helper (Jira wraps option
      // IDs, Linear returns {} since it has no equivalent concept).
      const rawCustomFields = mergeCustomFieldValues(
        entry.queueEntry.custom_field_overrides,
        association.custom_field_values
      );
      const customFields = rawCustomFields && Object.keys(rawCustomFields).length > 0
        ? client.formatCustomFieldsForApi(rawCustomFields)
        : undefined;

      // Sync boundary: only title/description cross to the external tracker.
      // Spec fields (`intent`, `acceptance_criteria`, `source_document_id`) are
      // intentionally local-only — they live in KPM as the developer's source of truth
      // and must not leak to Jira/Linear without an explicit product decision.
      // If you add new spec-like fields, default them to local-only and require sign-off
      // before adding to this payload. See `src/main/claude/CLAUDE.md` (Sync boundary).
      //
      // Labels: `planItem.label` is intentionally not forwarded. Jira would accept the
      // raw string, but Linear requires label UUIDs (not names) — wiring would need a
      // per-team name→ID resolver. Treat labels as KPM-local until that resolver exists.
      //
      // The projection is re-run here rather than reused from the plan because
      // earlier creates in this batch have since gained tracker keys, which is
      // what turns an `@plan` ref into a real tracker link.
      const trackerBrief = projectForTracker(planItem, [...itemMap.values()], association.tracker_type);
      createdDescriptions.set(planItem.id, trackerBrief.description);
      const created = await client.createIssue({
        projectKey: association.project_key,
        issueTypeId: execution.issueTypeId,
        summary: trackerBrief.title,
        description: trackerBrief.description ?? undefined,
        parentKey,
        customFields,
        issueFilter: association.issue_filter,
        initialStatusName: resolveInitialStatusName(
          association.status_mapping,
          entry.targetStatusCategory
        ),
        assignToSelf: deps.shouldAssignExportsToMe(),
      });
      if (created.assigneeSkippedReason) {
        result.warnings.push(
          `${created.key} was created unassigned: ${created.assigneeSkippedReason}`
        );
      }

      // Fetch the created issue so we record the tracker-assigned status.
      // Prevents sync from showing spurious status updates on the next pass.
      let createdIssue = await client.fetchIssue(created.key);
      if (entry.targetStatusCategory) {
        const transition = await reconciler.planTransition(
          created.key,
          createdIssue,
          entry.targetStatusCategory
        );
        if (transition) {
          createdIssue = await reconciler.applyTransition(
            created.key,
            transition,
            entry.targetStatusCategory
          );
        } else {
          reconciler.verifyCategory(createdIssue, entry.targetStatusCategory);
        }
      }

      const syncUpdate: PlanItemSyncUpdates = {
        external_key: created.key,
        external_id: created.id,
        external_type: association.tracker_type,
        external_status: createdIssue.status,
        external_url: created.url,
        ...externalPeopleFields(createdIssue),
        association_id: plan.associationId,
        sync_source: 'local',
        last_synced_at: new Date().toISOString(),
        status_category: reconciler.categoryOf(createdIssue),
      };
      if (getConfig().claude.debug) console.log('[ExportPlan] Updating plan item with external_key:', { planItemId: planItem.id, external_key: created.key, external_url: syncUpdate.external_url });
      deps.planItems.update(planItem.id, syncUpdate);
      itemMap.set(planItem.id, { ...planItem, ...syncUpdate });

      // Snapshot the tracker's own rendering (after any ADF roundtrip) so the
      // next sync doesn't read markdown canonicalization as an external edit.
      deps.sync.upsertSnapshot({
        plan_item_id: planItem.id,
        snapshot_title: createdIssue.title,
        snapshot_description: createdIssue.description,
        snapshot_label: planItem.label,
        snapshot_release_tag: planItem.release_tag,
        external_updated_at: createdIssue.updatedAt,
      });

      createdKeys.set(planItem.id, created.key);
      result.created.push({ plan_item_id: planItem.id, jira_key: created.key });
      deps.outboundChanges.remove(entry.queueEntry.id);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      result.errors.push({ plan_item_id: planItem.id, error: errorMsg });
      deps.outboundChanges.setError(entry.queueEntry.id, errorMsg);
      result.success = false;
    }
  }

  // The create response is KPM's local acknowledgement of the new tracker
  // item, not an inbound sync. Re-project the just-created descriptions now
  // that all successful creates have external keys, then make one narrow
  // outbound update for descriptions that gained a linked reference.
  const currentItems = [...itemMap.values()];
  const referenceUpdates = [...createdDescriptions.entries()].flatMap(([planItemId, initialDescription]) => {
    const planItem = itemMap.get(planItemId);
    if (!planItem?.external_key) return [];

    const { description } = projectForTracker(planItem, currentItems, association.tracker_type);
    return normalizeMarkdown(description) === normalizeMarkdown(initialDescription)
      ? []
      : [{ planItem, description }];
  });

  const referenceUpdateResults = await Promise.all(referenceUpdates.map(async ({ planItem, description }) => {
    try {
      await client.updateIssue(planItem.external_key!, { description });
      const updatedIssue = await client.fetchIssue(planItem.external_key!);
      return { success: true as const, planItem, updatedIssue };
    } catch (e) {
      return {
        success: false as const,
        planItem,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }));

  const referenceUpdatedAt = new Date().toISOString();
  for (const referenceUpdate of referenceUpdateResults) {
    if (!referenceUpdate.success) {
      result.errors.push({ plan_item_id: referenceUpdate.planItem.id, error: referenceUpdate.error });
      result.success = false;
      continue;
    }

    deps.planItems.update(referenceUpdate.planItem.id, { last_synced_at: referenceUpdatedAt });
    deps.sync.upsertSnapshot({
      plan_item_id: referenceUpdate.planItem.id,
      snapshot_title: referenceUpdate.updatedIssue.title,
      snapshot_description: referenceUpdate.updatedIssue.description,
      snapshot_label: referenceUpdate.planItem.label,
      snapshot_release_tag: referenceUpdate.planItem.release_tag,
      external_updated_at: referenceUpdate.updatedIssue.updatedAt,
    });
  }

  const updatePromises = updateEntries.map(async (entry) => {
    const planItem = entry.planItem;
    const externalKey = (entry.execution as Extract<ExportExecution, { operation: 'update' }>).externalKey;

    try {
      const overrideFields = entry.queueEntry.custom_field_overrides
        && Object.keys(entry.queueEntry.custom_field_overrides).length > 0
        ? client.formatCustomFieldsForApi(entry.queueEntry.custom_field_overrides)
        : undefined;

      let transitionToApply: TrackerTransition | null = null;
      let newExternalStatus: string | null = null;

      // Preflight status transitions before mutating title/description. If the
      // queued status can't resolve to a tracker transition, fail the entry
      // without creating a partial external update.
      const targetStatusCategory = entry.targetStatusCategory;
      if (targetStatusCategory) {
        const currentIssue = await client.fetchIssue(externalKey);
        transitionToApply = await reconciler.planTransition(
          externalKey,
          currentIssue,
          targetStatusCategory
        );
        if (!transitionToApply) {
          newExternalStatus = currentIssue.status;
        }
      }

      // Sync boundary: same rule as createIssue above — spec fields are local-only.
      // Do not add `intent`, `acceptance_criteria`, or `source_document_id` to this payload.
      // Plan refs in the description are resolved to native syntax for the tracker.
      const trackerBriefUpdate = projectWorkBriefToTrackerUpdate(
        workBriefFromPlanItem(planItem),
        currentItems,
        refDestinationForTracker(association.tracker_type),
      );
      await client.updateIssue(externalKey, {
        ...trackerBriefUpdate,
        customFields: overrideFields,
      });

      let updatedIssue = await client.fetchIssue(externalKey);

      if (transitionToApply && targetStatusCategory) {
        updatedIssue = await reconciler.applyTransition(
          externalKey,
          transitionToApply,
          targetStatusCategory
        );
        newExternalStatus = updatedIssue.status;
      }

      return { success: true as const, entry, externalKey, newExternalStatus, updatedIssue };
    } catch (e) {
      return {
        success: false as const,
        entry,
        externalKey,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  });

  const updateResults = await Promise.all(updatePromises);

  deps.database.transaction(() => {
    const now = new Date().toISOString();

    for (const updateResult of updateResults) {
      const entry = updateResult.entry;

      if (!updateResult.success) {
        result.errors.push({ plan_item_id: entry.planItem.id, error: updateResult.error });
        deps.outboundChanges.setError(entry.queueEntry.id, updateResult.error);
        result.success = false;
        continue;
      }

      const updateSyncFields: PlanItemSyncUpdates = {
        last_synced_at: now,
        ...externalPeopleFields(updateResult.updatedIssue),
      };
      if (updateResult.newExternalStatus) {
        updateSyncFields.external_status = updateResult.newExternalStatus;
      }
      deps.planItems.update(entry.planItem.id, updateSyncFields);

      deps.sync.upsertSnapshot({
        plan_item_id: entry.planItem.id,
        snapshot_title: updateResult.updatedIssue.title,
        snapshot_description: updateResult.updatedIssue.description,
        snapshot_label: entry.planItem.label,
        snapshot_release_tag: entry.planItem.release_tag,
        external_updated_at: updateResult.updatedIssue.updatedAt,
      });

      result.updated.push({
        plan_item_id: entry.planItem.id,
        jira_key: updateResult.externalKey,
      });
      deps.outboundChanges.remove(entry.queueEntry.id);
    }
  })();

  const drained = await drainDeletions(plan.deletions, approval.deleteIds, client, {
    outboundChanges: deps.outboundChanges,
  });
  result.deleted.push(...drained.deleted);
  result.deleteErrors.push(...drained.errors);
  if (drained.errors.length > 0) result.success = false;

  if (result.created.length > 0 || result.updated.length > 0 || result.deleted.length > 0) {
    deps.tracker.updateAssociationLastSynced(plan.associationId);
  }

  return result;
}
