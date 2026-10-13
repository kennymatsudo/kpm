import type { InlineDiffHunk } from './diffHelpers';

interface InlineDiffProps {
  /** Array of diff hunks to render */
  hunks: InlineDiffHunk[];
  /** Additional class names */
  className?: string;
}

/**
 * InlineDiff component for rendering word-based diffs inline.
 * Shows insertions in green, deletions in red with strikethrough, and unchanged text normally.
 *
 * @example
 * ```tsx
 * import { diffWords } from 'diff';
 *
 * const hunks = diffWords(oldText, newText).map(change => ({
 *   type: change.added ? 'insert' : change.removed ? 'delete' : 'equal',
 *   value: change.value,
 * }));
 *
 * <InlineDiff hunks={hunks} />
 * ```
 */
export function InlineDiff({ hunks, className = '' }: InlineDiffProps) {
  return (
    <span className={`text-xs whitespace-pre-wrap break-words leading-relaxed ${className}`}>
      {hunks.map((hunk, index) => {
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
    </span>
  );
}
