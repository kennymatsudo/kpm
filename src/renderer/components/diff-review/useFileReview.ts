import { useMemo } from 'react';
import type { FileDiff } from '../../../shared/diffReview';
import { fileDiffFromText } from '../../../shared/diffRows';
import { resolveEffectiveRepoPath } from '../../../shared/repoPath';
import { useChatStore } from '../../stores/chat';
import { useProjectDomainStore, useResourceDomainStore } from '../../stores/projectDomains';
import { useWorkspaceStore } from '../../stores/workspaceStore';

interface FileReview {
  file: FileDiff | null;
  chatSessionId: string | null;
  rootPath: string | null;
}

export function useFileReview(documentId: string): FileReview {
  const document = useWorkspaceStore((s) => s.openDocuments.find((d) => d.id === documentId));
  const source = document?.source;
  const path = document?.path;
  const content = document?.content ?? '';
  const chatSessionId = useChatStore((s) => s.viewedSessionId);
  const folderPath = useProjectDomainStore((s) =>
    s.projects.find((p) => p.id === s.currentProjectId)?.folder_path ?? null,
  );
  const repo = useResourceDomainStore((s) =>
    source && source !== 'project' ? s.repos.find((r) => r.id === source) : undefined,
  );

  const rootPath = source === 'project' ? folderPath : repo ? resolveEffectiveRepoPath(repo) : null;

  const file = useMemo(
    () => (rootPath && path ? fileDiffFromText(rootPath, path, content) : null),
    [rootPath, path, content],
  );

  return { file, chatSessionId, rootPath };
}
