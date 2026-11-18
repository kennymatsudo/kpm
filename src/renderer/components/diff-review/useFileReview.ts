import { useEffect, useMemo, useState } from 'react';
import type { FileDiff } from '../../../shared/diffReview';
import { fileDiffFromText } from '../../../shared/diffRows';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';
import { getDiff } from '../../services/diffReviewService';
import { useChatStore } from '../../stores/chat';
import { useDiffReviewStore } from '../../stores/diffReviewStore';
import { useProjectDomainStore, useResourceDomainStore } from '../../stores/projectDomains';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { latestTurnForFile } from './latestTurnForFile';

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
}

interface TurnDiffState {
  key: string;
  file: FileDiff | null;
  error: string | null;
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

  const [turnDiff, setTurnDiff] = useState<TurnDiffState | null>(null);
  const requestKey =
    active && projectId && chatSessionId && rootPath && path && clientMessageId
      ? [projectId, chatSessionId, clientMessageId, rootPath, path, savedContent].join('\u0000')
      : null;

  useEffect(() => {
    if (!requestKey || !projectId || !chatSessionId || !rootPath || !path || !clientMessageId) return;
    let cancelled = false;
    void getDiff({ projectId, chatSessionId, scope: 'turn', clientMessageId, rootPath, filePath: path }).then(
      (result) => {
        if (cancelled) return;
        if (!result.success) {
          setTurnDiff({ key: requestKey, file: null, error: result.error });
          return;
        }
        const match = result.files.find((f) => f.rootPath === rootPath && f.path === path) ?? null;
        setTurnDiff({ key: requestKey, file: match, error: null });
      },
    );
    return () => {
      cancelled = true;
    };
    // content is read through requestKey (savedContent), not on every keystroke.
  }, [requestKey, projectId, chatSessionId, rootPath, path, clientMessageId]);

  const current = turnDiff?.key === requestKey ? turnDiff : null;
  const turnFile = current?.file ?? null;

  const textFile = useMemo(
    () => (active && !turnFile && rootPath && path ? fileDiffFromText(rootPath, path, content) : null),
    [active, turnFile, rootPath, path, content],
  );

  return {
    file: turnFile ?? textFile,
    path,
    chatSessionId,
    rootPath,
    hasTurnDiff: turnFile !== null,
    error: current?.error ?? null,
  };
}
