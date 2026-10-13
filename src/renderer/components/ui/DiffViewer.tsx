import { useEffect, useMemo, useRef } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import type { ReactDiffViewerStylesOverride } from 'react-diff-viewer-continued';
import { computeDiff, type DiffLine } from './diffHelpers';

/**
 * DiffViewer Component
 *
 * Reusable inline diff viewer showing line-by-line changes between old and new content.
 */

export interface DiffViewerProps {
  /** Original content (null for new files) */
  oldContent: string | null;
  /** New content to display */
  newContent: string;
  /** Optional precomputed diff lines to avoid recomputation */
  diffLines?: DiffLine[];
  /** Auto-scroll the nearest scrollable parent to the first changed line on mount */
  autoScrollToFirstChange?: boolean;
}

function findScrollableParent(element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * DiffViewer component displays inline diffs using a packaged renderer while
 * keeping KPM's existing diff helpers for summary counts and compatibility.
 */
export function DiffViewer({ oldContent, newContent, diffLines: diffLinesProp, autoScrollToFirstChange }: DiffViewerProps) {
  const diffLines = useMemo(() => {
    if (diffLinesProp) return diffLinesProp;
    return computeDiff(oldContent, newContent);
  }, [diffLinesProp, oldContent, newContent]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScrollToFirstChange || !containerRef.current) return;

    const firstChangedIndex = diffLines.findIndex((line) => line.type !== 'unchanged');
    if (firstChangedIndex === -1) return;

    let cancelled = false;
    let attempts = 0;

    const scrollToFirstChange = () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;
      const row = container.querySelectorAll<HTMLElement>('table tbody tr')[firstChangedIndex];
      // ReactDiffViewer renders the table after its own effects; retry briefly until rows exist.
      if (!row) {
        if (attempts++ < 20) requestAnimationFrame(scrollToFirstChange);
        return;
      }
      const scrollParent = findScrollableParent(container);
      if (!scrollParent) {
        row.scrollIntoView({ block: 'center' });
        return;
      }
      const parentRect = scrollParent.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const target =
        scrollParent.scrollTop + (rowRect.top - parentRect.top) - parentRect.height / 2 + rowRect.height / 2;
      scrollParent.scrollTop = Math.max(0, target);
    };

    requestAnimationFrame(scrollToFirstChange);
    return () => {
      cancelled = true;
    };
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
