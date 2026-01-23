
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
}

export function computeDiff(oldContent: string | null, newContent: string): DiffLine[] {
}

/**
 */
  const diffLines = useMemo(() => {
    if (diffLinesProp) return diffLinesProp;
    return computeDiff(oldContent, newContent);
  }, [diffLinesProp, oldContent, newContent]);

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
