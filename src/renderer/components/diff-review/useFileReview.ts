import { useEffect, useMemo, useReducer } from 'react';
import type { FileDiff } from '../../../shared/diffReview';
import { fileDiffFromText } from '../../../shared/diffRows';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';
import { getDiff } from '../../services/diffReviewService';
import { useChatStore } from '../../stores/chat';
import { useDiffReviewStore } from '../../stores/diffReviewStore';
import { useProjectDomainStore, useResourceDomainStore } from '../../stores/projectDomains';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { latestTurnForFile } from './latestTurnForFile';
import { initialTurnDiffState, turnDiffReducer, viewTurnDiff } from './turnDiffState';

interface FileReview {
  /** Null until `active`, and when the file has no resolvable root. */
  file: FileDiff | null;
  path: string | null;
  chatSessionId: string | null;
  rootPath: string | null;
  /** True when `file` comes from the latest reply's diff. */
  hasTurnDiff: boolean;
  /** Why the reply's diff could not be loaded; `file` is then the plain text. */
  error: string | null;
  /** A turn diff is being fetched for the first time; show a loading state. */
  loading: boolean;
}

/**
 * The diff the Comment view shows. It reads the latest reply's diff for this file
 * and falls back to the file's text. Work happens only while `active`, and
 * the diff follows the saved content, so typing does not recompute it.
 */
export function useFileReview(documentId: string, active: boolean): FileReview {
  const document = useWorkspaceStore((s) => s.openDocuments.find((d) => d.id === documentId));
  const source = document?.source;
  const path = document?.path ?? null;
  const content = document?.content ?? '';
  const savedContent = document?.originalContent;
  const chatSessionId = useChatStore((s) => s.viewedSessionId);
  const projectId = useProjectDomainStore((s) => s.currentProjectId);
  const folderPath = useProjectDomainStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId)?.folder_path ?? null,
  );
  const repo = useResourceDomainStore((s) =>
    source && source !== 'project' ? s.repos.find((r) => r.id === source) : undefined,
  );
  const turns = useDiffReviewStore((s) => (chatSessionId ? s.turnChangesBySession[chatSessionId] : undefined));

  const rootPath = source === 'project' ? folderPath : repo ? resolveEffectiveRepoPath(repo) : null;
  const clientMessageId = useMemo(
    () => (rootPath && path ? latestTurnForFile(turns, rootPath, path)?.clientMessageId ?? null : null),
    [turns, rootPath, path],
  );

  const [turnDiff, dispatch] = useReducer(turnDiffReducer, initialTurnDiffState);
  const identity = clientMessageId && rootPath && path && chatSessionId ? [chatSessionId, clientMessageId, rootPath, path].join('\u0000') : null;
  const requestKey = active && identity ? `${identity}\u0000${savedContent}` : null;

  useEffect(() => {
    if (!requestKey || !identity || !projectId || !chatSessionId || !rootPath || !path || !clientMessageId) return;
    let cancelled = false;
    dispatch({ type: 'start', identity, key: requestKey });
    const fail = (error: string) => {
      if (!cancelled) dispatch({ type: 'failure', key: requestKey, error });
    };
    getDiff({ projectId, chatSessionId, scope: 'turn', clientMessageId, rootPath, filePath: path })
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          fail(result.error);
          return;
        }
        const match = result.files.find((f) => f.rootPath === rootPath && f.path === path) ?? null;
        dispatch({ type: 'success', key: requestKey, file: match });
      })
      .catch((err: unknown) => fail(err instanceof Error ? err.message : 'Could not load the reply\'s changes.'));
    return () => {
      cancelled = true;
    };
    // content is read through requestKey (savedContent), not on every keystroke.
  }, [requestKey, identity, projectId, chatSessionId, rootPath, path, clientMessageId]);

  const view = requestKey && identity ? viewTurnDiff(turnDiff, identity) : null;
  const turnFile = view?.file ?? null;
  const loading = view?.loading ?? false;

  const textFile = useMemo(
    () => (active && !turnFile && !loading && rootPath && path ? fileDiffFromText(rootPath, path, content) : null),
    [active, turnFile, loading, rootPath, path, content],
  );

  return {
    file: turnFile ?? textFile,
    path,
    chatSessionId,
    rootPath,
    hasTurnDiff: turnFile !== null,
    error: view?.error ?? null,
    loading,
  };
}
