import { diffLines, diffWords } from 'diff';

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
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
