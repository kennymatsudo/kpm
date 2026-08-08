/**
 * Resolves a project-relative path against the workspace and opens it in the
 * embedded editor.
 *
 * Lookup order is the current project's own files first, then each connected repo.
 */

import { useCallback, useState } from 'react';
import {
  emit,
  toast,
  useProjectDomainStore,
  useResourceDomainStore,
  useWorkspaceStore,
} from '../../stores';
import { readWorkspaceFile } from '../../services/workspaceFileService';

export function useWorkspaceFileOpener() {
  const repos = useResourceDomainStore((state) => state.repos);
  const projectId = useProjectDomainStore((state) => state.currentProjectId);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const [pending, setPending] = useState(false);

  const openPath = useCallback(
    async (path: string) => {
      if (pending) return;

      setPending(true);
      try {
        const sources: { source: string; projectId: string | null }[] = [];
        if (projectId) sources.push({ source: 'project', projectId });
        for (const repo of repos) sources.push({ source: repo.id, projectId: null });

        for (const { source, projectId: pid } of sources) {
          try {
            const content = await readWorkspaceFile(source, path, pid);
            openFile(source, path, content);
            // The editor only exists in the workspace view, and chat is
            // reachable from the planning view too, so surface it.
            emit({ type: 'navigate-to-view', payload: { view: 'workspace' } });
            return;
          } catch {
            // Not in this source — try the next.
          }
        }
        toast.error(`File not found: ${path}`);
      } finally {
        setPending(false);
      }
    },
    [pending, projectId, repos, openFile]
  );

  return { openPath, pending };
}
