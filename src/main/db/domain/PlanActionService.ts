import type { PlanAction, PlanActionResult, PlanItem } from '../../../shared/types';


interface ExecutorContext {
  projectId: string;
  idMap: Map<string, string>;
  skippedActions: { index: number; type: string; reason: string }[];
  placeholderCounter: number;
  actionIndex: number;
  /** Transaction-scoped cache for individual items to avoid repeated fetches */
  itemCache: Map<string, PlanItem>;
}

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

    id,
    project_id: ctx.projectId,
    title: action.title,
    description: action.description || null,
    parent_id: parentId,
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
}

function executeSetLabel(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_label' }>
): void {
}

function executeSetRelease(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_release' }>
): void {
}

function executeAddDependency(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'add_dependency' }>
): void {
  const fromId = resolveId(ctx, action.from_id) || action.from_id;
  const toId = resolveId(ctx, action.to_id) || action.to_id;

    project_id: ctx.projectId,
    from_item_id: fromId,
    to_item_id: toId,
    relation_type: action.relation_type,
  });
}

function executeRemoveDependency(
  action: Extract<PlanAction, { type: 'remove_dependency' }>
): void {
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

  invalidateItem(ctx, action.item_id);
}

function executeUpdateItem(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'update_item' }>
): void {
  // Get item before update to check if it's Jira-linked
  const item = getItem(ctx, action.item_id);

  invalidateItem(ctx, action.item_id);

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
  invalidateItem(ctx, action.item_id);
}

function executeSetPosition(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'set_position' }>
): void {
  invalidateItem(ctx, action.item_id);
}

function executeQueueForTracker(
  ctx: ExecutorContext,
  action: Extract<PlanAction, { type: 'queue_for_tracker' }>
): void {
  // Resolve any placeholder IDs
  const resolvedIds = action.item_ids.map(id => resolveId(ctx, id) ?? id);

  // Find the association for this project
  if (associations.length === 0) {
    skip(ctx, 'queue_for_tracker', 'No tracker association configured for project');
    return;
  }

  const association = associations[0]; // Use first association

  let queuedCount = 0;
  for (const itemId of resolvedIds) {
    const item = getItem(ctx, itemId);
    if (!item) {
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

}

// =============================================================================
// =============================================================================


    projectId,
    idMap: new Map<string, string>(),
    skippedActions: [],
    placeholderCounter: 0,
    actionIndex: 0,
    itemCache: new Map<string, PlanItem>(),
  });

    });

    }
