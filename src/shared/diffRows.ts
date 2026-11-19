import type { DiffLine, DiffSide, FileDiff } from './diffReview';

export type ReviewRow =
  | { kind: 'line'; key: string; line: DiffLine }
  | { kind: 'collapsed'; key: string; count: number };

export interface CommentAnchor { side: DiffSide; startLine: number; endLine: number; quotedText: string }

function lineKey(line: DiffLine): string {
  return `${line.oldLine ?? '-'}:${line.newLine ?? '-'}`;
}

export function buildReviewRows(
  file: FileDiff,
  options: { keep?: number; expanded: ReadonlySet<string>; expandAll: boolean },
): ReviewRow[] {
  const keep = options.keep ?? 3;
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  const rows: ReviewRow[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].kind !== 'context') {
      rows.push({ kind: 'line', key: lineKey(lines[index]), line: lines[index] });
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end].kind === 'context') end += 1;
    const run = lines.slice(index, end);
    const keepBefore = index === 0 ? 0 : keep;
    const keepAfter = end === lines.length ? 0 : keep;
    const hidden = run.length - keepBefore - keepAfter;
    const collapseKey = `gap:${lineKey(run[keepBefore] ?? run[0])}`;
    if (hidden > 0 && !options.expandAll && !options.expanded.has(collapseKey)) {
      for (const line of run.slice(0, keepBefore)) rows.push({ kind: 'line', key: lineKey(line), line });
      rows.push({ kind: 'collapsed', key: collapseKey, count: hidden });
      for (const line of run.slice(run.length - keepAfter)) rows.push({ kind: 'line', key: lineKey(line), line });
    } else {
      for (const line of run) rows.push({ kind: 'line', key: lineKey(line), line });
    }
    index = end;
  }
  return rows;
}

export function fileDiffFromText(rootPath: string, path: string, text: string, status?: 'added'): FileDiff {
  const textLines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const added = status === 'added';
  const lines: DiffLine[] = textLines.map((value, i) => added
    ? { kind: 'add', oldLine: null, newLine: i + 1, text: value }
    : { kind: 'context', oldLine: i + 1, newLine: i + 1, text: value });
  return {
    rootPath, path, status: added ? 'added' : 'modified',
    additions: added ? lines.length : 0, deletions: 0, binary: false,
    hunks: [{ oldStart: added ? 0 : 1, newStart: 1, lines }],
  };
}

export function anchorForLines(lines: DiffLine[]): CommentAnchor | null {
  if (lines.length === 0) return null;
  const newSide = lines.filter((line) => line.newLine !== null);
  const side: DiffSide = newSide.length > 0 ? 'new' : 'old';
  const chosen = side === 'new' ? newSide : lines;
  const numbers = chosen.map((line) => (side === 'new' ? line.newLine : line.oldLine)!);
  return {
    side,
    startLine: Math.min(...numbers),
    endLine: Math.max(...numbers),
    quotedText: chosen.map((line) => line.text).join('\n'),
  };
}
