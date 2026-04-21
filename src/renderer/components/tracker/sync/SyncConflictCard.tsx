import { useRef, useCallback, useState, useMemo, type KeyboardEvent } from 'react';
import type { SyncConflict, ConflictResolution } from '../../../../shared/types';
import { InlineDiff, getInlineDiffHunks } from '../../ui';

interface Props {
  conflict: SyncConflict;
  resolution: ConflictResolution | undefined;
  onResolve: (resolution: ConflictResolution) => void;
  /** Index for aria-label */
  index?: number;
  /** Total conflicts for aria-label */
  total?: number;
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

  const keepMineRef = useRef<HTMLButtonElement>(null);
  const useTheirsRef = useRef<HTMLButtonElement>(null);
  const [showDiff, setShowDiff] = useState(true);
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

  // Pre-compute diffs
  const fieldDiffs = useMemo(() => {
    const diffs: Record<string, ReturnType<typeof getInlineDiffHunks>> = {};
    for (const field of conflict.fields) {
      diffs[field.field] = getInlineDiffHunks(field.your_value, field.tracker_value);
    }
    return diffs;
  }, [conflict.fields]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'h':
        e.preventDefault();
        onResolve('keep_mine');
        keepMineRef.current?.focus();
        break;
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        onResolve('use_theirs');
        useTheirsRef.current?.focus();
        break;
      case '1':
        e.preventDefault();
        onResolve('keep_mine');
        break;
      case '2':
        e.preventDefault();
        onResolve('use_theirs');
        break;
      case 'd':
        e.preventDefault();
        setShowDiff(prev => !prev);
        break;
    }
  }, [onResolve]);

  const ariaLabel = index !== undefined && total !== undefined
    ? `Conflict ${index + 1} of ${total}: ${conflict.external_key} - ${conflict.title}`
    : `Conflict: ${conflict.external_key} - ${conflict.title}`;

  return (
    <div
      className={`rounded-xl overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-accent/50 ${!resolution ? 'ring-2 ring-warning/50' : ''}`}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="px-3 py-2 bg-surface-2 flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 bg-surface-3 rounded text-text-muted font-mono">
          {conflict.external_key}
        </span>
        <span className="font-medium text-sm text-text-primary truncate flex-1">
          {conflict.title}
        </span>
        <button
          onClick={() => setShowDiff(prev => !prev)}
          className={`text-xxs px-2 py-1 rounded-md transition-colors ${
            showDiff
              ? 'bg-accent/10 text-accent'
              : 'bg-surface-3 text-text-muted hover:text-text-secondary'
          }`}
        >
          {showDiff ? 'Hide diff' : 'Show diff'}
        </button>
      </div>

      {/* Diff view - shows what changed */}
      {showDiff && (
        <div className="px-3 py-2 bg-surface-1 border-b border-border-subtle">
          <div className="space-y-1.5">
            {conflict.fields.map(field => (
              <div key={field.field}>
                <span className="text-xxs text-text-muted font-medium">
                  {formatFieldName(field.field)}:
                </span>
                <div className="mt-0.5">
                  <InlineDiff hunks={fieldDiffs[field.field] ?? []} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-side comparison */}
      {conflict.fields.map(field => {
        const isLongContent = (field.your_value?.length ?? 0) > 150 || (field.tracker_value?.length ?? 0) > 150;
        const isExpanded = expandedFields.has(field.field);

        return (
          <div key={field.field}>
            <div className="px-3 py-1 bg-surface-1 text-xxs text-text-muted font-medium flex items-center justify-between border-t border-border-subtle">
              <span>{formatFieldName(field.field)}</span>
              {isLongContent && (
                <button
                  onClick={() => toggleExpand(field.field)}
                  className="text-accent hover:text-accent/80 transition-colors"
                >
                  {isExpanded ? 'Less' : 'More'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-px bg-surface-3">
              {/* Your version */}
              <button
                type="button"
                className={`p-3 cursor-pointer bg-surface-1 hover:bg-surface-2 transition-colors text-left w-full ${
                  resolution === 'keep_mine' ? 'bg-success/10 ring-2 ring-success/50 ring-inset' : ''
                }`}
                onClick={() => onResolve('keep_mine')}
                tabIndex={-1}
                aria-pressed={resolution === 'keep_mine'}
              >
                <div className="text-xxs font-medium text-text-muted mb-1">Yours</div>
                <div
                  className={`text-sm text-text-primary whitespace-pre-wrap break-words ${
                    isLongContent && !isExpanded ? 'max-h-16 overflow-hidden relative' : ''
                  }`}
                >
                  {field.your_value || <span className="text-text-muted italic">empty</span>}
                  {isLongContent && !isExpanded && (
                    <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-1 to-transparent" />
                  )}
                </div>
              </button>

              <button
                type="button"
                className={`p-3 cursor-pointer bg-surface-1 hover:bg-surface-2 transition-colors text-left w-full ${
                  resolution === 'use_theirs' ? 'bg-info/10 ring-2 ring-info/50 ring-inset' : ''
                }`}
                onClick={() => onResolve('use_theirs')}
                tabIndex={-1}
                aria-pressed={resolution === 'use_theirs'}
              >
                <div
                  className={`text-sm text-text-primary whitespace-pre-wrap break-words ${
                    isLongContent && !isExpanded ? 'max-h-16 overflow-hidden relative' : ''
                  }`}
                >
                  {field.tracker_value || <span className="text-text-muted italic">empty</span>}
                  {isLongContent && !isExpanded && (
                    <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-1 to-transparent" />
                  )}
                </div>
              </button>
            </div>
          </div>
        );
      })}

      {/* Resolution buttons */}
      <div className="px-3 py-2 bg-surface-2 flex gap-2">
        <button
          ref={keepMineRef}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-success/50 ${
            resolution === 'keep_mine'
              ? 'bg-success text-white'
              : 'bg-surface-3 text-text-primary hover:bg-surface-3/80'
          }`}
          onClick={() => onResolve('keep_mine')}
          aria-pressed={resolution === 'keep_mine'}
        >
          <span className="mr-1.5 text-xxs opacity-60">1</span>
          Keep Mine
        </button>
        <button
          ref={useTheirsRef}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-info/50 ${
            resolution === 'use_theirs'
              ? 'bg-info text-white'
              : 'bg-surface-3 text-text-primary hover:bg-surface-3/80'
          }`}
          onClick={() => onResolve('use_theirs')}
          aria-pressed={resolution === 'use_theirs'}
        >
          <span className="mr-1.5 text-xxs opacity-60">2</span>
        </button>
        {resolution && (
          <span className="ml-auto text-xxs text-success flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Resolved
          </span>
        )}
      </div>
    </div>
  );
}
