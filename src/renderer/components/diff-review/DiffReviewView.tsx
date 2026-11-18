import { Fragment, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DiffLine, DiffReviewComment, FileDiff } from '../../../shared/diffReview';
import { anchorForLines, buildReviewRows } from '../../../shared/diffRows';
import { useDiffReviewStore } from '../../stores/diffReviewStore';
import { PlusIcon } from '../icons';
import { CommentBox } from './CommentBox';
import { useLineSelection } from './useLineSelection';
import { useSyntaxColors } from './useSyntaxColors';

interface DiffReviewViewProps {
  file: FileDiff;
  projectId: string;
  chatSessionId: string | null;
  expandAll: boolean;
}

const NO_COMMENTS: DiffReviewComment[] = [];

function rowClass(kind: DiffLine['kind'], selected: boolean): string {
  if (selected) return 'bg-accent-subtle';
  if (kind === 'add') return 'bg-success-muted';
  if (kind === 'del') return 'bg-danger-muted';
  return '';
}

function headingFor(lines: DiffLine[]): string {
  const anchor = anchorForLines(lines);
  if (!anchor) return 'Comment';
  const prefix = anchor.side === 'new' ? 'R' : 'L';
  return anchor.startLine === anchor.endLine
    ? `Comment on line ${prefix}${anchor.endLine}`
    : `Comment on lines ${prefix}${anchor.startLine}-${prefix}${anchor.endLine}`;
}

interface SideText {
  text: string[];
  index: Map<number, number>;
}

function sideTexts(file: FileDiff): { oldSide: SideText; newSide: SideText } {
  const oldSide: SideText = { text: [], index: new Map() };
  const newSide: SideText = { text: [], index: new Map() };
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== 'add' && line.oldLine !== null) {
        oldSide.index.set(line.oldLine, oldSide.text.length);
        oldSide.text.push(line.text);
      }
      if (line.kind !== 'del' && line.newLine !== null) {
        newSide.index.set(line.newLine, newSide.text.length);
        newSide.text.push(line.text);
      }
    }
  }
  return { oldSide, newSide };
}

export function DiffReviewView({ file, projectId, chatSessionId, expandAll }: DiffReviewViewProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const rows = useMemo(() => buildReviewRows(file, { expanded, expandAll }), [file, expanded, expandAll]);
  const rowKeys = useMemo(() => rows.map((r) => r.key), [rows]);
  const { oldSide, newSide } = useMemo(() => sideTexts(file), [file]);
  const oldColors = useSyntaxColors(file.path, oldSide.text);
  const newColors = useSyntaxColors(file.path, newSide.text);
  const { selection, committed, start, extend, finish, clear } = useLineSelection(rowKeys);

  const sessionComments = useDiffReviewStore((state) =>
    chatSessionId ? (state.commentsBySession[chatSessionId] ?? NO_COMMENTS) : NO_COMMENTS,
  );
  const { editComment, removeComment } = useDiffReviewStore(
    useShallow((state) => ({
      editComment: state.editComment,
      removeComment: state.removeComment,
    })),
  );
  const fileComments = useMemo(
    () => sessionComments.filter((c) => c.rootPath === file.rootPath && c.filePath === file.path),
    [sessionComments, file.rootPath, file.path],
  );

  if (file.binary) {
    return <div className="p-3 text-sm text-text-tertiary">Binary file not shown.</div>;
  }

  const lineAt = (index: number): DiffLine | null => {
    const row = rows[index];
    return row?.kind === 'line' ? row.line : null;
  };
  const selectedLines = (range: { start: number; end: number }): DiffLine[] => {
    const out: DiffLine[] = [];
    for (let i = range.start; i <= range.end; i += 1) {
      const line = lineAt(i);
      if (line) out.push(line);
    }
    return out;
  };

  const submitNew = async (body: string) => {
    if (!chatSessionId || !committed) return;
    const anchor = anchorForLines(selectedLines(committed));
    if (!anchor) return;
    const saved = await useDiffReviewStore.getState().addComment({
      projectId,
      chatSessionId,
      rootPath: file.rootPath,
      filePath: file.path,
      ...anchor,
      body,
    });
    if (saved) clear();
  };

  const coloredHtml = (line: DiffLine): string | null => {
    if (line.kind === 'del') {
      const at = line.oldLine === null ? undefined : oldSide.index.get(line.oldLine);
      return at === undefined ? null : (oldColors?.[at] ?? null);
    }
    const at = line.newLine === null ? undefined : newSide.index.get(line.newLine);
    return at === undefined ? null : (newColors?.[at] ?? null);
  };

  const commentsEndingAt = (line: DiffLine): DiffReviewComment[] =>
    fileComments.filter(
      (c) =>
        c.endLine === (c.side === 'new' ? line.newLine : line.oldLine) &&
        (c.side === 'new' ? line.newLine !== null : line.newLine === null),
    );

  return (
    <div onMouseUp={finish}>
      {!chatSessionId && <div className="px-3 py-1 text-xs text-text-tertiary">Open a chat to comment.</div>}
      <table className="w-full border-collapse font-mono text-xs">
        <colgroup>
          <col className="w-12" />
          <col className="w-12" />
          <col className="w-5" />
          <col />
        </colgroup>
        <tbody>
          {rows.map((row, index) => {
            if (row.kind === 'collapsed') {
              return (
                <tr key={row.key}>
                  <td colSpan={4} className="p-0">
                    <button
                      type="button"
                      className="w-full bg-surface-1 px-3 py-1 text-left text-text-tertiary hover:text-text-primary"
                      onClick={() => setExpanded((prev) => new Set(prev).add(row.key))}
                    >
                      {row.count} unmodified {row.count === 1 ? 'line' : 'lines'}
                    </button>
                  </td>
                </tr>
              );
            }
            const { line } = row;
            const html = coloredHtml(line);
            const selected = selection !== null && index >= selection.start && index <= selection.end;
            const gutterOnOld = line.kind === 'del';
            const gutter = chatSessionId ? (
              <button
                type="button"
                aria-label="Add a comment"
                className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-sm bg-accent text-text-on-accent group-hover:block"
                onMouseDown={(event) => {
                  event.preventDefault();
                  start(row.key, event.shiftKey);
                }}
              >
                <PlusIcon className="h-3 w-3" />
              </button>
            ) : null;
            const showBox = committed !== null && chatSessionId !== null && index === committed.end;
            return (
              <Fragment key={row.key}>
                <tr className={`group ${rowClass(line.kind, selected)}`} onMouseEnter={() => extend(row.key)}>
                  <td className="relative select-none pr-2 text-right text-text-tertiary">
                    {gutterOnOld && gutter}
                    {line.oldLine}
                  </td>
                  <td className="relative select-none pr-2 text-right text-text-tertiary">
                    {!gutterOnOld && gutter}
                    {line.newLine}
                  </td>
                  <td className="select-none text-center text-text-tertiary">
                    {line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ''}
                  </td>
                  {html !== null ? (
                    <td
                      className="whitespace-pre-wrap break-all pr-3 text-text-primary"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  ) : (
                    <td className="whitespace-pre-wrap break-all pr-3 text-text-primary">{line.text}</td>
                  )}
                </tr>
                {commentsEndingAt(line).map((comment) => (
                  <tr key={comment.id}>
                    <td colSpan={4} className="px-3 py-2 font-sans">
                      {editingId === comment.id ? (
                        <CommentBox
                          initialBody={comment.body}
                          heading={`Edit comment on ${comment.side === 'new' ? 'R' : 'L'}${comment.endLine}`}
                          onSubmit={(body) => {
                            void editComment(comment.id, comment.chatSessionId, body).then((saved) => {
                              if (saved) setEditingId(null);
                            });
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <div className="rounded-md border border-border-subtle bg-surface-1 p-2 text-sm">
                          <div className="font-medium text-text-primary">You</div>
                          <div className="whitespace-pre-wrap text-text-secondary">{comment.body}</div>
                          <div className="mt-1 flex gap-2 text-xs">
                            <button
                              type="button"
                              className="text-text-tertiary hover:text-text-primary"
                              onClick={() => setEditingId(comment.id)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-danger"
                              onClick={() => void removeComment(comment.id, comment.chatSessionId)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {showBox && (
                  <tr>
                    <td colSpan={4} className="px-3 py-2">
                      <CommentBox
                        heading={headingFor(selectedLines(committed))}
                        onSubmit={(body) => void submitNew(body)}
                        onCancel={clear}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
