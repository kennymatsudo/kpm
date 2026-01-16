/**
 * CreateItemDetail - Detail view for create_item actions.
 * Shows preview of the new item being created.
 */

import type { PlanAction, PlanItem } from '../../../../shared/types';

interface CreateItemDetailProps {
  action: Extract<PlanAction, { type: 'create_item' }>;
  planItems: PlanItem[];
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
}

export function CreateItemDetail({ action, planItems, placeholderMap }: CreateItemDetailProps) {
  const parentTitle = getParentTitle(action.parent_id, planItems, placeholderMap);

  return (
      {/* Header badge */}
      <div className="flex items-center gap-2">
          New Item
        </span>
        {action.label && (
            {action.label}
          </span>
        )}
      </div>

      {/* Title */}
      <div>
          <span className="text-sm text-text-primary font-medium">{action.title}</span>
        </div>
      </div>

      {/* Description */}
          {action.description ? (
          ) : (
            <span className="text-xs text-text-tertiary italic">No description</span>
          )}
        </div>
      </div>

      {/* Parent */}
      <div>
          {parentTitle ? (
            <span className="text-xs text-text-secondary">{parentTitle}</span>
          ) : (
            <span className="text-xs text-text-tertiary italic">Root level (no parent)</span>
          )}
        </div>
      </div>
    </div>
  );
}

function getParentTitle(
  parentId: string | null,
  planItems: PlanItem[],
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>
): string | null {
  if (!parentId) return null;

  // Check if it's a placeholder ID
  if (parentId.startsWith('$')) {
    const placeholder = placeholderMap.get(parentId);
    return placeholder?.title || `[New item ${parentId}]`;
  }

  const item = planItems.find(i => i.id === parentId);
  return item?.title || '[missing parent]';
}
