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
        <span className="text-tiny font-semibold text-text-muted uppercase tracking-wider">{label}</span>
        {!isCreate && !hasChanges && (
          <span className="text-xxs text-text-tertiary px-1.5 py-0.5 rounded bg-surface-3">(no changes)</span>
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
  onConfigureMappings?: () => void;
}

/**
 * Displays a status transition for sync review.
 * Shows current Jira status → target KPM category with transition info or warning.
 */
export function StatusTransitionView({ transition, onConfigureMappings }: StatusTransitionViewProps) {
  const targetConfig = STATUS_CATEGORY_CONFIG[transition.targetCategory];
  const hasUnresolvedTransition = !transition.availableTransition && !!transition.warning;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xxs font-semibold text-text-muted uppercase tracking-wider">Status</span>
        {transition.warning && (
          <span className="text-xxs font-medium px-1.5 py-0.5 rounded bg-warning/15 text-warning">
            {hasUnresolvedTransition ? 'Action needed' : 'Multi-step'}
          </span>
        )}
        {onConfigureMappings && (
          <button
            type="button"
            onClick={onConfigureMappings}
            className="ml-auto inline-flex items-center gap-1 text-xxs font-medium text-text-tertiary hover:text-accent transition-colors cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure mappings
          </button>
        )}
      </div>
      <div className="p-3 rounded-lg bg-surface-1 border border-border-subtle">
        <div className="flex items-center gap-2">
          {/* Current status */}
          <span className="px-2 py-1 rounded text-tiny font-medium bg-surface-2 text-text-secondary border border-border-subtle">
            {transition.currentStatus}
          </span>

          {/* Arrow */}
          <svg className="w-4 h-4 text-text-tertiary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>

          {/* Target status */}
          <span className={`px-2 py-1 rounded text-tiny font-medium ${targetConfig.bgClass} ${targetConfig.textClass}`}>
            {transition.availableTransition?.to.name || targetConfig.label}
          </span>
        </div>

        {/* Warning message */}
        {transition.warning && (
          <div className="mt-2 p-2 rounded bg-warning/8 border border-warning/15">
            <p className="text-xxs text-text-secondary leading-snug">{transition.warning}</p>
          </div>
        )}
      </div>
    </div>
  );
}
