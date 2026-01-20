import type { Database } from 'better-sqlite3';
import type { PlanAction, PlanActionResult, PlanItem } from '../../../shared/types';
import type {
  IPlanItemRepository,
  IPlanRelationRepository,
  ITrackerRepository,
  ISyncQueueRepository,
} from '../interfaces';

type Logger = Pick<Console, 'log' | 'warn'>;

export interface PlanActionExecutorDeps {
  database: Database;
  planItems: IPlanItemRepository;
  planRelations: IPlanRelationRepository;
  tracker: ITrackerRepository;
  syncQueue: ISyncQueueRepository;
  logger?: Logger;
}

interface ExecutorContext {
  projectId: string;
  idMap: Map<string, string>;
  skippedActions: { index: number; type: string; reason: string }[];
  placeholderCounter: number;
  actionIndex: number;
  /** Transaction-scoped cache for individual items to avoid repeated fetches */
  itemCache: Map<string, PlanItem>;
  deps: PlanActionExecutorDeps;
  logger: Logger;
}

const defaultLogger: Logger = {
  log: console.log,
  warn: console.warn,
};

function resolveId(ctx: ExecutorContext, id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.startsWith('$')) {
    return ctx.idMap.get(id) || null;
  }
  return id;
}

function createId(ctx: ExecutorContext): string {
  ctx.placeholderCounter++;
  ctx.idMap.set(`$${ctx.placeholderCounter}`, id);
  return id;
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
  const id = createId(ctx);
  const parentId = resolveId(ctx, action.parent_id);

  ctx.deps.planItems.add({
    id,
    project_id: ctx.projectId,
    title: action.title,
    description: action.description || null,
    label: action.label || 'story',
    status: 'planned',
    status_category: 'not_started',
    parent_id: parentId,
    group_id: null,
    item_order: ctx.deps.planItems.getNextOrder(ctx.projectId, parentId),
    code_refs: null,
    release_tag: null,
    position_x: null,
    position_y: null,
    association_id: null,
    external_key: null,
    external_id: null,
    external_type: null,
    external_issue_type: null,
    external_status: null,
    external_url: null,
    external_parent_key: null,
    external_epic_key: null,
    sync_source: 'local',
    last_synced_at: null,
  });

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
  const fromId = resolveId(ctx, action.from_id) || action.from_id;
  const toId = resolveId(ctx, action.to_id) || action.to_id;

  ctx.deps.planRelations.add({
    project_id: ctx.projectId,
    from_item_id: fromId,
    to_item_id: toId,
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

function executeDeleteItem(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'delete_item' }>
): void {
  const itemToDelete = getItem(ctx, action.item_id);
  if (!itemToDelete) {
    skip(ctx, 'delete_item', `Item not found: ${action.item_id}`);
    return;
  }
  ctx.deps.planItems.delete(action.item_id);
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
  // Resolve any placeholder IDs
  const resolvedIds = action.item_ids.map(id => resolveId(ctx, id) ?? id);

  // Find the association for this project
  const associations = ctx.deps.tracker.getAssociationsByProject(ctx.projectId);
  if (associations.length === 0) {
    skip(ctx, 'queue_for_tracker', 'No tracker association configured for project');
    return;
  }

  const association = associations[0]; // Use first association

  let queuedCount = 0;
  for (const itemId of resolvedIds) {
    const item = getItem(ctx, itemId);
    if (!item) {
      ctx.logger.warn(`[PlanActionService] queue_for_tracker: Item not found: ${itemId}`);
      continue;
    }

    // Determine operation: create if no external_key, update otherwise
    const operation = item.external_key ? 'update' : 'create';

    // Check if already queued
      continue; // Already queued, skip silently
    }

      operation,
    queuedCount++;
  }

  if (queuedCount > 0) {
    ctx.logger.log(`[PlanActionService] Queued ${queuedCount} item(s) for tracker`);
  }
}

// =============================================================================
// Batch Execution Helpers
// =============================================================================

type ReparentAction = Extract<PlanAction, { type: 'reparent' }>;

/**
 * Collect all item IDs that will be accessed during action execution.
 * This allows pre-fetching them in a single query.
 */
function collectItemIdsForPrefetch(actions: PlanAction[]): Set<string> {
  const ids = new Set<string>();

  for (const action of actions) {
    switch (action.type) {
      case 'reparent':
        ids.add(action.item_id);
        // Also need parent for Jira subtask validation
        if (action.new_parent_id && !action.new_parent_id.startsWith('$')) {
          ids.add(action.new_parent_id);
        }
        break;
      case 'reorder':
      case 'update_item':
      case 'delete_item':
      case 'set_label':
      case 'set_release':
      case 'set_position':
        ids.add(action.item_id);
        break;
      case 'queue_for_tracker':
        for (const id of action.item_ids) {
          if (!id.startsWith('$')) ids.add(id);
        }
        break;
      // These actions are handled separately or don't need prefetch
      case 'create_item':
      case 'add_dependency':
      case 'remove_dependency':
        break;
    }
  }

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
 * Returns an array of { action, index, update } for batch execution.
 */
function validateReparentActions(
  ctx: ExecutorContext,
  actions: { action: ReparentAction; index: number }[]
): { action: ReparentAction; index: number; update: { id: string; parentId: string | null } }[] {
  const valid: { action: ReparentAction; index: number; update: { id: string; parentId: string | null } }[] = [];

  for (const { action, index } of actions) {
    ctx.actionIndex = index;
    const newParentId = resolveId(ctx, action.new_parent_id);

    // Validation: cannot set item as its own parent
    if (newParentId === action.item_id) {
      skip(ctx, 'reparent', 'Cannot set item as its own parent');
      continue;
    }

    // Validation: prevent un-nesting Jira subtasks from their actual Jira parent
    const item = ctx.itemCache.get(action.item_id);
    if (item?.external_parent_key && newParentId === null && item.parent_id) {
      const currentParent = ctx.itemCache.get(item.parent_id);
      if (currentParent?.external_key === item.external_parent_key) {
        skip(ctx, 'reparent', 'Cannot un-nest Jira subtask from its Jira parent');
        continue;
      }
    }

    valid.push({
      action,
      index,
      update: { id: action.item_id, parentId: newParentId },
    });
  }

  return valid;
}

/**
 * Execute reparent actions in batch using the optimized batchReparent method.
 */
function executeBatchReparent(
  ctx: ExecutorContext,
  validActions: { update: { id: string; parentId: string | null } }[]
): void {
  if (validActions.length === 0) return;

  const updates = validActions.map(v => v.update);
  ctx.deps.planItems.batchReparent(updates);

  // Invalidate all modified items from cache
  for (const { update } of validActions) {
    invalidateItem(ctx, update.id);
  }
}

// =============================================================================
// Executor Factory
// =============================================================================

export function createPlanActionExecutor(deps: PlanActionExecutorDeps) {
  const logger = deps.logger ?? defaultLogger;

  const createContext = (projectId: string): ExecutorContext => ({
    projectId,
    idMap: new Map<string, string>(),
    skippedActions: [],
    placeholderCounter: 0,
    actionIndex: 0,
    itemCache: new Map<string, PlanItem>(),
    deps,
    logger,
  });

  /**
   * Execute a batch of plan actions in a single transaction.
   * Optimizations:
   * - Pre-fetches all needed items in one query
   * - Batches reparent operations using prepared statement
   * Returns a result with created IDs mapped from placeholders ($1, $2, etc.)
   */
  function execute(projectId: string, actions: PlanAction[]): PlanActionResult {
    logger.log(`[PlanActionService] Executing ${actions.length} action(s): ${actions.map(a => a.type).join(', ')}`);

    const ctx = createContext(projectId);

    // Separate reparent actions for batch optimization
    const reparentActions: { action: ReparentAction; index: number }[] = [];
    const otherActions: { action: PlanAction; index: number }[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action.type === 'reparent') {
        reparentActions.push({ action, index: i });
      } else {
        otherActions.push({ action, index: i });
      }
    }

    // Pre-fetch all items that will be accessed (outside transaction for read)
    const itemIds = collectItemIdsForPrefetch(actions);
    prefetchItems(ctx, itemIds);

    const transaction = deps.database.transaction(() => {
      // Execute batch reparent if we have multiple reparent actions
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

        switch (action.type) {
          case 'create_item':
            executeCreateItem(ctx, action);
            break;
          case 'set_label':
            executeSetLabel(ctx, action);
            break;
          case 'set_release':
            executeSetRelease(ctx, action);
            break;
          case 'add_dependency':
            executeAddDependency(ctx, action);
            break;
          case 'remove_dependency':
            executeRemoveDependency(ctx, action);
            break;
          case 'reorder':
            executeReorder(ctx, action);
            break;
          case 'update_item':
            executeUpdateItem(ctx, action);
            break;
          case 'delete_item':
            executeDeleteItem(ctx, action);
            break;
          case 'set_position':
            executeSetPosition(ctx, action);
            break;
          case 'queue_for_tracker':
            executeQueueForTracker(ctx, action);
            break;
          // reparent is handled in the batched reparents section above
          case 'reparent':
            // Already processed in batchExecuteReparents
            break;
        }
      }
    });

    try {
      transaction();
      const createdIds: Record<string, string> = {};
      ctx.idMap.forEach((value, key) => {
        createdIds[key] = value;
      });

      if (ctx.skippedActions.length > 0) {
        logger.warn(`[PlanActionService] ${ctx.skippedActions.length} action(s) skipped:`, ctx.skippedActions);
      }

      return {
        success: true,
        createdIds,
        skippedActions: ctx.skippedActions.length > 0 ? ctx.skippedActions : undefined,
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  return { execute };
}
