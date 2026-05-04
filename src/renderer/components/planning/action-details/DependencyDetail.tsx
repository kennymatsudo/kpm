/**
 * DependencyDetail - Detail view for add_dependency and remove_dependency actions.
 * Shows the dependency relationship being created or removed.
 */

import type { PlanAction, PlanItem } from '../../../../shared/types';

interface AddDependencyDetailProps {
  action: Extract<PlanAction, { type: 'add_dependency' }>;
  planItems: PlanItem[];
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>;
}

export function AddDependencyDetail({ action, planItems, placeholderMap }: AddDependencyDetailProps) {
  const fromItem = getItemInfo(action.from_id, planItems, placeholderMap);
  const toItem = getItemInfo(action.to_id, planItems, placeholderMap);

  const relationLabel = getRelationLabel(action.relation_type);
  const relationColor = getRelationColor(action.relation_type);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-accent/12 text-accent">
          Add Dependency
        </span>
        <span className={`text-xxs font-medium px-1.5 py-0.5 rounded ${relationColor}`}>
          {relationLabel}
        </span>
      </div>

      {/* Dependency visualization */}
      <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="flex items-center gap-4">
          {/* From item */}
          <div className="flex-1 min-w-0">
            <div className="text-xxs font-medium text-text-muted uppercase tracking-wide mb-2">
              {action.relation_type === 'depends_on' ? 'Depends On' : action.relation_type === 'blocks' ? 'Blocks' : 'Relates To'}
            </div>
            <div className="p-3 rounded-md bg-surface-2 border border-border-subtle">
              {fromItem.isPlaceholder && (
                <span className="text-xxs font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-success/12 text-success mr-2">
                  New
                </span>
              )}
              <span className="text-xs text-text-secondary">{fromItem.title}</span>
            </div>
          </div>

          {/* Arrow with relation type */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0 px-2">
            <div className={`text-xl ${getArrowColor(action.relation_type)}`}>
              {action.relation_type === 'blocks' ? '\u21a0' : '\u2192'}
            </div>
          </div>

          {/* To item */}
          <div className="flex-1 min-w-0">
            <div className="text-xxs font-medium text-text-muted uppercase tracking-wide mb-2">Target</div>
            <div className="p-3 rounded-md bg-surface-2 border border-border-subtle">
              {toItem.isPlaceholder && (
                <span className="text-xxs font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-success/12 text-success mr-2">
                  New
                </span>
              )}
              <span className="text-xs text-text-secondary">{toItem.title}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="p-3 rounded-lg bg-surface-2 border border-border-subtle">
        <p className="text-xs text-text-muted">
          {getRelationDescription(action.relation_type, fromItem.title, toItem.title)}
        </p>
      </div>
    </div>
  );
}

interface RemoveDependencyDetailProps {
  action: Extract<PlanAction, { type: 'remove_dependency' }>;
}

export function RemoveDependencyDetail({ action }: RemoveDependencyDetailProps) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xxs font-bold uppercase tracking-wider px-2 py-1 rounded bg-warning/12 text-warning">
          Remove Dependency
        </span>
      </div>

      {/* Info */}
      <div className="p-4 rounded-lg bg-surface-1 border border-border-subtle">
        <p className="text-xs text-text-secondary">
          Removing dependency relation: <code className="font-mono text-text-primary bg-surface-2 px-1 rounded">{action.relation_id}</code>
        </p>
      </div>
    </div>
  );
}

function getItemInfo(
  id: string,
  planItems: PlanItem[],
  placeholderMap: Map<string, { title: string; description?: string; label?: string }>
): { title: string; isPlaceholder: boolean } {
  // Check if it's a placeholder ID
  if (id.startsWith('$')) {
    const placeholder = placeholderMap.get(id);
    return {
      title: placeholder?.title || `[New item ${id}]`,
      isPlaceholder: true,
    };
  }

  const item = planItems.find(i => i.id === id);
  return {
    title: item?.title || '[missing item]',
    isPlaceholder: false,
  };
}

function getRelationLabel(type: 'depends_on' | 'blocks' | 'relates_to'): string {
  switch (type) {
    case 'depends_on': return 'Depends On';
    case 'blocks': return 'Blocks';
    case 'relates_to': return 'Relates To';
  }
}

function getRelationColor(type: 'depends_on' | 'blocks' | 'relates_to'): string {
  switch (type) {
    case 'depends_on': return 'bg-warning/12 text-warning';
    case 'blocks': return 'bg-danger/12 text-danger';
    case 'relates_to': return 'bg-info/12 text-info';
  }
}

function getArrowColor(type: 'depends_on' | 'blocks' | 'relates_to'): string {
  switch (type) {
    case 'depends_on': return 'text-warning';
    case 'blocks': return 'text-danger';
    case 'relates_to': return 'text-info';
  }
}

function getRelationDescription(type: 'depends_on' | 'blocks' | 'relates_to', from: string, to: string): string {
  switch (type) {
    case 'depends_on':
      return `"${from}" depends on "${to}" and cannot be started until the target is complete.`;
    case 'blocks':
      return `"${from}" blocks "${to}" from being started or completed.`;
    case 'relates_to':
      return `"${from}" is related to "${to}" (informational link, no blocking).`;
  }
}
