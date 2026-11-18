import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { DiffScope } from '../../../shared/diffReview';
import { getDiff } from '../../services/diffReviewService';
import { useDiffReviewStore } from '../../stores/diffReviewStore';
import { Select, SelectContent, SelectItem, SelectItemText, SelectTrigger, SelectValue } from '../ui/Select';
import { ChangesFileSection } from './ChangesFileSection';
import { ChangesFileTree } from './ChangesFileTree';
import { INITIAL_CHANGES_FETCH, changesFetchReducer } from './changesFetch';
import { buildChangesTree, countCommentsByFile, fileKey, totalsFor } from './changesTree';

const NO_COMMENTS: never[] = [];

/** Every file the chosen scope changed, in one scroll. */
export function ChangesView({ projectId }: { projectId: string }) {
  const target = useDiffReviewStore((state) => state.changesTab);
  const chatSessionId = target?.chatSessionId ?? null;
  const clientMessageId = target?.clientMessageId ?? null;
  const scope = target?.scope ?? 'uncommitted';
  const comments = useDiffReviewStore((state) =>
    chatSessionId ? (state.commentsBySession[chatSessionId] ?? NO_COMMENTS) : NO_COMMENTS,
  );
  const [{ load }, dispatch] = useReducer(changesFetchReducer, INITIAL_CHANGES_FETCH);
  const sections = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!chatSessionId) return;
    // The reducer drops a result whose key is no longer current.
    const key = [projectId, chatSessionId, scope, clientMessageId].join('|');
    dispatch({ type: 'start', key });
    getDiff({ projectId, chatSessionId, scope, clientMessageId: clientMessageId ?? undefined })
      .then((result) =>
        dispatch(
          result.success
            ? { type: 'success', key, files: result.files }
            : { type: 'failure', key, error: result.error },
        ),
      )
      .catch(() => dispatch({ type: 'failure', key, error: 'Could not load changes.' }));
  }, [projectId, chatSessionId, scope, clientMessageId]);

  const files = load.status === 'ready' ? load.files : null;
  const commentCounts = useMemo(() => countCommentsByFile(comments), [comments]);
  const tree = useMemo(() => (files ? buildChangesTree(files, commentCounts) : []), [files, commentCounts]);
  const totals = useMemo(() => totalsFor(files ?? []), [files]);

  const scrollTo = useCallback((key: string) => {
    sections.current.get(key)?.scrollIntoView({ block: 'start' });
  }, []);

  const focusFile = target?.focusFile;
  const focusedFor = useRef<unknown>(null);
  useEffect(() => {
    if (!files || !focusFile || focusedFor.current === focusFile) return;
    focusedFor.current = focusFile;
    scrollTo(fileKey(focusFile.rootPath, focusFile.path));
  }, [files, focusFile, scrollTo]);

  if (!target || !chatSessionId) return null;

  const setScope = (next: DiffScope) => {
    useDiffReviewStore.getState().setChangesTab({ ...target, scope: next, focusFile: undefined });
  };

  if (load.status === 'loading') {
    return <div className="p-4 text-sm text-text-muted">Loading changes</div>;
  }
  if (load.status === 'error') {
    return (
      <ChangesError
        error={load.error}
        scope={scope}
        canSelectTurn={clientMessageId !== null}
        onScope={setScope}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChangesHeader
        scope={scope}
        canSelectTurn={clientMessageId !== null}
        onScope={setScope}
        files={totals.files}
        additions={totals.additions}
        deletions={totals.deletions}
        commentCount={comments.length}
      />
      <div className="flex min-h-0 flex-1">
        <ChangesFileTree roots={tree} onSelect={scrollTo} />
        <div className="min-w-0 flex-1 overflow-y-auto">
          {load.files.length === 0 && <div className="p-4 text-sm text-text-muted">No changes</div>}
          {load.files.map((file) => {
            const key = fileKey(file.rootPath, file.path);
            return (
              <ChangesFileSection
                key={key}
                file={file}
                projectId={projectId}
                chatSessionId={chatSessionId}
                register={(element) => {
                  if (element) sections.current.set(key, element);
                  else sections.current.delete(key);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SCOPE_LABELS: Record<DiffScope, string> = {
  turn: 'This reply',
  chat: 'Whole chat',
  uncommitted: 'Uncommitted',
};

/** A failed load keeps the scope menu, so any scope can be left for another. */
export function ChangesError({
  error,
  scope,
  canSelectTurn,
  onScope,
}: {
  error: string;
  scope: DiffScope;
  canSelectTurn: boolean;
  onScope: (scope: DiffScope) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 p-4 text-sm text-text-secondary">
      <ScopeSelect scope={scope} canSelectTurn={canSelectTurn} onScope={onScope} />
      <span>{error}</span>
      {scope === 'turn' && (
        <button type="button" className="btn btn-secondary" onClick={() => onScope('uncommitted')}>
          Show uncommitted changes
        </button>
      )}
    </div>
  );
}

function ScopeSelect({
  scope,
  canSelectTurn,
  onScope,
}: {
  scope: DiffScope;
  canSelectTurn: boolean;
  onScope: (scope: DiffScope) => void;
}) {
  return (
    <Select value={scope} onValueChange={(value) => onScope(value as DiffScope)}>
      <SelectTrigger
        aria-label="Changes scope"
        className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-sm text-text-primary"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SCOPE_LABELS) as DiffScope[]).map((value) => (
          <SelectItem key={value} value={value} disabled={value === 'turn' && !canSelectTurn}>
            <SelectItemText>{SCOPE_LABELS[value]}</SelectItemText>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ChangesHeader({
  scope,
  canSelectTurn,
  onScope,
  files,
  additions,
  deletions,
  commentCount,
}: {
  scope: DiffScope;
  canSelectTurn: boolean;
  onScope: (scope: DiffScope) => void;
  files: number;
  additions: number;
  deletions: number;
  commentCount: number;
}) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-border-subtle px-3 py-2 text-sm">
      <ScopeSelect scope={scope} canSelectTurn={canSelectTurn} onScope={onScope} />
      <span className="text-text-primary">
        {files} {files === 1 ? 'file' : 'files'} changed
      </span>
      <span className="font-mono text-success">+{additions}</span>
      <span className="font-mono text-danger">-{deletions}</span>
      <span className="ml-auto text-text-muted">
        {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
      </span>
    </div>
  );
}
