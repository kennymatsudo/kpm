import { useState, useMemo } from 'react';
import type { SyncUpdatedItem } from '../../../../shared/types';
import { InlineDiff, getInlineDiffHunks } from '../../ui';

interface Props {
  item: SyncUpdatedItem;
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function SyncUpdateCard({ item }: Props) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const toggleExpand = (field: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  // Pre-compute diffs for text fields
  const fieldDiffs = useMemo(() => {
    const diffs: Record<string, ReturnType<typeof getInlineDiffHunks>> = {};
    for (const change of item.changes) {
      if (change.field !== 'external_status' && change.field !== 'status_category') {
        diffs[change.field] = getInlineDiffHunks(change.old_value, change.new_value);
      }
    }
    return diffs;
  }, [item.changes]);

  return (
    <div className="p-3 bg-surface-2 rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs px-1.5 py-0.5 bg-surface-3 rounded text-text-muted font-mono">
          {item.external_key}
        </span>
        <span className="text-sm text-text-primary truncate">{item.title}</span>
      </div>

      {/* Changes - simple stacked list */}
      <div className="space-y-2 pl-2 border-l-2 border-border-subtle">
        {item.changes.map((change) => {
          const isStatusField = change.field === 'external_status' || change.field === 'status_category';
          const isLongContent = !isStatusField && (
            (change.old_value?.length ?? 0) > 100 ||
            (change.new_value?.length ?? 0) > 100
          );
          const isExpanded = expandedFields.has(change.field);

          return (
            <div key={change.field} className="pl-2">
              {/* Field name */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-text-muted font-medium">
                  {formatFieldName(change.field)}
                </span>
                {isLongContent && (
                  <button
                    onClick={() => toggleExpand(change.field)}
                    className="text-xxs text-accent hover:text-accent/80 transition-colors"
                  >
                    {isExpanded ? 'Less' : 'More'}
                  </button>
                )}
              </div>

              {/* Change value */}
              {isStatusField ? (
                // Status: simple arrow format
                <div className="text-xs flex items-center gap-1.5">
                  <span className="text-text-muted">{change.old_value || '(none)'}</span>
                  <span className="text-text-tertiary">→</span>
                  <span className="text-text-primary font-medium">{change.new_value || '(none)'}</span>
                </div>
              ) : (
                // Text: inline diff
                <div
                  className={`text-xs relative ${isLongContent && !isExpanded ? 'max-h-12 overflow-hidden' : ''}`}
                >
                  <InlineDiff hunks={fieldDiffs[change.field] ?? []} />
                  {isLongContent && !isExpanded && (
                    <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-surface-2 to-transparent" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
