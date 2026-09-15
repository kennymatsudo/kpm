import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { PlanAction, PlanActionResult, PlanItem } from '../../../shared/types';
import { isOutboundItemChange } from '../../../shared/types';
import type {
  IPlanItemRepository,
  IPlanRelationRepository,
  ITrackerRepository,
  IOutboundChangeRepository,
  IGroupRepository,
  IRepoRepository,
} from '../interfaces';
import type { QueueTrackerUpdateIfNeeded } from './PlanItemService';
import { queueForTracker } from './OutboundChangePolicy';
import { removePlanItem } from './PlanItemRemoval';
import { assignItemToGroup } from './GroupAssignmentService';
import { getConfig } from '../../config';
import {
  collectRefIds,
  findUnresolvedRefIds,
  mintPlaceholderIds,
  resolveActionRefs,
  type MintedId,
} from '../../../shared/planActionRefs';
import {
  normalizeWorkBriefDraft,
  repositoryScopeFromPlanItem,
  workBriefFromPlanItem,
} from '../../../shared/workBrief';

type Logger = Pick<Console, 'log' | 'warn'>;

export interface PlanActionExecutorDeps {
  database: Database;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  groups: IGroupRepository;
  tracker: ITrackerRepository;
  outboundChanges: IOutboundChangeRepository;
  repos: Pick<IRepoRepository, 'getByProject'>;
  queueTrackerUpdateIfNeeded: QueueTrackerUpdateIfNeeded;
  logger?: Logger;
}

interface ExecutorContext {
  projectId: string;
  createdIds: Record<string, string>;
  skippedActions: { index: number; type: string; reason: string }[];
  actionIndex: number;
  /** Id minted for the action currently dispatching, when it creates one. */
  mintedId: MintedId | null;
  /** Transaction-scoped cache for individual items to avoid repeated fetches */
  itemCache: Map<string, PlanItem>;
  singleProjectRepoId: string | null;
  deps: PlanActionExecutorDeps;
  logger: Logger;
}

const defaultLogger: Logger = {
  // Per-batch execution traces are silent unless `claude.debug` is on — these
  // fire on every plan-action batch during ordinary chat editing.
  log: (...args: unknown[]) => { if (getConfig().claude.debug) console.log(...args); },
  warn: console.warn,
};

/**
 * Claim the id this batch minted for the creating action now dispatching, and
 * publish its placeholder so callers can map `$N` to the persisted row.
 */
function takeMintedId(ctx: ExecutorContext): string {
  const minted = ctx.mintedId;
  if (!minted) throw new Error(`[PlanActionService] No id minted for action ${ctx.actionIndex}`);
  ctx.createdIds[minted.placeholder] = minted.id;
  return minted.id;
}

function skip(ctx: ExecutorContext, type: string, reason: string): void {
  ctx.skippedActions.push({ index: ctx.actionIndex, type, reason });
}

/**
 * Get an item from cache or fetch from database.
 * Caches the result for subsequent calls within the same transaction.
 */
function getItem(ctx: ExecutorContext, itemId: string): PlanItem | undefined {
  const cached = ctx.itemCache.get(itemId);
  if (cached) return cached;

  const item = ctx.deps.planItems.get(itemId);
  if (item) {
    ctx.itemCache.set(itemId, item);
  }
  return item;
}

/**
 * Invalidate a cached item after modification.
 * Call this after updating an item to ensure fresh data on next access.
 */
function invalidateItem(ctx: ExecutorContext, itemId: string): void {
  ctx.itemCache.delete(itemId);
}

// =============================================================================
// Individual Action Executors
// =============================================================================

function executeCreateItem(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'create_item' }>
): void {
  const id = takeMintedId(ctx);
  const workBrief = normalizeWorkBriefDraft({
    title: action.title,
    description: action.description ?? null,
    intent: action.intent ?? null,
    acceptance_criteria: action.acceptance_criteria ?? [],
  });

  ctx.deps.planItems.add({
    id,
    project_id: ctx.projectId,
    title: workBrief.title,
    description: workBrief.description,
    intent: workBrief.intent,
    acceptance_criteria: workBrief.acceptance_criteria.length > 0 ? workBrief.acceptance_criteria : null,
    source_document_id: action.source_document_id ?? null,
    label: action.label || 'story',
    status_category: 'not_started',
    parent_id: action.parent_id,
    item_order: ctx.deps.planItems.getNextOrder(ctx.projectId, action.parent_id),
  });

  const proposedAffected = action.affected_repo_ids ?? [];
  const primaryRepoId = action.primary_repo_id ?? ctx.singleProjectRepoId;
  ctx.deps.planItems.setRepositoryTargets(id, primaryRepoId, proposedAffected);

  // Auto-queue for Jira sync if project has exactly one tracker association
  ctx.deps.queueTrackerUpdateIfNeeded(
    { id, project_id: ctx.projectId, external_key: null, association_id: null, status_category: null },
    { status_category: 'not_started' },
    'claude'
  );
}

function executeSetLabel(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_label' }>
): void {
  ctx.deps.planItems.update(action.item_id, { label: action.label });
}

function executeSetRelease(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_release' }>
): void {
  ctx.deps.planItems.update(action.item_id, { release_tag: action.release_tag });
}

function executeAddDependency(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'add_dependency' }>
): void {
  ctx.deps.planRelations.add({
    project_id: ctx.projectId,
    from_item_id: action.from_id,
    to_item_id: action.to_id,
    relation_type: action.relation_type,
  });
}

function executeRemoveDependency(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'remove_dependency' }>
): void {
  ctx.deps.planRelations.remove(action.relation_id);
}

function executeReorder(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'reorder' }>
): void {
  const item = getItem(ctx, action.item_id);
  if (!item) {
    skip(ctx, 'reorder', `Item not found: ${action.item_id}`);
    return;
  }

  // Use targeted query returning only (id, item_order) for siblings
  const siblings = ctx.deps.planItems.getSiblings(ctx.projectId, item.parent_id, item.id);

  let newOrder: number;
  if (!action.after_item_id) {
    newOrder = siblings.length > 0 ? siblings[0].item_order - 1 : 0;
  } else {
    const afterIndex = siblings.findIndex(s => s.id === action.after_item_id);
    if (afterIndex === -1) {
      newOrder = siblings.length > 0 ? siblings[siblings.length - 1].item_order + 1 : 0;
    } else if (afterIndex === siblings.length - 1) {
      newOrder = siblings[afterIndex].item_order + 1;
    } else {
      newOrder = (siblings[afterIndex].item_order + siblings[afterIndex + 1].item_order) / 2;
    }
  }

  ctx.deps.planItems.update(action.item_id, { item_order: newOrder });
  invalidateItem(ctx, action.item_id);
}

function executeUpdateItem(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'update_item' }>
): void {
  // Get item before update to check if it's Jira-linked
  const item = getItem(ctx, action.item_id);

  ctx.deps.planItems.update(action.item_id, action.updates);
  invalidateItem(ctx, action.item_id);

  if (item) {
    ctx.deps.queueTrackerUpdateIfNeeded(item, action.updates, 'claude');
  }
}

function executeReviseWorkBrief(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'revise_work_brief' }>
): void {
  const previousItem = getItem(ctx, action.item_id);
  const result = ctx.deps.planItems.compareAndReviseWorkBrief(
    action.item_id,
    action.expected_revision,
    action.work_brief,
  );

  if (result.status === 'not_found') {
    throw new Error(`Plan item not found: ${action.item_id}`);
  }
  if (result.status === 'conflict') {
    throw new Error(
      `Work Brief revision conflict for ${action.item_id}: expected ${action.expected_revision}, current ${result.item.work_brief_revision}`,
    );
  }

  ctx.itemCache.set(action.item_id, result.item);
  if (result.status === 'unchanged' || !previousItem) return;

  const previousBrief = workBriefFromPlanItem(previousItem);
  const nextBrief = workBriefFromPlanItem(result.item);
  const trackerUpdates: { title?: string; description?: string | null } = {};
  if (previousBrief.title !== nextBrief.title) trackerUpdates.title = nextBrief.title;
  if (previousBrief.description !== nextBrief.description) trackerUpdates.description = nextBrief.description;
  if (Object.keys(trackerUpdates).length > 0) {
    ctx.deps.queueTrackerUpdateIfNeeded(previousItem, trackerUpdates, 'claude');
  }
}

function executeSetRepoTargets(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_repo_targets' }>
): void {
  const item = getItem(ctx, action.item_id);
  if (item?.project_id !== ctx.projectId) {
    throw new Error(`Plan item not found in project: ${action.item_id}`);
  }
  const currentScope = repositoryScopeFromPlanItem(item);
  const nextScope = action.repository_scope;
  if (
    currentScope.primary_repo_id === nextScope.primary_repo_id
    && currentScope.affected_repo_ids.length === nextScope.affected_repo_ids.length
    && currentScope.affected_repo_ids.every((repoId, index) => repoId === nextScope.affected_repo_ids[index])
  ) return;

  ctx.deps.planItems.setRepositoryTargets(
    action.item_id,
    nextScope.primary_repo_id,
    nextScope.affected_repo_ids,
  );
  invalidateItem(ctx, action.item_id);
}

function executeDeleteItem(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'delete_item' }>
): void {
  const result = removePlanItem(action.item_id, { queuedBy: 'claude', cascade: false }, {
    database: ctx.deps.database,
    planItems: ctx.deps.planItems,
    outboundChanges: ctx.deps.outboundChanges,
  });
  if (result.status === 'not_found') {
    skip(ctx, 'delete_item', `Item not found: ${action.item_id}`);
    return;
  }
  invalidateItem(ctx, action.item_id);
}

function executeSetPosition(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_position' }>
): void {
  ctx.deps.planItems.updatePosition(action.item_id, action.x, action.y);
  invalidateItem(ctx, action.item_id);
}

function executeQueueForTracker(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'queue_for_tracker' }>
): void {
  const associations = ctx.deps.tracker.getAssociationsByProject(ctx.projectId);

  // Prefetch all queued items for this project once, then look up membership in
  // memory — avoids an N+1 getByItemId query per item. Detached delete rows have
  // no plan item, so they never participate in this create/update dedup map.
  const alreadyQueuedItemIds = new Map(
    ctx.deps.outboundChanges
      .getByProject(ctx.projectId)
      .filter(isOutboundItemChange)
      .map((entry) => [entry.plan_item_id, entry.id])
  );

  const result = queueForTracker({
    projectId: ctx.projectId,
    itemIds: action.item_ids,
    queuedBy: 'claude',
    associations,
    alreadyQueuedItemIds,
    getItem: (itemId) => getItem(ctx, itemId),
    outboundChanges: ctx.deps.outboundChanges,
    onItemNotFound: (itemId) => ctx.logger.warn(`[PlanActionService] queue_for_tracker: Item not found: ${itemId}`),
  });

  if (result.skippedReason === 'no_association') {
    skip(ctx, 'queue_for_tracker', 'No tracker association configured for project');
    return;
  }

  if (result.queuedCount > 0) {
    ctx.logger.log(`[PlanActionService] Queued ${result.queuedCount} item(s) for tracker`);
  }
}

// =============================================================================
// Group Action Executors
// =============================================================================

// Default color for groups (not exposed to Claude, just for DB compatibility)
const DEFAULT_GROUP_COLOR = '#e0e7ff';

function executeCreateGroup(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'create_group' }>
): void {
  const id = takeMintedId(ctx);
  ctx.deps.groups.create(
    {
      project_id: action.project_id,
      name: action.name,
      color: DEFAULT_GROUP_COLOR,
      position_x: action.position_x,
      position_y: action.position_y,
      width: action.width,
      height: action.height,
      is_collapsed: false,
    },
    id
  );
}

function executeUpdateGroup(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'update_group' }>
): void {
  const group = ctx.deps.groups.getById(action.group_id);
  if (!group) {
    skip(ctx, 'update_group', `Group not found: ${action.group_id}`);
    return;
  }
  ctx.deps.groups.update(action.group_id, action.updates);
}

function executeDeleteGroup(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'delete_group' }>
): void {
  const group = ctx.deps.groups.getById(action.group_id);
  if (!group) {
    skip(ctx, 'delete_group', `Group not found: ${action.group_id}`);
    return;
  }
  // Items in the group have their group_id set to NULL via ON DELETE SET NULL.
  ctx.deps.groups.delete(action.group_id);
}

function executeAssignToGroup(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'assign_to_group' }>
): void {
  const result = assignItemToGroup(action.item_id, action.group_id, {
    groups: ctx.deps.groups,
    planItems: ctx.deps.planItems,
  });
  if (!result.ok) {
    skip(ctx, 'assign_to_group', result.error);
    return;
  }
  invalidateItem(ctx, action.item_id);
}

type ReparentAction = Extract<PlanAction, { type: 'reparent' }>;
interface ReparentUpdate { id: string; parentId: string | null }

/**
 * The parent move this reparent should make, or null when it must be skipped.
 */
function planReparent(ctx: ExecutorContext, action: ReparentAction): ReparentUpdate | null {
  if (action.new_parent_id === action.item_id) {
    skip(ctx, 'reparent', 'Cannot set item as its own parent');
    return null;
  }

  const item = ctx.itemCache.get(action.item_id);
  if (item?.external_parent_key && action.new_parent_id === null && item.parent_id) {
    const currentParent = ctx.itemCache.get(item.parent_id);
    if (currentParent?.external_key === item.external_parent_key) {
      skip(ctx, 'reparent', 'Cannot un-nest Jira subtask from its Jira parent');
      return null;
    }
  }

  return { id: action.item_id, parentId: action.new_parent_id };
}

function executeReparent(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'reparent' }>
): void {
  const update = planReparent(ctx, action);
  if (!update) return;

  ctx.deps.planItems.batchReparent([update]);
  invalidateItem(ctx, update.id);
}

// =============================================================================
// Dispatch Table
// =============================================================================

type ActionExecutor<T extends PlanAction['type']> = (
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: T }>
) => void;

/**
 * One entry per PlanAction type, keyed the same way as PLAN_ACTION_REGISTRY
 * (shared/planActionSchema.ts). The `Record<PlanAction['type'], ...>` key type
 * means a new PlanAction variant without an entry here is a compile error,
 * not a runtime throw.
 */
const ACTION_EXECUTORS: { [T in PlanAction['type']]: ActionExecutor<T> } = {
  create_item: executeCreateItem,
  set_label: executeSetLabel,
  set_release: executeSetRelease,
  add_dependency: executeAddDependency,
  remove_dependency: executeRemoveDependency,
  reorder: executeReorder,
  update_item: executeUpdateItem,
  revise_work_brief: executeReviseWorkBrief,
  set_repo_targets: executeSetRepoTargets,
  delete_item: executeDeleteItem,
  set_position: executeSetPosition,
  queue_for_tracker: executeQueueForTracker,
  create_group: executeCreateGroup,
  update_group: executeUpdateGroup,
  delete_group: executeDeleteGroup,
  assign_to_group: executeAssignToGroup,
  reparent: executeReparent,
};

// =============================================================================
// Batch Execution Helpers
// =============================================================================

function referencesMintedId(action: PlanAction, mintedIds: ReadonlySet<string>): boolean {
  for (const id of collectRefIds([action], 'planItem')) {
    if (mintedIds.has(id)) return true;
  }
  return false;
}

/**
 * Item ids the batch will read, from the ref descriptors. Ids this batch is
 * about to mint are excluded — no row exists for them yet.
 */
function collectItemIdsForPrefetch(actions: PlanAction[], mintedIds: ReadonlySet<string>): Set<string> {
  const ids = collectRefIds(actions, 'planItem');
  for (const id of mintedIds) ids.delete(id);
  return ids;
}

/**
 * Pre-populate the item cache with all items that will be needed.
 * This reduces N individual queries to 1 batch query.
 */
function prefetchItems(ctx: ExecutorContext, ids: Set<string>): void {
  if (ids.size === 0) return;

  const items = ctx.deps.planItems.getMany(Array.from(ids));
  for (const item of items) {
    ctx.itemCache.set(item.id, item);
  }

  // Also fetch parent items for Jira subtask validation
  const parentIds = new Set<string>();
  for (const item of items) {
    if (item.parent_id && !ctx.itemCache.has(item.parent_id)) {
      parentIds.add(item.parent_id);
    }
  }

  if (parentIds.size > 0) {
    const parents = ctx.deps.planItems.getMany(Array.from(parentIds));
    for (const parent of parents) {
      ctx.itemCache.set(parent.id, parent);
    }
  }
}

/**
 * Validate and filter reparent actions, returning only the valid ones.
 */
function validateReparentActions(
  ctx: ExecutorContext,
  actions: { action: ReparentAction; index: number }[]
): ReparentUpdate[] {
  const valid: ReparentUpdate[] = [];

  for (const { action, index } of actions) {
    ctx.actionIndex = index;
    const update = planReparent(ctx, action);
    if (update) valid.push(update);
  }

  return valid;
}

/**
 * Execute reparent actions in batch using the optimized batchReparent method.
 */
function executeBatchReparent(ctx: ExecutorContext, updates: ReparentUpdate[]): void {
  if (updates.length === 0) return;

  ctx.deps.planItems.batchReparent(updates);
  for (const update of updates) {
    invalidateItem(ctx, update.id);
  }
}

// =============================================================================
// Executor Factory
// =============================================================================

export function createPlanActionExecutor(deps: PlanActionExecutorDeps) {
  const logger = deps.logger ?? defaultLogger;

  function validatePlanRefs(projectId: string, actions: PlanAction[]): string | null {
    const unresolved = findUnresolvedRefIds(actions, () =>
      deps.planItems.getByProject(projectId).map((item) => item.id));
    if (unresolved.length === 0) return null;
    return `Plan action references unknown plan item(s): ${unresolved.join(', ')}`;
  }

  const createContext = (projectId: string, projectRepoIds: Set<string>): ExecutorContext => ({
    projectId,
    createdIds: {},
    skippedActions: [],
    actionIndex: 0,
    mintedId: null,
    itemCache: new Map<string, PlanItem>(),
    singleProjectRepoId: projectRepoIds.size === 1 ? [...projectRepoIds][0] : null,
    deps,
    logger,
  });

  function validateRepoTargets(actions: PlanAction[], projectRepoIds: Set<string>): string | null {
    for (const action of actions) {
      if (action.type !== 'create_item' && action.type !== 'set_repo_targets') continue;
      const repoIds = action.type === 'create_item'
        ? [action.primary_repo_id, ...(action.affected_repo_ids ?? [])]
        : [action.repository_scope.primary_repo_id, ...action.repository_scope.affected_repo_ids];
      const presentRepoIds = repoIds.filter((repoId): repoId is string => Boolean(repoId));
      const invalid = [...new Set(presentRepoIds)].filter((repoId) => !projectRepoIds.has(repoId));
      if (invalid.length > 0) {
        return `Plan action references repo(s) not connected to this project: ${invalid.join(', ')}`;
      }
    }
    return null;
  }

  /**
   * Execute a batch of plan actions in a single transaction.
   *
   * Ids are minted for the batch's creating actions up front, so every `$N` is
   * rewritten to a real id before any executor runs and no executor has to
   * know that placeholders exist. Reparents are batched into one prepared
   * statement, except those pointing at an entity this batch creates — those
   * must run in order, after the create.
   *
   * Returns a result with created IDs mapped from placeholders ($1, $2, etc.)
   */
  function execute(projectId: string, actions: PlanAction[]): PlanActionResult {
    logger.log(`[PlanActionService] Executing ${actions.length} action(s): ${actions.map(a => a.type).join(', ')}`);

    // Validate any @plan/<uuid> references in user-visible text fields against
    // existing items in this project. Hallucinated UUIDs (typically from
    // Claude) must not be persisted — they would render as broken chips and
    // leak into tracker descriptions on sync. Refs to items being created in
    // the same batch are fine: we don't know their concrete UUIDs yet (the
    // executor mints them with `randomUUID()`), but Claude has no way to know
    // them either, so any UUID it emits must already exist.
    const projectRepoIds = new Set(deps.repos.getByProject(projectId).map((repo) => repo.id));
    const repoValidationError = validateRepoTargets(actions, projectRepoIds);
    if (repoValidationError) {
      return { success: false, error: repoValidationError };
    }

    const refValidationError = validatePlanRefs(projectId, actions);
    if (refValidationError) {
      return { success: false, error: refValidationError };
    }

    const ctx = createContext(projectId, projectRepoIds);
    const minted = mintPlaceholderIds(actions, randomUUID);
    const mintedIds = new Set([...minted.byActionIndex.values()].map((entry) => entry.id));

    const reparentActions: { action: ReparentAction; index: number }[] = [];
    const otherActions: { action: PlanAction; index: number }[] = [];
    const resolvedActions: PlanAction[] = [];

    actions.forEach((action, index) => {
      const resolution = resolveActionRefs(action, minted.byPlaceholder);
      if (resolution.status === 'unresolved') {
        ctx.actionIndex = index;
        skip(ctx, action.type, resolution.reason);
        return;
      }
      const resolved = resolution.action;
      resolvedActions.push(resolved);
      if (resolved.type === 'reparent' && !referencesMintedId(resolved, mintedIds)) {
        reparentActions.push({ action: resolved, index });
      } else {
        otherActions.push({ action: resolved, index });
      }
    });

    // Pre-fetch all items that will be accessed (outside transaction for read)
    prefetchItems(ctx, collectItemIdsForPrefetch(resolvedActions, mintedIds));

    const transaction = deps.database.transaction(() => {
      if (reparentActions.length > 0) {
        const validReparents = validateReparentActions(ctx, reparentActions);
        if (validReparents.length > 0) {
          logger.log(`[PlanActionService] Batch reparenting ${validReparents.length} items`);
          executeBatchReparent(ctx, validReparents);
        }
      }

      // Execute other actions individually (maintaining original order)
      for (const { action, index } of otherActions) {
        ctx.actionIndex = index;
        ctx.mintedId = minted.byActionIndex.get(index) ?? null;
        const executor = ACTION_EXECUTORS[action.type] as ActionExecutor<typeof action.type>;
        executor(ctx, action);
      }
    });

    try {
      transaction();

      if (ctx.skippedActions.length > 0) {
        logger.warn(`[PlanActionService] ${ctx.skippedActions.length} action(s) skipped:`, ctx.skippedActions);
      }

      return {
        success: true,
        createdIds: ctx.createdIds,
        skippedActions: ctx.skippedActions.length > 0 ? ctx.skippedActions : undefined,
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  return { execute };
}

export type PlanActionExecutor = ReturnType<typeof createPlanActionExecutor>;
