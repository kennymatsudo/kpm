
/**
 * DiffViewer Component
 *
 * Reusable inline diff viewer showing line-by-line changes between old and new content.
 */

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
}

interface DiffViewerProps {
  /** Original content (null for new files) */
  oldContent: string | null;
  /** New content to display */
  newContent: string;
  /** Optional precomputed diff lines to avoid recomputation */
  diffLines?: DiffLine[];
  /** Auto-scroll the nearest scrollable parent to the first changed line on mount */
  autoScrollToFirstChange?: boolean;
}

export function computeDiff(oldContent: string | null, newContent: string): DiffLine[] {
}

/**
 */
export function DiffViewer({ oldContent, newContent, diffLines: diffLinesProp, autoScrollToFirstChange }: DiffViewerProps) {
  const diffLines = useMemo(() => {
    if (diffLinesProp) return diffLinesProp;
    return computeDiff(oldContent, newContent);
  }, [diffLinesProp, oldContent, newContent]);

  useEffect(() => {
  }, [autoScrollToFirstChange, diffLines]);

  return (
    </div>
  );
}

/**
 * Get diff statistics for summary display.
 */
export function getDiffStats(oldContent: string | null, newContent: string): {
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
} {
  return getDiffStatsFromDiff(computeDiff(oldContent, newContent));
}

/**
 * Get diff statistics from precomputed diff lines.
 */
export function getDiffStatsFromDiff(diffLines: DiffLine[]): {
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
} {
  return {
    addedCount: diffLines.filter((line) => line.type === 'added').length,
    removedCount: diffLines.filter((line) => line.type === 'removed').length,
    unchangedCount: diffLines.filter((line) => line.type === 'unchanged').length,
  };
}

/**
 * InlineDiff types and component for word-based inline diffs.
 * Used for showing changes within text fields (vs line-based DiffViewer).
 */
export interface InlineDiffHunk {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

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
