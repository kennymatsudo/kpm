

  projectId: string;
  idMap: Map<string, string>;
  skippedActions: { index: number; type: string; reason: string }[];
  placeholderCounter: number;
  actionIndex: number;
}

  if (!id) return null;
  if (id.startsWith('$')) {
    return ctx.idMap.get(id) || null;
  }
  return id;
}

  ctx.placeholderCounter++;
  ctx.idMap.set(`$${ctx.placeholderCounter}`, id);
  return id;
}

  ctx.skippedActions.push({ index: ctx.actionIndex, type, reason });
}

// =============================================================================
// =============================================================================

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
    external_status: null,
    external_url: null,
    external_parent_key: null,
    external_epic_key: null,
    sync_source: 'local',
    last_synced_at: null,
  });
}

  action: Extract<PlanAction, { type: 'set_label' }>
): void {
}

  action: Extract<PlanAction, { type: 'set_release' }>
): void {
}

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

  action: Extract<PlanAction, { type: 'remove_dependency' }>
): void {
}

  action: Extract<PlanAction, { type: 'reorder' }>
): void {
  if (!item) {
    skip(ctx, 'reorder', `Item not found: ${action.item_id}`);
    return;
  }


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

}

  action: Extract<PlanAction, { type: 'update_item' }>
): void {
}

  action: Extract<PlanAction, { type: 'delete_item' }>
): void {
  if (!itemToDelete) {
    skip(ctx, 'delete_item', `Item not found: ${action.item_id}`);
    return;
  }
}

  action: Extract<PlanAction, { type: 'set_position' }>
): void {
}

): void {
  // Resolve any placeholder IDs
  const resolvedIds = action.item_ids.map(id => resolveId(ctx, id) ?? id);

  // Find the association for this project
  if (associations.length === 0) {
    return;
  }

  const association = associations[0]; // Use first association

  let queuedCount = 0;
  for (const itemId of resolvedIds) {
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
  });

    });

    }
