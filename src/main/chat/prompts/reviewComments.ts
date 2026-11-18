import type { DiffReviewComment } from '../../../shared/diffReview';

const MAX_QUOTE_LINES = 10;

export function relocateComment(
  comment: DiffReviewComment,
  currentText: string | null,
): { comment: DiffReviewComment; changed: boolean } {
  if (comment.side === 'old') return { comment, changed: false };
  if (currentText === null) return { comment, changed: true };

  const fileLines = currentText.split('\n');
  const quoted = comment.quotedText.split('\n');
  const matches: number[] = [];
  for (let start = 0; start + quoted.length <= fileLines.length; start += 1) {
    if (quoted.every((line, offset) => fileLines[start + offset] === line)) matches.push(start + 1);
  }
  if (matches.length === 0) return { comment, changed: true };

  const nearest = matches.reduce((best, line) =>
    Math.abs(line - comment.startLine) < Math.abs(best - comment.startLine) ? line : best,
  );
  if (nearest === comment.startLine) return { comment, changed: false };
  return {
    comment: { ...comment, startLine: nearest, endLine: nearest + quoted.length - 1 },
    changed: false,
  };
}

function joinPath(rootPath: string, filePath: string): string {
  return `${rootPath.replace(/\/+$/, '')}/${filePath}`;
}

export function formatReviewCommentBlock(items: { comment: DiffReviewComment; changed: boolean }[]): string {
  const lines = [`Review comments (${items.length}):`];
  items.forEach(({ comment, changed }, index) => {
    const range = comment.startLine === comment.endLine ? `${comment.startLine}` : `${comment.startLine}-${comment.endLine}`;
    const notes = [comment.side === 'old' ? 'removed lines' : null, changed ? 'this text has changed since the comment' : null]
      .filter(Boolean)
      .join(', ');
    lines.push(`${index + 1}. ${joinPath(comment.rootPath, comment.filePath)}:${range}${notes ? ` (${notes})` : ''}`);
    const quoted = comment.quotedText.split('\n');
    for (const line of quoted.slice(0, MAX_QUOTE_LINES)) lines.push(`   > ${line}`);
    if (quoted.length > MAX_QUOTE_LINES) lines.push(`   (${quoted.length - MAX_QUOTE_LINES} more lines)`);
    for (const line of comment.body.split('\n')) lines.push(`   ${line}`);
  });
  return lines.join('\n');
}
