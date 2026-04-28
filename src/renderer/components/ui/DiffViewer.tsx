import { useEffect, useMemo, useRef } from 'react';
import { diffLines, diffWords } from 'diff';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import type { ReactDiffViewerStylesOverride } from 'react-diff-viewer-continued';

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
  return diffLines(oldContent ?? '', newContent, { stripTrailingCr: true }).flatMap((change) => {
    const type: DiffLine['type'] = change.added
      ? 'added'
      : change.removed
        ? 'removed'
        : 'unchanged';

    return change.value
      .split(/\r?\n/)
      .filter((line, index, lines) => !(index === lines.length - 1 && line === ''))
      .map((content) => ({ type, content }));
  });
}

/**
 * DiffViewer component displays inline diffs using a packaged renderer while
 */
export function DiffViewer({ oldContent, newContent, diffLines: diffLinesProp, autoScrollToFirstChange }: DiffViewerProps) {
  const diffLines = useMemo(() => {
    if (diffLinesProp) return diffLinesProp;
    return computeDiff(oldContent, newContent);
  }, [diffLinesProp, oldContent, newContent]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScrollToFirstChange || !containerRef.current) return;

  }, [autoScrollToFirstChange, diffLines]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-x-auto overflow-y-hidden border border-border-subtle bg-surface-1 shadow-sm"
      data-kpm-diff-viewer
    >
      <ReactDiffViewer
        oldValue={oldContent ?? ''}
        newValue={newContent}
        splitView={false}
        compareMethod={DiffMethod.LINES}
        showDiffOnly={false}
        hideLineNumbers
        hideSummary
        styles={diffViewerStyles}
      />
    </div>
  );
}

const diffViewerStyles = {
  variables: {
    light: {
      diffViewerBackground: 'var(--color-surface-1)',
      diffViewerColor: 'var(--color-text-secondary)',
      addedBackground: 'color-mix(in srgb, var(--color-success) 12%, transparent)',
      addedColor: 'var(--color-success)',
      removedBackground: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
      removedColor: 'var(--color-danger)',
      addedGutterBackground: 'color-mix(in srgb, var(--color-success) 16%, var(--color-surface-2))',
      removedGutterBackground: 'color-mix(in srgb, var(--color-danger) 16%, var(--color-surface-2))',
      gutterBackground: 'var(--color-surface-2)',
      gutterColor: 'var(--color-text-muted)',
      highlightBackground: 'color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-2))',
      highlightGutterBackground: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-surface-2))',
      wordAddedBackground: 'color-mix(in srgb, var(--color-success) 18%, transparent)',
      wordRemovedBackground: 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
      emptyLineBackground: 'var(--color-surface-1)',
    },
  },
  diffContainer: {
    fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace)',
    fontSize: 'var(--text-xs)',
    lineHeight: 1.6,
    width: '100%',
    minWidth: '100%',
    tableLayout: 'fixed',
  },
  content: {
    width: '100%',
    overflowX: 'auto',
  },
  line: {
    transition: 'background-color 150ms ease',
  },
  gutter: {
    minWidth: 0,
    padding: 0,
    border: 'none',
  },
  marker: {
    width: '2.25rem',
    minWidth: '2.25rem',
    textAlign: 'center',
    fontWeight: 600,
    borderLeft: '3px solid transparent',
    padding: '0.25rem 0.5rem',
  },
  diffAdded: {
    borderLeftColor: 'var(--color-success)',
  },
  diffRemoved: {
    borderLeftColor: 'var(--color-danger)',
  },
  lineContent: {
    width: '100%',
    padding: '0.25rem 1rem 0.25rem 0.25rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'inherit',
  },
  contentText: {
    display: 'block',
    width: '100%',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  highlightedLine: {
    boxShadow: 'inset 3px 0 0 var(--color-accent)',
  },
  wordAdded: {
    borderRadius: '0.25rem',
  },
  wordRemoved: {
    borderRadius: '0.25rem',
  },
} as const satisfies ReactDiffViewerStylesOverride;

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

export function getInlineDiffHunks(oldValue: string | null, newValue: string | null): InlineDiffHunk[] {
  const oldStr = oldValue ?? '';
  const newStr = newValue ?? '';

  if (oldStr === newStr) {
    return [{ type: 'equal', value: oldStr }];
  }

  return diffWords(oldStr, newStr).map((change) => ({
    type: change.added ? 'insert' : change.removed ? 'delete' : 'equal',
    value: change.value,
  }));
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
