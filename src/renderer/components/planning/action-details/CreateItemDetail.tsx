/**
 * CreateItemDetail - Detail view for create_item actions.
 * Shows preview of the new item being created.
 */

import { Markdown } from 'markdown-to-jsx';
import type { PlanAction, PlanItem } from '../../../../shared/types';
import { markdownOptions, transformPlanRefs } from '../../../utils/markdown';

interface CreateItemDetailProps {
  action: Extract<PlanAction, { type: 'create_item' }>;
  planItems: PlanItem[];
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
}

export function CreateItemDetail({ action, planItems, placeholderMap }: CreateItemDetailProps) {
  const parentTitle = getParentTitle(action.parent_id, planItems, placeholderMap);

  return (
    <div className="space-y-3">
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <span className="text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-success/12 text-success">
          New Item
        </span>
        {action.label && (
          <span className="text-xxs font-medium text-text-muted px-1.5 py-0.5 rounded bg-surface-2">
            {action.label}
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Title</div>
        <div className="px-2.5 py-2 rounded-lg bg-success/5 border border-success/20">
          <span className="text-sm text-text-primary font-medium">{action.title}</span>
        </div>
      </div>

      {/* Description */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Description</div>
        <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle max-h-[40vh] overflow-y-auto">
          {action.description ? (
            <div className="prose text-xs">
              <Markdown options={markdownOptions}>{transformPlanRefs(action.description)}</Markdown>
            </div>
          ) : (
            <span className="text-xs text-text-tertiary italic">No description</span>
          )}
        </div>
      </div>

      {/* Parent */}
      <div>
        <div className="text-xxs font-semibold text-text-muted uppercase tracking-wider mb-1">Parent</div>
        <div className="px-2.5 py-2 rounded-lg bg-surface-1 border border-border-subtle">
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
