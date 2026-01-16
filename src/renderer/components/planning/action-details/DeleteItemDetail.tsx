/**
 * DeleteItemDetail - Detail view for delete_item actions.
 * Shows deletion warning and affected descendants.
 */

import type { PlanAction, PlanItem } from '../../../../shared/types';

interface DeleteItemDetailProps {
  action: Extract<PlanAction, { type: 'delete_item' }>;
  planItems: PlanItem[];
}

export function DeleteItemDetail({ action, planItems }: DeleteItemDetailProps) {
  const item = planItems.find(i => i.id === action.item_id);

  if (!item) {
    return (
      <div className="p-4 rounded-lg bg-danger/8 border border-danger/15">
        <p className="text-sm text-danger">Item not found (may have already been deleted)</p>
      </div>
    );
  }

  // Find all descendants
  const descendants = findDescendants(action.item_id, planItems);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
          Delete
        </span>
        {item.label && (
            {item.label}
          </span>
        )}
      </div>

      {/* Item to be deleted */}
      <div>
        <div className="p-3 rounded-lg bg-danger/5 border border-danger/20">
          <p className="text-sm font-medium text-danger">{item.title}</p>
          {item.description && (
            <p className="text-xs text-text-muted mt-2 line-clamp-3">{item.description}</p>
          )}
        </div>
      </div>

      {/* Warning for descendants */}
      {descendants.length > 0 && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-warning">
                This will also delete {descendants.length} child item{descendants.length !== 1 ? 's' : ''}
              </p>
              <ul className="mt-2 space-y-1">
                {descendants.slice(0, 5).map((child) => (
                    <span className="text-danger">\u2022</span>
                    <span className="truncate">{child.title}</span>
                  </li>
                ))}
                {descendants.length > 5 && (
                    ...and {descendants.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Danger zone notice */}
      <div className="p-3 rounded-lg bg-danger/5 border border-danger/15">
        <p className="text-xs text-danger/80">
          This action cannot be undone. The item and all its children will be permanently removed.
        </p>
      </div>
    </div>
  );
}

function findDescendants(parentId: string, planItems: PlanItem[]): PlanItem[] {
  const descendants: PlanItem[] = [];
  const queue = planItems.filter(i => i.parent_id === parentId);

  while (queue.length > 0) {
    const item = queue.shift()!;
    descendants.push(item);
    // Add children of this item to the queue
    const children = planItems.filter(i => i.parent_id === item.id);
    queue.push(...children);
  }

  return descendants;
}
