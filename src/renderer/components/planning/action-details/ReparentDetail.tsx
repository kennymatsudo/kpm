/**
 * ReparentDetail - Detail view for reparent actions.
 * Shows the item being moved and its old/new parent.
 */

import type { PlanAction, PlanItem } from '../../../../shared/types';

interface ReparentDetailProps {
  action: Extract<PlanAction, { type: 'reparent' }>;
  planItems: PlanItem[];
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
}

export function ReparentDetail({ action, planItems, placeholderMap }: ReparentDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);
  const oldParent = item?.parent_id ? planItems.find(i => i.id === item.parent_id) : null;
  const newParent = getParent(action.new_parent_id, planItems, placeholderMap);

  if (!item) {
    return (
      <div className="p-4 rounded-lg bg-danger/8 border border-danger/15">
        <p className="text-sm text-danger">Item not found (may have been deleted)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
          Move
        </span>
        {item.label && (
            {item.label}
          </span>
        )}
      </div>

      {/* Item being moved */}
      <div>
        <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
          <p className="text-sm font-medium text-text-primary">{item.title}</p>
          {item.description && (
            <p className="text-xs text-text-muted mt-1 line-clamp-2">{item.description}</p>
          )}
        </div>
      </div>

      {/* Parent change visualization */}
      <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="flex items-center gap-4">
          {/* From */}
          <div className="flex-1 min-w-0">
            <div className="p-2.5 rounded-md bg-danger/5 border border-danger/15">
              {oldParent ? (
                <span className="text-xs text-text-secondary">{oldParent.title}</span>
              ) : (
                <span className="text-xs text-text-tertiary italic">Root level</span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="w-8 h-0.5 bg-warning/30 rounded-full" />
            <span className="text-warning text-lg">{'\u2192'}</span>
            <div className="w-8 h-0.5 bg-warning/30 rounded-full" />
          </div>

          {/* To */}
          <div className="flex-1 min-w-0">
            <div className="p-2.5 rounded-md bg-success/5 border border-success/15">
              {newParent ? (
                <span className="text-xs text-text-secondary">{newParent.title}</span>
              ) : (
                <span className="text-xs text-text-tertiary italic">Root level</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getParent(
  parentId: string | null,
  planItems: PlanItem[],
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>
): { title: string } | null {
  if (!parentId) return null;

  // Check if it's a placeholder ID
  if (parentId.startsWith('$')) {
    const placeholder = placeholderMap.get(parentId);
    return placeholder ? { title: placeholder.title } : { title: `[New item ${parentId}]` };
  }

  const item = planItems.find(i => i.id === parentId);
  return item ? { title: item.title } : { title: '[missing parent]' };
}
