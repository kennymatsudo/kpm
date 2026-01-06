import type { FieldDiff, StatusTransitionInfo } from '../../../shared/types';
import { STATUS_CATEGORY_CONFIG } from '../../constants/statusConfig';

interface DiffRendererProps {
  diff: FieldDiff;
  className?: string;
}

/**
 * Renders a character-level diff with GitHub-style coloring.
 * Deleted text is shown in red with strikethrough.
 * Inserted text is shown in green.
 * Equal text is shown normally.
 */
export function DiffRenderer({ diff, className = '' }: DiffRendererProps) {
  if (!diff.hasChanges || diff.hunks.length === 0) {
    return <span className={`text-text-muted ${className}`}>No changes</span>;
  }

  return (
    <div className={`font-mono text-sm whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {diff.hunks.map((hunk, index) => {
        switch (hunk.type) {
          case 'delete':
            return (
              <span
                key={index}
                className="bg-danger/15 text-danger line-through decoration-danger/50"
              >
                {hunk.value}
              </span>
            );
          case 'insert':
            return (
              <span key={index} className="bg-success/15 text-success">
                {hunk.value}
              </span>
            );
          case 'equal':
          default:
            return (
              <span key={index} className="text-text-secondary">
                {hunk.value}
              </span>
            );
        }
      })}
    </div>
  );
}

interface FieldDiffViewProps {
  label: string;
  diff: FieldDiff | null;
  oldValue?: string | null;
  newValue?: string | null;
  isCreate?: boolean;
  grow?: boolean;
}

/**
 * Displays a labeled diff for a single field.
 * Shows "no changes" if diff is null or has no changes.
 * For creates, just shows the new value without diff styling.
 */
export function FieldDiffView({ label, diff, oldValue, newValue, isCreate, grow }: FieldDiffViewProps) {
  const hasChanges = diff?.hasChanges ?? false;

  return (
    <div className={`mb-4 ${grow ? 'flex-1 flex flex-col min-h-0' : ''}`}>
      <div className="flex items-center gap-2.5 mb-2">
        {!isCreate && !hasChanges && (
        )}
      </div>
      <div
        className={`p-4 rounded-xl bg-surface-2 border border-border-default ${grow ? 'flex-1 overflow-y-auto' : ''}`}
      >
        {isCreate ? (
          // For creates, just show the value
          <span className="font-mono text-sm text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
            {newValue || <span className="text-text-tertiary italic">Empty</span>}
          </span>
        ) : hasChanges && diff ? (
          // For updates with changes, show the diff
          <DiffRenderer diff={diff} />
        ) : (
          // No changes - show current value
          <span className="font-mono text-sm text-text-muted whitespace-pre-wrap break-words leading-relaxed">
            {oldValue || newValue || <span className="text-text-tertiary italic">Empty</span>}
          </span>
        )}
      </div>
    </div>
  );
}

interface StatusTransitionViewProps {
  transition: StatusTransitionInfo;
}

/**
 * Displays a status transition for sync review.
 */
  const targetConfig = STATUS_CATEGORY_CONFIG[transition.targetCategory];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {transition.warning && (
          </span>
        )}
      </div>
      <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="flex items-center gap-2">
          {/* Current status */}
            {transition.currentStatus}
          </span>

          {/* Arrow */}
          <svg className="w-4 h-4 text-text-tertiary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>

          {/* Target status */}
            {transition.availableTransition?.to.name || targetConfig.label}
          </span>
        </div>

        {/* Warning message */}
        {transition.warning && (
          <div className="mt-2 p-2 rounded bg-warning/8 border border-warning/15">
          </div>
        )}
      </div>
    </div>
  );
}
